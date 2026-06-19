/**
 * Browser 模块测试
 * 注：由于 browser.js 使用动态 import() 加载 playwright，
 * 需要特殊的 mock 设置才能正确测试浏览器操作功能。
 * 以下测试仅验证模块可以正常加载和调用基本方法。
 */

import { jest } from '@jest/globals';

describe('Browser 模块', () => {
  let browserModule;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    browserModule = await import('../src/agent/tools/browser.js');
  });

  describe('模块加载', () => {
    it('应该正确加载 browser 模块', () => {
      expect(browserModule).toBeDefined();
      expect(typeof browserModule.initBrowser).toBe('function');
      expect(typeof browserModule.closeBrowser).toBe('function');
      expect(typeof browserModule.clickElement).toBe('function');
      expect(typeof browserModule.fillField).toBe('function');
      expect(typeof browserModule.selectOption).toBe('function');
      expect(typeof browserModule.getPageContent).toBe('function');
      expect(typeof browserModule.takeScreenshot).toBe('function');
    });
  });

  describe('未初始化浏览器状态', () => {
    it('未初始化时 clickElement 应该返回错误', async () => {
      const result = await browserModule.clickElement('#button');
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('未初始化时 fillField 应该返回错误', async () => {
      const result = await browserModule.fillField('input', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('未初始化时 getPageContent 应该返回错误', async () => {
      const result = await browserModule.getPageContent();
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('未初始化时 takeScreenshot 应该返回错误', async () => {
      const result = await browserModule.takeScreenshot();
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('未初始化时 closeBrowser 应该返回成功（清理状态）', async () => {
      const result = await browserModule.closeBrowser();
      expect(result.success).toBe(true);
    });
  });
});
