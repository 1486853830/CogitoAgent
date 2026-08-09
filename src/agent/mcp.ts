import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_REGISTRY, isDangerousOperation } from './registry.ts';
import { getToolPermission } from './plugin.ts';
import { getToolAnnotations, objectArgsToPositional, paramsToSchema } from './tool-schema.ts';
import { loadConfig } from '../config.ts';
import type { JSONSchema, McpConfig, ToolParamDoc } from '../types/index.ts';

/**
 * MCP 集成（R4）。
 *
 * 双向能力：
 *  - 本地注册表对外暴露：以 stdio MCP Server 形式把本地工具共享给外部 MCP 客户端；
 *  - 外部 MCP Server 接入：把配置中声明的外部 MCP server 的工具注册进本地注册表，
 *    使其与本地工具一样参与原生工具调用协议。
 */

/** 本地 stdio MCP Server 运行时句柄（供注销/清理）。 */
export interface McpServerHandle {
  server: McpServer;
  transport: StdioServerTransport;
  close: () => Promise<void>;
}

/** 结构化工具参数形态（SDK 的 AnySchema 是宽松对象，这里只保留我们需要的形状）。 */
type ToolArgs = Record<string, unknown>;

interface ToolCallResultLike {
  content?: Array<{ type: string; text?: string; structuredContent?: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/** 外部 MCP server 的进程参数（来自配置）。 */
type McpServerParams = NonNullable<McpConfig['servers']>[string];

/** 已接入的外部 server 句柄。 */
interface ExternalClient {
  client: Client;
  transport: StdioClientTransport;
  tools: Set<string>; // 已注册到本地注册表的工具名
  /** 原始进程参数，断线后据此重建连接。 */
  params: McpServerParams;
}

const DEFAULT_PREFIX = 'mcp_';
const externalClients = new Map<string, ExternalClient>();

// 外部 MCP server 是独立进程，行为完全不可控：可能启动后不完成握手、
// 调用后永不返回、或一次返回上百 MB 文本。三道硬约束缺一不可。
const MCP_CONNECT_TIMEOUT_MS = 30000; // 建连 + 握手
const MCP_LIST_TOOLS_TIMEOUT_MS = 30000; // listTools
const MCP_CALL_TIMEOUT_MS = 120000; // 单次 callTool
const MAX_MCP_RESULT_CHARS = 100000; // 单次返回文本上限，超出截断
const MAX_RECONNECT_ATTEMPTS = 1; // 断线后自动重连次数

/**
 * 给 Promise 加超时。外部 MCP server 卡住时若不设超时，
 * 整个 Agent 会连同工具调用一起永久挂起。
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as unknown as { unref: () => void }).unref();
    }
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** 判断错误是否为"连接已断开"类，只有这类才值得重连重试。 */
function isConnectionError(error: unknown): boolean {
  const msg = ((error as Error)?.message || String(error)).toLowerCase();
  return (
    msg.includes('closed') ||
    msg.includes('not connected') ||
    msg.includes('disconnect') ||
    msg.includes('epipe') ||
    msg.includes('econnreset') ||
    msg.includes('write after end') ||
    msg.includes('超时')
  );
}

/** 校验外部 server 配置：command 必须是非空字符串，args/env 形态正确。 */
function isValidServerParams(params: unknown): params is McpServerParams {
  if (typeof params !== 'object' || params === null) return false;
  const p = params as { command?: unknown; args?: unknown; env?: unknown };
  if (typeof p.command !== 'string' || p.command.trim() === '') return false;
  if (p.args !== undefined && !Array.isArray(p.args)) return false;
  if (p.env !== undefined && (typeof p.env !== 'object' || p.env === null)) return false;
  return true;
}

/** 关闭一个外部 client 的 transport 与 client（吞掉关闭异常）。 */
async function closeQuietly(client: Client | null, transport: StdioClientTransport | null) {
  // 先关闭客户端再关闭传输层：client.close() 可能需要向 transport 发送
  // 关闭通知，若 transport 先被销毁则 notify 会丢失，导致客户端 hang。
  if (client) {
    try {
      await client.close();
    } catch {
      /* 忽略关闭错误 */
    }
  }
  if (transport) {
    try {
      await transport.close();
    } catch {
      /* 忽略关闭错误 */
    }
  }
}

/** 建立一条到外部 MCP server 的连接（带握手超时）。 */
async function connectExternal(
  serverName: string,
  params: McpServerParams,
): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport(params);
  const client = new Client(
    { name: 'cogito-agent-mcp-client', version: '1.0.0' },
    { capabilities: {} },
  );
  try {
    await withTimeout(
      client.connect(transport),
      MCP_CONNECT_TIMEOUT_MS,
      `连接外部 MCP server "${serverName}"`,
    );
  } catch (error) {
    // 握手失败必须回收子进程，否则每次重试都会残留一个孤儿进程。
    await closeQuietly(client, transport);
    throw error;
  }
  return { client, transport };
}

/** 把工具 Schema 的 properties 顺序转成 ToolParamDoc 列表。 */
function schemaToParamDocs(schema: JSONSchema | undefined): ToolParamDoc[] {
  if (!schema || !schema.properties) return [];
  const names = Object.keys(schema.properties);
  return names.map((name) => ({
    name,
    type: mapSchemaType(schema.properties?.[name]?.type),
    description: schema.properties?.[name]?.description,
    required: (schema.required || []).includes(name),
  }));
}

function mapSchemaType(type: JSONSchema['type']): ToolParamDoc['type'] {
  switch (type) {
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'any';
  }
}

/** 超出上限的文本按上限截断并附说明，避免单个外部工具撑爆上下文/内存。 */
function truncateResult(text: string): string {
  if (text.length <= MAX_MCP_RESULT_CHARS) return text;
  return (
    text.slice(0, MAX_MCP_RESULT_CHARS) +
    `\n\n... [外部 MCP 返回 ${text.length} 字符，超过 ${MAX_MCP_RESULT_CHARS} 上限，已截断]`
  );
}

/** 把 MCP callTool 结果归一化为文本摘要（带大小上限）。 */
function normalizeMcpCallResult(result: ToolCallResultLike): unknown {
  if (result.structuredContent !== undefined) {
    // 结构化结果同样可能是超大对象：先估算序列化体积，超限则降级为截断文本。
    let serialized: string;
    try {
      serialized = JSON.stringify(result.structuredContent);
    } catch {
      return result.structuredContent;
    }
    if (serialized.length <= MAX_MCP_RESULT_CHARS) return result.structuredContent;
    return truncateResult(serialized);
  }
  const texts = (result.content || [])
    .filter((c) => c.text)
    .map((c) => c.text)
    .filter(Boolean);
  return truncateResult(texts.join('\n'));
}

/**
 * 启动本地 MCP Server（stdio），把本地工具注册表对外暴露。
 * config.mcp 未开启或未配置时返回 null。
 */
export async function createLocalMcpServer(cfg?: McpConfig): Promise<McpServerHandle | null> {
  if (!cfg || cfg.enabled === false) return null;

  const server = new McpServer({
    name: cfg.serverName || 'cogito-agent',
    version: '1.0.0',
  });
  const prefix = cfg.prefix || '';

  for (const [toolName, entry] of Object.entries(TOOL_REGISTRY)) {
    const mcpToolName = `${prefix}${toolName}`;
    const schema: JSONSchema = entry.schema || paramsToSchema(entry.params || []);
    const description = entry.description || `本地工具 ${toolName}`;
    const annotations = getToolAnnotations(toolName);

    // SDK registerTool 的 inputSchema 接受 JSON 对象；这里按结构兼容适配。
    (
      server as unknown as {
        registerTool: (
          n: string,
          c: { description?: string; inputSchema?: unknown; annotations?: unknown },
          h: (args: ToolArgs) => Promise<ToolCallResultLike>,
        ) => void;
      }
    ).registerTool(
      mcpToolName,
      {
        description,
        inputSchema: schema as unknown,
        // R4.7：把 R1.7 的工具注解传播为 MCP toolAnnotations
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      },
      async (args) => {
        try {
          // 权限门禁：MCP 出口是独立于 Agent.executeTool 的第三条执行路径，
          // 必须自行校验，否则任何连上 stdio 的客户端都能绕过 tools.permissions
          // 直接调用 runPython / dropTable 等工具。
          // MCP 客户端无交互通道，无法发起授权询问，故 ask 与 deny 一并拒绝。
          const permission = getToolPermission(toolName);
          if (permission !== 'allow') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `[权限拒绝]: 工具 ${toolName} 的权限策略为 ${permission}，MCP 通道无交互授权能力，已拒绝执行`,
                },
              ],
              isError: true,
            };
          }
          if (isDangerousOperation(toolName)) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `[权限拒绝]: 工具 ${toolName} 属于危险操作，不允许通过 MCP 通道无人值守执行`,
                },
              ],
              isError: true,
            };
          }

          const positional = objectArgsToPositional(toolName, args);
          const result = await (entry.fn as (...a: unknown[]) => unknown)(...positional);
          return {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result),
              },
            ],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: (error as Error).message || String(error) }],
            isError: true,
          };
        }
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return {
    server,
    transport,
    close: async () => {
      // server.close() 与 transport.close() 都要调：只关 transport 会让
      // server 侧的请求处理器与资源保持挂载，重复 init 时逐次累积。
      try {
        await server.close();
      } catch {
        // 忽略关闭错误
      }
      try {
        await transport.close();
      } catch {
        // 忽略关闭错误
      }
    },
  };
}

