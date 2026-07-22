/**
 * mcp.ts 单元测试
 *
 * 覆盖 src/agent/mcp.ts 中导出的 MCPServer 类及相关函数：
 *  - MCPServer: handleRequest, handleSingleRequest, handleInitialize,
 *    handleShutdown, handleToolsList, handleToolsCall, handleResourcesList,
 *    handleResourcesRead, handlePromptsList, generateInputSchema, errorResponse
 *  - startMCPServer / stopMCPServer / getMCPServerStatus
 *  - MCP_VERSION / MCP_METHODS 常量
 *
 * 通过 jest.unstable_mockModule 模拟 Agent.ts / registry.ts /
 * tool-parser.ts / tool-utils.ts / thought-trace.ts 依赖。
 */

import { jest } from '@jest/globals';

// === Mock 依赖模块 ===
const mockExecuteTool = jest.fn();

jest.unstable_mockModule('../../src/agent/Agent.ts', () => ({
  executeTool: mockExecuteTool,
}));

const mockHasTool = jest.fn();
const mockGetToolRegistry = jest.fn();
const mockGetToolsByCategory = jest.fn();
const mockToolRegistry = {
  ls: { fn: jest.fn(), argCount: 1, category: 'file' },
  read: { fn: jest.fn(), argCount: 1, category: 'file' },
  search: { fn: jest.fn(), argCount: 1, category: 'web', customArgs: true },
};

jest.unstable_mockModule('../../src/agent/registry.ts', () => ({
  TOOL_REGISTRY: mockToolRegistry,
  getToolRegistry: mockGetToolRegistry,
  getToolsByCategory: mockGetToolsByCategory,
  hasTool: mockHasTool,
}));

jest.unstable_mockModule('../../src/agent/tool-parser.ts', () => ({
  parseArgs: jest.fn(),
  parseToolCall: jest.fn(),
  parseAllToolCalls: jest.fn(),
}));

jest.unstable_mockModule('../../src/agent/tool-utils.ts', () => ({
  formatToolResult: jest.fn(),
  classifyToolError: jest.fn(),
  formatToolError: jest.fn(),
  TOOL_OUTPUT_LIMITS: { default: 10000 },
}));

jest.unstable_mockModule('../../src/agent/thought-trace.ts', () => ({
  traceStep: jest.fn(),
  updateTraceStep: jest.fn(),
  clearThoughtTrace: jest.fn(),
  getThoughtTrace: jest.fn(),
}));

const { MCPServer, startMCPServer, stopMCPServer, getMCPServerStatus, MCP_VERSION, MCP_METHODS } =
  await import('../../src/agent/mcp.ts');

// === 辅助函数 ===

function makeServer(): InstanceType<typeof MCPServer> {
  return new MCPServer(0, null);
}

