/**
 * Web 模块测试
 */

import { jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn();

describe('Web 模块', () => {
  let webModule;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    webModule = await import('../src/agent/tools/web.js');
  });

  describe('search', () => {
    it('应该正确执行搜索', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { title: '测试结果1', url: 'https://example.com/1', snippet: '描述1' },
            { title: '测试结果2', url: 'https://example.com/2', snippet: '描述2' }
          ]
        })
      });

      const result = await webModule.search('测试关键词');

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('应该处理搜索错误', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await webModule.search('测试');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该处理网络错误', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      const result = await webModule.search('测试');

      expect(result.success).toBe(false);
    });
  });

  describe('fetchPage', () => {
    it('应该正确抓取网页内容', async () => {
      fetch.mockResolvedValue({
        ok: true,
        text: async () => '<html><body><h1>测试页面</h1><p>内容</p></body></html>'
      });

      const result = await webModule.fetchPage('https://example.com');

      expect(result.success).toBe(true);
      expect(result.data.title).toBeDefined();
    });

    it('应该处理 404 错误', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await webModule.fetchPage('https://example.com/nonexistent');

      expect(result.success).toBe(false);
    });

    it('应该处理无效 URL', async () => {
      const result = await webModule.fetchPage('not-a-valid-url');

      expect(result.success).toBe(false);
    });
  });

  describe('browse', () => {
    it('应该返回浏览器打开指令', async () => {
      const result = await webModule.browse('https://example.com');

      expect(result.success).toBe(true);
      expect(result.data).toContain('正在打开');
    });
  });

  describe('searchOnEngine', () => {
    it('应该支持指定搜索引擎', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ title: 'Google结果', url: 'https://google.com/result' }]
        })
      });

      const result = await webModule.searchOnEngine('测试', 'google');

      expect(result.success).toBe(true);
    });

    it('应该支持百度搜索', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ title: '百度结果', url: 'https://baidu.com/result' }]
        })
      });

      const result = await webModule.searchOnEngine('测试', 'baidu');

      expect(result.success).toBe(true);
    });

    it('应该支持 Bing 搜索', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ title: 'Bing结果', url: 'https://bing.com/result' }]
        })
      });

      const result = await webModule.searchOnEngine('测试', 'bing');

      expect(result.success).toBe(true);
    });
  });
});