/**
 * 对接外部 MCP server，把其工具注册进本地 TOOL_REGISTRY（R4 外部注册）。
 * 每个工具以 {prefix}{serverName}_{toolName} 命名注册，参数按 schema 属性转位置参数。
 * 返回已注册的工具名列表。
 */
export async function registerExternalMcpServers(cfg?: McpConfig): Promise<string[]> {
  if (!cfg || cfg.enabled === false) return [];
  const servers = cfg.servers || {};
  const prefix = cfg.prefix || DEFAULT_PREFIX;
  const registered: string[] = [];

  for (const [serverName, serverParams] of Object.entries(servers)) {
    try {
      if (!isValidServerParams(serverParams)) {
        console.warn(
          `[MCP] 外部 server "${serverName}" 配置非法（command 缺失或格式错误），已跳过`,
        );
        continue;
      }

      // 同名 server 若已接入，先完整注销：直接覆盖 Map 会让旧 client 与其子进程
      // 失去引用却仍在运行，形成进程泄漏。
      if (externalClients.has(serverName)) {
        await disconnectExternalMcpServer(serverName);
      }

      const { client, transport } = await connectExternal(serverName, serverParams);

      let tools;
      try {
        ({ tools } = await withTimeout(
          client.listTools(),
          MCP_LIST_TOOLS_TIMEOUT_MS,
          `获取外部 MCP server "${serverName}" 工具列表`,
        ));
      } catch (error) {
        await closeQuietly(client, transport);
        throw error;
      }

      const entry: ExternalClient = { client, transport, tools: new Set(), params: serverParams };

      for (const tool of tools) {
        const localName = `${prefix}${serverName}_${tool.name}`;
        if (TOOL_REGISTRY[localName]) {
          console.warn(`[MCP] 工具 '${localName}' 已存在，跳过外部注册`);
          continue;
        }
        const schema = tool.inputSchema as JSONSchema | undefined;
        const params = schemaToParamDocs(schema);

        TOOL_REGISTRY[localName] = {
          fn: async (...positional: unknown[]) => {
            const named: Record<string, unknown> = {};
            params.forEach((param, i) => {
              const value = positional[i];
              if (value !== undefined) named[param.name] = value;
            });
            // 走统一入口：带超时、断线自动重连、结果大小上限。
            // 不能闭包捕获 client——重连后 client 实例会被替换，
            // 捕获旧实例会导致重连后所有调用仍打在已死连接上。
            return callExternalTool(serverName, tool.name, named);
          },
          argCount: params.length || 1,
          category: 'mcp',
          // 描述取自工具本身而非 inputSchema：inputSchema.description 描述的是
          // 参数对象，绝大多数 server 根本不填，会导致外部工具描述全部丢失。
          description:
            tool.description || schema?.description || `外部 MCP 工具 ${serverName}/${tool.name}`,
          isCustom: true,
          params,
          schema,
        };

        entry.tools.add(localName);
        registered.push(localName);
      }

      if (entry.tools.size > 0) {
        externalClients.set(serverName, entry);
      } else {
        // 没注册到任何工具时必须连 transport 一起关，只关 client 会留下子进程。
        await closeQuietly(client, transport);
      }
    } catch (error) {
      console.warn(`[MCP] 外部 server "${serverName}" 连接失败: ${(error as Error).message}`);
    }
  }

  return registered;
}