describe('mcp.ts', () => {
  let consoleErrorSpy: jest.Spied<typeof console.error>;
  let consoleWarnSpy: jest.Spied<typeof console.warn>;
  let consoleLogSpy: jest.Spied<typeof console.log>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await stopMCPServer();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  // ===================================================================
  // 常量
  // ===================================================================
  describe('constants', () => {
    it('MCP_VERSION should be "2.0"', () => {
      expect(MCP_VERSION).toBe('2.0');
    });

    it('MCP_METHODS should define all protocol methods', () => {
      expect(MCP_METHODS.INITIALIZE).toBe('initialize');
      expect(MCP_METHODS.SHUTDOWN).toBe('shutdown');
      expect(MCP_METHODS.TOOLS_LIST).toBe('tools/list');
      expect(MCP_METHODS.TOOLS_CALL).toBe('tools/call');
      expect(MCP_METHODS.RESOURCES_LIST).toBe('resources/list');
      expect(MCP_METHODS.RESOURCES_READ).toBe('resources/read');
      expect(MCP_METHODS.PROMPTS_LIST).toBe('prompts/list');
      expect(MCP_METHODS.PROMPTS_GET).toBe('prompts/get');
    });
  });

  // ===================================================================
  // MCPServer 构造函数
  // ===================================================================
  describe('MCPServer constructor', () => {
    it('should set default port and serverInfo', () => {
      const server = new MCPServer();
      expect(server.port).toBe(3001);
      expect(server.server).toBeNull();
      expect(server.initialized).toBe(false);
      expect(server.serverInfo.name).toBe('cogito-agent');
      expect(server.serverInfo.version).toBe('1.0.0');
      expect(server.serverInfo.protocolVersion).toBe('2.0');
    });

    it('should accept custom port', () => {
      const server = new MCPServer(8080);
      expect(server.port).toBe(8080);
    });

    it('should accept agent', () => {
      const agent = { name: 'test' };
      const server = new MCPServer(3001, agent);
      expect(server.agent).toBe(agent);
    });
  });

  // ===================================================================
  // handleInitialize
  // ===================================================================
  describe('handleInitialize', () => {
    it('should return initialize response with capabilities', () => {
      const server = makeServer();
      const response = server.handleInitialize(1, {});

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.protocolVersion).toBe('2.0');
      expect(response.result.capabilities.tools).toBeDefined();
      expect(response.result.capabilities.resources).toBeDefined();
      expect(response.result.capabilities.prompts).toBeDefined();
      expect(response.result.serverInfo.name).toBe('cogito-agent');
      expect(server.initialized).toBe(true);
    });
  });

  // ===================================================================
  // handleShutdown
  // ===================================================================
  describe('handleShutdown', () => {
    it('should return shutdown response', () => {
      const server = makeServer();
      const response = server.handleShutdown('req-1');

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-1');
      expect(response.result.shutdown).toBe(true);
    });
  });

  // ===================================================================
  // handleToolsList
  // ===================================================================
  describe('handleToolsList', () => {
    it('should list all tools from registry', () => {
      const server = makeServer();
      const response = server.handleToolsList(1, {});

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.tools).toHaveLength(3);
      expect(response.result.tools[0]).toHaveProperty('name');
      expect(response.result.tools[0]).toHaveProperty('description');
      expect(response.result.tools[0]).toHaveProperty('inputSchema');
    });

    it('should include category in description', () => {
      const server = makeServer();
      const response = server.handleToolsList(1, {});

      const lsTool = response.result.tools.find((t: any) => t.name === 'ls');
      expect(lsTool.description).toContain('file');
      expect(lsTool.description).toContain('ls');
    });
  });

  // ===================================================================
  // generateInputSchema
  // ===================================================================
  describe('generateInputSchema', () => {
    it('should generate schema for tool with args', () => {
      const server = makeServer();
      const schema = server.generateInputSchema({ argCount: 2, category: 'file' });

      expect(schema.type).toBe('object');
      expect(schema.properties.args).toBeDefined();
      expect(schema.properties.args.type).toBe('array');
      expect(schema.required).toContain('args');
    });

    it('should generate empty schema for tool with no args', () => {
      const server = makeServer();
      const schema = server.generateInputSchema({ argCount: 0, category: 'system' });

      expect(schema.type).toBe('object');
      expect(schema.properties).toEqual({});
      expect(schema.required).toEqual([]);
    });
  });

  // ===================================================================
  // handleToolsCall
  // ===================================================================
  describe('handleToolsCall', () => {
    it('should return error when tool is not found', async () => {
      mockHasTool.mockReturnValue(false);
      const server = makeServer();

      const response = await server.handleToolsCall(1, { name: 'nonexistent', arguments: [] });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error.code).toBe(-32001);
      expect(response.error.message).toContain('Tool not found');
    });

    it('should execute tool and return result', async () => {
      mockHasTool.mockReturnValue(true);
      mockExecuteTool.mockResolvedValue({ success: true, data: 'result data' });
      const server = makeServer();

      const response = await server.handleToolsCall(1, { name: 'ls', arguments: ['/tmp'] });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.content[0].type).toBe('text');
      expect(response.result.content[0].text).toContain('result data');
      expect(response.result.isError).toBe(false);
      expect(mockExecuteTool).toHaveBeenCalledWith('ls', ['/tmp']);
    });

    it('should use empty array when arguments is undefined', async () => {
      mockHasTool.mockReturnValue(true);
      mockExecuteTool.mockResolvedValue('string result');
      const server = makeServer();

      const response = await server.handleToolsCall(1, { name: 'ls' });

      expect(mockExecuteTool).toHaveBeenCalledWith('ls', []);
      expect(response.result.isError).toBe(false);
    });

    it('should set isError when result.success is false', async () => {
      mockHasTool.mockReturnValue(true);
      mockExecuteTool.mockResolvedValue({ success: false, error: 'failed' });
      const server = makeServer();

      const response = await server.handleToolsCall(1, { name: 'ls', arguments: [] });

      expect(response.result.isError).toBe(true);
    });

    it('should handle execution errors', async () => {
      mockHasTool.mockReturnValue(true);
      mockExecuteTool.mockRejectedValue(new Error('execution error'));
      const server = makeServer();

      const response = await server.handleToolsCall(1, { name: 'ls', arguments: [] });

      expect(response.result.isError).toBe(true);
      expect(response.result.content[0].text).toContain('execution error');
    });
  });

  // ===================================================================
  // handleResourcesList
  // ===================================================================
  describe('handleResourcesList', () => {
    it('should list resources', () => {
      const server = makeServer();
      const response = server.handleResourcesList(1, {});

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.resources).toHaveLength(2);
      expect(response.result.resources[0].uri).toBe('file://workspace');
      expect(response.result.resources[1].uri).toBe('session://current');
    });
  });

  // ===================================================================
  // handleResourcesRead
  // ===================================================================
  describe('handleResourcesRead', () => {
    it('should return resource content', () => {
      const server = makeServer();
      const response = server.handleResourcesRead(1, { uri: 'file://workspace' });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.contents[0].uri).toBe('file://workspace');
      expect(response.result.contents[0].mimeType).toBe('text/plain');
      expect(response.result.contents[0].text).toContain('file://workspace');
    });
  });

  // ===================================================================
  // handlePromptsList
  // ===================================================================
  describe('handlePromptsList', () => {
    it('should list prompts', () => {
      const server = makeServer();
      const response = server.handlePromptsList(1, {});

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.prompts).toHaveLength(1);
      expect(response.result.prompts[0].name).toBe('explore');
      expect(response.result.prompts[0].arguments).toHaveLength(1);
    });
  });

  // ===================================================================
  // handleRequest (JSON 解析与批量请求)
  // ===================================================================
  describe('handleRequest', () => {
    it('should return parse error for invalid JSON', async () => {
      const server = makeServer();
      const response = await server.handleRequest('not json');

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBeNull();
      expect(response.error.code).toBe(-32700);
      expect(response.error.message).toContain('Invalid JSON');
    });

    it('should handle single request', async () => {
      const server = makeServer();
      const request = JSON.stringify({ id: 1, method: 'initialize', params: {} });
      const response = await server.handleRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
    });

    it('should handle batch requests', async () => {
      const server = makeServer();
      const batch = JSON.stringify([
        { id: 1, method: 'initialize', params: {} },
        { id: 2, method: 'shutdown' },
      ]);
      const response = await server.handleRequest(batch);

      expect(Array.isArray(response)).toBe(true);
      expect(response).toHaveLength(2);
      expect(response[0].id).toBe(1);
      expect(response[1].id).toBe(2);
    });
  });

  // ===================================================================
  // handleSingleRequest (方法路由)
  // ===================================================================
  describe('handleSingleRequest', () => {
    it('should return error when method is missing', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({ id: 1 } as any);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error.code).toBe(-32600);
      expect(response.error.message).toContain('Method is required');
    });

    it('should return method not found for unknown method', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({ id: 1, method: 'unknown/method' });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain('Unknown method');
    });

    it('should route initialize to handleInitialize', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({
        id: 'a',
        method: 'initialize',
        params: {},
      });

      expect(response.id).toBe('a');
      expect(response.result.protocolVersion).toBe('2.0');
    });

    it('should route shutdown to handleShutdown', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({ id: 1, method: 'shutdown' });

      expect(response.result.shutdown).toBe(true);
    });

    it('should route tools/list to handleToolsList', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({
        id: 1,
        method: 'tools/list',
        params: {},
      });

      expect(response.result.tools).toBeDefined();
    });

    it('should route tools/call to handleToolsCall', async () => {
      mockHasTool.mockReturnValue(false);
      const server = makeServer();
      const response = await server.handleSingleRequest({
        id: 1,
        method: 'tools/call',
        params: { name: 'nope', arguments: [] },
      });

      expect(response.error.code).toBe(-32001);
    });

    it('should route resources/list to handleResourcesList', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({
        id: 1,
        method: 'resources/list',
        params: {},
      });

      expect(response.result.resources).toBeDefined();
    });

    it('should route resources/read to handleResourcesRead', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({
        id: 1,
        method: 'resources/read',
        params: { uri: 'file://test' },
      });

      expect(response.result.contents).toBeDefined();
    });

    it('should route prompts/list to handlePromptsList', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({
        id: 1,
        method: 'prompts/list',
        params: {},
      });

      expect(response.result.prompts).toBeDefined();
    });

    it('should return null for notifications/initialized', async () => {
      const server = makeServer();
      const response = await server.handleSingleRequest({
        method: 'notifications/initialized',
      } as any);

      expect(response).toBeNull();
    });
  });

  // ===================================================================
  // errorResponse
  // ===================================================================
  describe('errorResponse', () => {
    it('should format error response correctly', () => {
      const server = makeServer();
      const response = server.errorResponse('req-id', -32601, 'not found');

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe('req-id');
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toBe('not found');
    });

    it('should handle null id', () => {
      const server = makeServer();
      const response = server.errorResponse(null, -32700, 'parse error');

      expect(response.id).toBeNull();
    });
  });

  // ===================================================================
  // start / stop (HTTP 服务器生命周期)
  // ===================================================================
  describe('start and stop', () => {
    it('should start server and resolve with port', async () => {
      const server = new MCPServer(0);
      const port = await server.start();

      expect(port).toBe(0);
      expect(server.server).not.toBeNull();

      await server.stop();
    });

    it('should stop server and clean up', async () => {
      const server = new MCPServer(0);
      await server.start();

      await server.stop();
      expect(server.server).toBeNull();
    });

    it('should resolve immediately when stopping a non-running server', async () => {
      const server = new MCPServer(0);
      await server.stop();
      // Should not throw
    });
  });

  // ===================================================================
  // startMCPServer / stopMCPServer / getMCPServerStatus
  // ===================================================================
  describe('singleton server management', () => {
    it('getMCPServerStatus should return not running initially', () => {
      const status = getMCPServerStatus();
      expect(status.running).toBe(false);
    });

    it('startMCPServer should start and set status', async () => {
      const port = await startMCPServer(0);
      expect(port).toBe(0);

      const status = getMCPServerStatus();
      expect(status.running).toBe(true);
    });

    it('startMCPServer should warn when already running', async () => {
      await startMCPServer(0);
      const port = await startMCPServer(0);

      expect(port).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('already running'));
    });

    it('stopMCPServer should stop and clear status', async () => {
      await startMCPServer(0);
      await stopMCPServer();

      const status = getMCPServerStatus();
      expect(status.running).toBe(false);
    });

    it('stopMCPServer should do nothing when not running', async () => {
      await stopMCPServer();
      // Should not throw
      expect(getMCPServerStatus().running).toBe(false);
    });

    it('status should include serverInfo when running', async () => {
      await startMCPServer(0);
      const status = getMCPServerStatus() as any;

      expect(status.running).toBe(true);
      expect(status.port).toBe(0);
      expect(status.serverInfo.name).toBe('cogito-agent');
      expect(status.initialized).toBe(false);
    });
  });

  // ===================================================================
  // HTTP 端点集成测试
  // ===================================================================
  describe('HTTP endpoint integration', () => {
    it('should respond to GET health check', async () => {
      const server = new MCPServer(0);
      await server.start();

      const http = await import('http');

      await new Promise<void>((resolve, reject) => {
        const address = server.server!.address();
        const port = typeof address === 'object' && address ? address.port : 0;

        const req = http.request(
          { hostname: 'localhost', port, method: 'GET', path: '/' },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const json = JSON.parse(body);
                expect(json.status).toBe('ok');
                expect(json.server.name).toBe('cogito-agent');
                expect(json.tools).toBeGreaterThan(0);
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          },
        );
        req.on('error', reject);
        req.end();
      });

      await server.stop();
    });

    it('should respond to POST JSON-RPC request', async () => {
      const server = new MCPServer(0);
      await server.start();

      const http = await import('http');
      const requestBody = JSON.stringify({ id: 1, method: 'initialize', params: {} });

      await new Promise<void>((resolve, reject) => {
        const address = server.server!.address();
        const port = typeof address === 'object' && address ? address.port : 0;

        const req = http.request(
          {
            hostname: 'localhost',
            port,
            method: 'POST',
            path: '/',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const json = JSON.parse(body);
                expect(json.jsonrpc).toBe('2.0');
                expect(json.id).toBe(1);
                expect(json.result.protocolVersion).toBe('2.0');
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          },
        );
        req.on('error', reject);
        req.write(requestBody);
        req.end();
      });

      await server.stop();
    });

    it('should respond to OPTIONS with 200', async () => {
      const server = new MCPServer(0);
      await server.start();

      const http = await import('http');

      await new Promise<void>((resolve, reject) => {
        const address = server.server!.address();
        const port = typeof address === 'object' && address ? address.port : 0;

        const req = http.request(
          { hostname: 'localhost', port, method: 'OPTIONS', path: '/' },
          (res) => {
            expect(res.statusCode).toBe(200);
            res.on('end', () => resolve());
            res.resume();
          },
        );
        req.on('error', reject);
        req.end();
      });

      await server.stop();
    });

    it('should respond 404 to unsupported methods', async () => {
      const server = new MCPServer(0);
      await server.start();

      const http = await import('http');

      await new Promise<void>((resolve, reject) => {
        const address = server.server!.address();
        const port = typeof address === 'object' && address ? address.port : 0;

        const req = http.request(
          { hostname: 'localhost', port, method: 'DELETE', path: '/' },
          (res) => {
            expect(res.statusCode).toBe(404);
            res.on('end', () => resolve());
            res.resume();
          },
        );
        req.on('error', reject);
        req.end();
      });

      await server.stop();
    });

    it('should return internal error for invalid JSON POST', async () => {
      const server = new MCPServer(0);
      await server.start();

      const http = await import('http');

      await new Promise<void>((resolve, reject) => {
        const address = server.server!.address();
        const port = typeof address === 'object' && address ? address.port : 0;

        const req = http.request(
          {
            hostname: 'localhost',
            port,
            method: 'POST',
            path: '/',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                const json = JSON.parse(body);
                expect(json.error.code).toBe(-32700);
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          },
        );
        req.on('error', reject);
        req.write('not valid json');
        req.end();
      });

      await server.stop();
    });
  });
});
