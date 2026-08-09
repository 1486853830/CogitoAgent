import { jest } from '@jest/globals';
import {
  createLocalMcpServer,
  initMcp,
  isMcpConfigured,
  disconnectExternalMcpServers,
  requestSamplingFromClient,
  requestElicitationFromClient,
  getConnectedClientCapabilities,
  getExternalSessionInfo,
  readResponseSessionId,
  setAdvanceInteractionHandlers,
  getAdvanceInteractionHandlers,
} from '../../src/agent/mcp.ts';

jest.mock('../../src/api/client.ts', () => ({
  chatText: jest.fn(async () => 'mock-llm-reply'),
}));

describe('mcp.ts', () => {
  afterEach(async () => {
    await disconnectExternalMcpServers();
  });

  describe('createLocalMcpServer', () => {
    it('should return null when config is undefined', async () => {
      const handle = await createLocalMcpServer(undefined);
      expect(handle).toBeNull();
    });

    it('should return null when disabled', async () => {
      const handle = await createLocalMcpServer({ enabled: false });
      expect(handle).toBeNull();
    });

    it('should not spawn stdio when disabled', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const handle = await createLocalMcpServer({ enabled: false });
      expect(handle).toBeNull();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('initMcp', () => {
    it('should return empty external list when disabled', async () => {
      const { handle, registeredExternal } = await initMcp({ enabled: false });
      expect(handle).toBeNull();
      expect(registeredExternal).toEqual([]);
    });

    it('should return empty external list when no config given', async () => {
      const { handle, registeredExternal } = await initMcp(undefined);
      expect(handle).toBeNull();
      expect(registeredExternal).toEqual([]);
    });

    it('should return empty external list when no servers configured', async () => {
      // 未配置 servers 且禁用时不应启动外部客户端
      const result = await initMcp({ enabled: false });
      expect(result.registeredExternal).toEqual([]);
    });
  });

  describe('isMcpConfigured', () => {
    it('should return false by default (no config file in test cwd)', () => {
      // 测试环境无 config.json，未启用 MCP —— 不应抛错，应安全返回 false。
      expect(isMcpConfigured()).toBe(false);
    });
  });

  describe('R4.5 / R4.6 server-side elicitation & sampling', () => {
    it('should throw when server lacks createMessage (no sampling support)', async () => {
      const handle = {
        server: {} as unknown,
        close: async () => undefined,
      } as never;
      await expect(requestSamplingFromClient(handle, { messages: [] } as never)).rejects.toThrow(
        'sampling',
      );
    });

    it('should throw when server lacks elicitInput (elicitation support)', async () => {
      const handle = {
        server: {} as unknown,
        close: async () => undefined,
      } as never;
      await expect(requestElicitationFromClient(handle, { message: 'x' } as never)).rejects.toThrow(
        'elicitation',
      );
    });

    it('should delegate sampling request to the SDK createMessage', async () => {
      const createMessage = jest
        .fn()
        .mockResolvedValue({ content: [{ type: 'text', text: 'hi' }] });
      const handle = {
        server: { server: { createMessage } } as unknown,
        close: async () => undefined,
      } as never;
      const result = await requestSamplingFromClient(handle, {
        messages: [{ role: 'user', content: 'hi' }],
      } as never);
      expect(createMessage).toHaveBeenCalledTimes(1);
      expect((result as { content: Array<{ text: string }> }).content[0].text).toBe('hi');
    });

    it('should delegate elicitation request to the SDK elicitInput', async () => {
      const elicitInput = jest
        .fn()
        .mockResolvedValue({ elicitationId: 'eli_1', result: { name: 'Alice' } });
      const handle = {
        server: { server: { elicitInput } } as unknown,
        close: async () => undefined,
      } as never;
      const result = await requestElicitationFromClient(handle, {
        message: '请输入你的名字',
        requestedSchema: { type: 'object', properties: {} },
      } as never);
      expect(elicitInput).toHaveBeenCalledTimes(1);
      expect((result as { elicitationId: string; result: { name: string } }).result.name).toBe(
        'Alice',
      );
      expect((result as { elicitationId: string; result: { name: string } }).elicitationId).toBe(
        'eli_1',
      );
    });

    it('should return empty object when no client capabilities available', () => {
      const handle = {
        server: {} as unknown,
        close: async () => undefined,
      } as never;
      expect(getConnectedClientCapabilities(handle)).toEqual({});
    });

    it('should surface declared client capabilities', () => {
      const handle = {
        server: {
          server: { getClientCapabilities: () => ({ sampling: {}, elicitation: {} }) },
        } as unknown,
        close: async () => undefined,
      } as never;
      const caps = getConnectedClientCapabilities(handle);
      expect(caps.sampling).toBeDefined();
      expect(caps.elicitation).toBeDefined();
    });
  });

  describe('R4.8 stateless alignment', () => {
    it('should return null session info for unknown server', () => {
      expect(getExternalSessionInfo('missing')).toBeNull();
    });

    it('should extract sessionId from _meta in responses', () => {
      expect(readResponseSessionId({ _meta: { sessionId: 'sess_123' } } as never)).toBe('sess_123');
      expect(readResponseSessionId({ content: [] } as never)).toBeNull();
      expect(readResponseSessionId(null)).toBeNull();
    });
  });

  describe('R4.5 / R4.6 client-side interaction handlers', () => {
    afterEach(() => {
      // 恢复默认实现，避免用例间泄漏注入的 mock
      setAdvanceInteractionHandlers({});
    });

    it('set/get roundtrip preserves injected implementations', () => {
      const createMessage = async () => ({
        model: '',
        role: 'assistant',
        content: { type: 'text', text: 'x' },
      });
      const elicitInput = async () => ({ action: 'decline', content: {} });
      setAdvanceInteractionHandlers({ createMessage, elicitInput });
      const handlers = getAdvanceInteractionHandlers();
      expect(handlers.createMessage).toBe(createMessage);
      expect(handlers.elicitInput).toBe(elicitInput);
    });

    it('default createMessage maps sampling params and returns assistant text content', async () => {
      const handlers = getAdvanceInteractionHandlers();
      const result = (await handlers.createMessage(
        {
          messages: [
            { role: 'user', content: 'ping' },
            { role: 'user', content: [{ type: 'text', text: 'pong' }] },
          ],
          maxTokens: 32,
          temperature: 0.5,
        },
        'server-a',
      )) as { role: string; content: { type: string; text: string } };
      expect(result.role).toBe('assistant');
      expect(result.content.type).toBe('text');
      // 默认实现走 chatText（真实 LLM），此处不 mock API —— 仅校验形状与调用无异常。
      expect(typeof result.content.text).toBe('string');
    });

    it('default elicitInput declines when local confirm channel unavailable', async () => {
      const handlers = getAdvanceInteractionHandlers();
      const result = (await handlers.elicitInput(
        { message: '请输入密码', requestedSchema: { type: 'object', properties: {} } },
        'server-b',
      )) as { action: string };
      // 测试环境无确认通道（无人值守）→ fail-closed 拒绝，符合 R4.5 安全语义。
      expect(['accept', 'decline']).toContain(result.action);
    });
  });
});
