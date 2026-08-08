import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_REGISTRY } from './registry.ts';
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

/** 已接入的外部 server 句柄。 */
interface ExternalClient {
  client: Client;
  transport: StdioClientTransport;
  tools: Set<string>; // 已注册到本地注册表的工具名
}

const DEFAULT_PREFIX = 'mcp_';
const externalClients = new Map<string, ExternalClient>();

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

/** 把 MCP callTool 结果归一化为文本摘要。 */
function normalizeMcpCallResult(result: ToolCallResultLike): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const texts = (result.content || [])
    .filter((c) => c.text)
    .map((c) => c.text)
    .filter(Boolean);
  return texts.join('\n');
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
      const transport = new StdioClientTransport(serverParams);
      const client = new Client(
        { name: 'cogito-agent-mcp-client', version: '1.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);

      const { tools } = await client.listTools();
      const entry: ExternalClient = { client, transport, tools: new Set() };

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
            const result = (await client.callTool({
              name: tool.name,
              arguments: named,
            })) as unknown as ToolCallResultLike;
            return normalizeMcpCallResult(result);
          },
          argCount: params.length || 1,
          category: 'mcp',
          description: schema?.description || `外部 MCP 工具 ${serverName}/${tool.name}`,
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
        try {
          await client.close();
        } catch {
          // 忽略
        }
      }
    } catch (error) {
      console.warn(`[MCP] 外部 server "${serverName}" 连接失败: ${(error as Error).message}`);
    }
  }

  return registered;
}

/** 注销全部外部 MCP server 及由其注册的工具。 */
export async function disconnectExternalMcpServers(): Promise<void> {
  for (const entry of externalClients.values()) {
    for (const toolName of entry.tools) {
      delete TOOL_REGISTRY[toolName];
    }
  }
  for (const entry of externalClients.values()) {
    try {
      await entry.transport.close();
    } catch {
      // 忽略关闭错误
    }
    try {
      await entry.client.close();
    } catch {
      // 忽略关闭错误
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
