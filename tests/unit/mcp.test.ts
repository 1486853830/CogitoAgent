import { jest } from '@jest/globals';
import {
  createLocalMcpServer,
  initMcp,
  isMcpConfigured,
  disconnectExternalMcpServers,
} from '../../src/agent/mcp.ts';

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
});