/**
 * 调用外部 MCP 工具的统一入口：超时 + 断线重连 + 结果截断。
 * 直接闭包持有 client 的写法在连接断掉后永远失败，且无法恢复。
 */
async function callExternalTool(
  serverName: string,
  remoteToolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    const entry = externalClients.get(serverName);
    if (!entry) {
      throw new Error(`外部 MCP server "${serverName}" 已断开，工具不可用`);
    }

    try {
      const result = (await withTimeout(
        entry.client.callTool({ name: remoteToolName, arguments: args }),
        MCP_CALL_TIMEOUT_MS,
        `调用外部 MCP 工具 "${serverName}/${remoteToolName}"`,
      )) as unknown as ToolCallResultLike;
      return normalizeMcpCallResult(result);
    } catch (error) {
      const canRetry = attempt < MAX_RECONNECT_ATTEMPTS && isConnectionError(error);
      if (!canRetry) {
        throw new Error(
          `外部 MCP 工具 "${serverName}/${remoteToolName}" 执行失败: ${(error as Error).message}`,
          { cause: error },
        );
      }
      console.warn(
        `[MCP] server "${serverName}" 连接异常（${(error as Error).message}），尝试重连…`,
      );
      const reconnected = await reconnectExternal(serverName);
      if (!reconnected) {
        throw new Error(`外部 MCP server "${serverName}" 重连失败，工具不可用`, { cause: error });
      }
    }
  }
  throw new Error(`外部 MCP 工具 "${serverName}/${remoteToolName}" 调用失败`);
}

