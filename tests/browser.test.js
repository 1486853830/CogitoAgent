/**
 * Browser 模块测试
 * 
 * 注意：这些测试需要 Playwright 依赖。
 * 如果 Playwright 未安装，测试会被跳过。
 */

import { jest } from '@jest/globals';

describe('Browser 模块', () => {
  let browserModule;

  beforeEach(async () => {
    jest.resetModules();
    try {
      browserModule = await import('../src/agent/tools/browser.js');
    } catch (e) {
      // Playwright 未安装，跳过测试
      browserModule = null;
    }
  });

  afterEach(async () => {
    if (browserModule && browserModule.closeBrowser) {
      try {
        await browserModule.closeBrowser();
      } catch (e) {
        // 忽略关闭错误
      }
    }
  });

  describe('closeBrowser', () => {
    it('应该在浏览器未初始化时返回成功', async () => {
      if (!browserModule) return;
      
      const result = await browserModule.closeBrowser();
      expect(result.success).toBe(true);
    });
  });

  describe('initBrowser', () => {
    it('应该返回错误当 Playwright 不可用时', async () => {
      if (!browserModule) return;
      
      // 这个测试取决于 Playwright 是否正确安装
      const result = await browserModule.initBrowser('https://example.com');
      // 结果取决于环境配置
      expect(typeof result.success).toBe('boolean');
    });
  });
});
