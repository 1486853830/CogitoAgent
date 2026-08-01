/**
 * MCP (Model Context Protocol) 服务器模块
 * 将 CogitoAgent 工具暴露为 MCP Server，供其他 AI 客户端调用
 *
 * MCP 协议参考: https://modelcontextprotocol.io/
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import {
  TOOL_REGISTRY,
  getToolRegistry,
  getToolsByCategory,
  hasTool,
  isDangerousOperation,
} from './registry.ts';
import { executeTool } from './Agent.ts';
import { parseArgs, parseToolCall, parseAllToolCalls } from './tool-parser.ts';
import {
  formatToolResult,
  classifyToolError,
  formatToolError,
  TOOL_OUTPUT_LIMITS,
} from './tool-utils.ts';
import { traceStep, updateTraceStep, clearThoughtTrace, getThoughtTrace } from './thought-trace.ts';

// MCP JSON-RPC 2.0 实现
const MCP_VERSION = '2.0';

// MCP 协议方法
const MCP_METHODS = {
  // 初始化
  INITIALIZE: 'initialize',
  SHUTDOWN: 'shutdown',
  'notifications/initialized': 'notifications/initialized',

  // 工具相关
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',

  // 资源相关
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',

  // 提示词相关
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',
};

// MCP 错误码
const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
};

interface ServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

interface JsonRpcRequest {
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id?: string | number | null;
  result?: any;
  error?: { code: number; message: string };
}

class MCPServer {
  port: number;
  agent: any;
  server: Server | null;
  initialized: boolean;
  serverInfo: ServerInfo;
  authToken: string;

  constructor(port = 3001, agent?: any) {
    this.port = port;
    this.agent = agent;
    this.server = null;
    this.initialized = false;
    this.serverInfo = {
      name: 'cogito-agent',
      version: '1.0.0',
      protocolVersion: MCP_VERSION,
    };
    // 启动时生成随机鉴权 token，客户端需通过 Authorization: Bearer <token> 访问
    this.authToken = crypto.randomUUID();
  }

  /**
   * 启动 MCP 服务器
   */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        // CORS 头（不开放通配 *，仅允许本地调试来源）
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // 预检请求不校验鉴权
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (req.method === 'GET') {
          // 健康检查
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'ok',
              server: this.serverInfo,
              tools: Object.keys(TOOL_REGISTRY).length,
            }),
          );
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const response = await this.handleRequest(body, req);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(response));
            } catch (error: any) {
              const statusCode = error.statusCode || 500;
              res.writeHead(statusCode, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify(
                  this.errorResponse(null, MCP_ERROR_CODES.INTERNAL_ERROR, error.message),
                ),
              );
            }
          });
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this.server.on('error', (err: Error) => {
        console.error('[MCP] Server error:', err.message);
        reject(err);
      });

      // 仅绑定本地回环地址，避免暴露到 0.0.0.0
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[MCP] Server started on http://127.0.0.1:${this.port}`);
        console.log(`[MCP] Auth token: ${this.authToken}`);
        resolve(this.port);
      });
    });
  }

  /**
   * 停止 MCP 服务器
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.error('[MCP] Server stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理 JSON-RPC 请求
   */
  async handleRequest(
    body: string,
    req?: IncomingMessage,
  ): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
    // Bearer token 鉴权（预检 OPTIONS 在上层已跳过，不会进入此处）
    // HTTP 请求总是传入 req，因此远程调用必走鉴权；受信任的进程内调用可省略 req。
    if (req) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader !== `Bearer ${this.authToken}`) {
        const err = new Error('Unauthorized: invalid or missing Bearer token') as any;
        err.statusCode = 401;
        throw err;
      }
    }

    let request: any;

    try {
      request = JSON.parse(body);
    } catch {
      return this.errorResponse(null, MCP_ERROR_CODES.PARSE_ERROR, 'Invalid JSON');
    }

    // 批量请求
    if (Array.isArray(request)) {
      const responses = await Promise.all(
        request.map((req: JsonRpcRequest) => this.handleSingleRequest(req)),
      );
      return responses as any;
    }

    return this.handleSingleRequest(request);
  }

  /**
   * 处理单个 JSON-RPC 请求
   */
  async handleSingleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { id, method, params } = request;

    if (!method) {
      return this.errorResponse(id, MCP_ERROR_CODES.INVALID_REQUEST, 'Method is required');
    }

    try {
      switch (method) {
        case MCP_METHODS.INITIALIZE:
          return this.handleInitialize(id, params);

        case MCP_METHODS.SHUTDOWN:
          return this.handleShutdown(id);

        case MCP_METHODS.TOOLS_LIST:
          return this.handleToolsList(id, params);

        case MCP_METHODS.TOOLS_CALL:
          return await this.handleToolsCall(id, params);

        case MCP_METHODS.RESOURCES_LIST:
          return this.handleResourcesList(id, params);

        case MCP_METHODS.RESOURCES_READ:
          return this.handleResourcesRead(id, params);

        case MCP_METHODS.PROMPTS_LIST:
          return this.handlePromptsList(id, params);

        case 'notifications/initialized':
          // 客户端初始化完成通知，不需要响应
          return null;

        default:
          return this.errorResponse(
            id,
            MCP_ERROR_CODES.METHOD_NOT_FOUND,
            `Unknown method: ${method}`,
          );
      }
    } catch (error: any) {
      return this.errorResponse(id, MCP_ERROR_CODES.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 初始化处理
   */
  handleInitialize(id: any, params: any): JsonRpcResponse {
    this.initialized = true;

    return {
      jsonrpc: MCP_VERSION,
      id,
      result: {
        protocolVersion: MCP_VERSION,
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
        serverInfo: this.serverInfo,
      },
    };
  }

  /**
   * 关闭处理
   */
  handleShutdown(id: any): JsonRpcResponse {
    return {
      jsonrpc: MCP_VERSION,
      id,
      result: { shutdown: true },
    };
  }

  /**
   * 列出所有工具
   */
  handleToolsList(id: any, params: any): JsonRpcResponse {
    const registry = TOOL_REGISTRY;

    const tools = Object.entries(registry).map(([name, info]: [string, any]) => ({
      name,
      description: `${info.category}: ${name}`,
      inputSchema: this.generateInputSchema(info),
    }));

    return {
      jsonrpc: MCP_VERSION,
      id,
      result: {
        tools,
      },
    };
  }

  /**
   * 生成工具输入模式
   */
  generateInputSchema(toolInfo: any): any {
    const args = [];
    for (let i = 0; i < toolInfo.argCount; i++) {
      args.push({
        name: `arg${i}`,
        type: 'string',
        description: `Argument ${i + 1}`,
      });
    }

    return {
      type: 'object',
      properties: args.length > 0 ? { args: { type: 'array', items: { type: 'string' } } } : {},
      required: args.length > 0 ? ['args'] : [],
    };
  }

  /**
   * 调用工具
   */
  async handleToolsCall(id: any, params: any): Promise<JsonRpcResponse> {
    const { name, arguments: args } = params;

    if (!hasTool(name)) {
      return this.errorResponse(id, MCP_ERROR_CODES.TOOL_NOT_FOUND, `Tool not found: ${name}`);
    }

    if (isDangerousOperation(name)) {
      return {
        jsonrpc: MCP_VERSION,
        id,
        result: {
          content: [
            {
              type: 'text',
              text: 'MCP 不允许执行危险操作，请在终端中执行',
            },
          ],
          isError: true,
        },
      };
    }

    try {
      const result = await executeTool(name, args || []);

      return {
        jsonrpc: MCP_VERSION,
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result),
            },
          ],
          isError: result?.success === false,
        },
      };
    } catch (error: any) {
      return {
        jsonrpc: MCP_VERSION,
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  /**
   * 列出资源
   */
  handleResourcesList(id: any, params: any): JsonRpcResponse {
    return {
      jsonrpc: MCP_VERSION,
      id,
      result: {
        resources: [
          {
            uri: 'file://workspace',
            name: 'Current Workspace',
            description: 'The current workspace directory',
          },
          {
            uri: 'session://current',
            name: 'Current Session',
            description: 'Current conversation session info',
          },
        ],
      },
    };
  }

  /**
   * 读取资源
   */
  handleResourcesRead(id: any, params: any): JsonRpcResponse {
    const { uri } = params;

    return {
      jsonrpc: MCP_VERSION,
      id,
      result: {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Resource: ${uri}`,
          },
        ],
      },
    };
  }

  /**
   * 列出提示词
   */
  handlePromptsList(id: any, params: any): JsonRpcResponse {
    return {
      jsonrpc: MCP_VERSION,
      id,
      result: {
        prompts: [
          {
            name: 'explore',
            description: 'Start exploring the workspace',
            arguments: [
              {
                name: 'path',
                description: 'Directory path to explore',
                required: false,
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * 生成错误响应
   */
  errorResponse(id: any, code: number, message: string): JsonRpcResponse {
    return {
      jsonrpc: MCP_VERSION,
      id,
      error: { code, message },
    };
  }
}

// MCP 服务器单例
let mcpServer: MCPServer | null = null;

/**
 * 启动 MCP 服务器
 */
async function startMCPServer(port = 3001, agent?: any): Promise<number> {
  if (mcpServer) {
    console.warn('[MCP] Server already running');
    return mcpServer.port;
  }

  mcpServer = new MCPServer(port, agent);
  await mcpServer.start();
  return mcpServer.port;
}

/**
 * 停止 MCP 服务器
 */
async function stopMCPServer(): Promise<void> {
  if (mcpServer) {
    await mcpServer.stop();
    mcpServer = null;
  }
}

/**
 * 获取 MCP 服务器状态
 */
function getMCPServerStatus():
  | { running: false }
  | { running: true; port: number; initialized: boolean; serverInfo: ServerInfo } {
  if (!mcpServer) {
    return { running: false };
  }

  return {
    running: true,
    port: mcpServer.port,
    initialized: mcpServer.initialized,
    serverInfo: mcpServer.serverInfo,
  };
}

export { MCPServer, startMCPServer, stopMCPServer, getMCPServerStatus, MCP_VERSION, MCP_METHODS };