/**
 * 重连一个外部 MCP server：关闭旧连接、按原参数重建，并保留已注册的工具名。
 * 重连失败时保留原 entry（下一次调用会再次尝试），但返回 false。
 */
async function reconnectExternal(serverName: string): Promise<boolean> {
  const entry = externalClients.get(serverName);
  if (!entry) return false;

  await closeQuietly(entry.client, entry.transport);

  try {
    const { client, transport } = await connectExternal(serverName, entry.params);
    entry.client = client;
    entry.transport = transport;
    console.warn(`[MCP] server "${serverName}" 重连成功`);
    return true;
  } catch (error) {
    console.warn(`[MCP] server "${serverName}" 重连失败: ${(error as Error).message}`);
    return false;
  }
}

/** 注销单个外部 MCP server 及由其注册的工具。 */
export async function disconnectExternalMcpServer(serverName: string): Promise<boolean> {
  const entry = externalClients.get(serverName);
  if (!entry) return false;
  for (const toolName of entry.tools) {
    delete TOOL_REGISTRY[toolName];
  }
  externalClients.delete(serverName);
  await closeQuietly(entry.client, entry.transport);
  return true;
}

/** 注销全部外部 MCP server 及由其注册的工具。 */
export async function disconnectExternalMcpServers(): Promise<void> {
  const entries = Array.from(externalClients.values());
  // 先移除工具注册：断开期间若有新的工具调用，callExternalTool 看到
  // externalClients 中仍存在条目不会报"已断开"，但 TOOL_REGISTRY 已清空
  // 也就不会产生新调用。
  for (const entry of entries) {
    for (const toolName of entry.tools) {
      delete TOOL_REGISTRY[toolName];
    }
  }
  // 清空注册表后逐个关闭。关闭操作移至 clear 之前（原实现在 clear 后再关闭，
  // 若某个 entry 关闭抛异常，后续 entry 永不关闭→子进程成为僵尸进程）。
  // 每个 entry 用独立 try-catch 隔离，确保一个失败不影响其他。
  for (const entry of entries) {
    try {
      await closeQuietly(entry.client, entry.transport);
    } catch {
      /* closeQuietly 已内部捕获，此处兜底防未预期异常 */
    }
  }
  externalClients.clear();
}

/** 从配置初始化 MCP：本地 server 暴露 + 外部 client 接入。返回句柄与已注册外部工具名。 */
export async function initMcp(
  cfg: McpConfig | undefined,
): Promise<{ handle: McpServerHandle | null; registeredExternal: string[] }> {
  const handle = await createLocalMcpServer(cfg);
  const registeredExternal = await registerExternalMcpServers(cfg);
  return { handle, registeredExternal };
}

/** 是否已配置 MCP。 */
export function isMcpConfigured(): boolean {
  const cfg = loadConfig().mcp;
  return Boolean(cfg && cfg.enabled !== false);
}
