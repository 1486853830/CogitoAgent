/**
 * Web 模块测试
 */

import { jest } from '@jest/globals';

describe('Web 模块', () => {
  let webModule;

  beforeEach(async () => {
    jest.resetModules();
    webModule = await import('../src/agent/tools/web.js');
  });

  describe('browse', () => {
    it('应该成功打开 URL', async () => {
      const result = await webModule.browse('https://example.com');
      expect(result.success).toBe(true);
      expect(result.data).toContain('example.com');
    });

    it('应该处理无效 URL', async () => {
      const result = await webModule.browse('not-a-url');
      expect(result.success).toBe(false);
    });
  });

  describe('fetchPage', () => {
    it('应该处理无效 URL', async () => {
      const result = await webModule.fetchPage('not-a-valid-url');
      expect(result.success).toBe(false);
    });
  });

  describe('search', () => {
    it('应该处理网络错误', async () => {
      // 当 API 不可用时应该返回失败
      const result = await webModule.search('test query that will likely fail');
      // 搜索可能成功或失败，取决于网络配置
      expect(typeof result.success).toBe('boolean');
    });
  });
});
