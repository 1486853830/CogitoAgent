/**
 * Browser 模块测试
 */

import { jest } from '@jest/globals';

// Mock Playwright
const mockBrowser = {
  newPage: jest.fn(),
  close: jest.fn()
};

const mockPage = {
  goto: jest.fn(),
  click: jest.fn(),
  fill: jest.fn(),
  selectOption: jest.fn(),
  content: jest.fn(),
  screenshot: jest.fn(),
  close: jest.fn()
};

jest.unstable_mockModule('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
    launchPersistentContext: jest.fn().mockResolvedValue({
      browser: mockBrowser,
      pages: [mockPage],
      close: jest.fn()
    })
  }
}));

describe('Browser 模块', () => {
  let browserModule;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockPage.goto.mockResolvedValue({ ok: true });
    mockPage.click.mockResolvedValue(undefined);
    mockPage.fill.mockResolvedValue(undefined);
    mockPage.selectOption.mockResolvedValue(undefined);
    mockPage.content.mockResolvedValue('<html><body><div id="content">Test</div></body></html>');
    mockPage.screenshot.mockResolvedValue(Buffer.from('fake-image-data'));
    mockPage.close.mockResolvedValue(undefined);
    
    browserModule = await import('../src/agent/tools/browser.js');
  });

  afterEach(async () => {
    // 清理浏览器实例
    try {
      await browserModule.closeBrowser();
    } catch (e) {
      // 忽略关闭错误
    }
  });

  describe('initBrowser', () => {
    it('应该正确初始化浏览器', async () => {
      const result = await browserModule.initBrowser('https://example.com');

      expect(result.success).toBe(true);
      expect(mockBrowser.newPage).toHaveBeenCalled();
    });

    it('应该处理浏览器启动失败', async () => {
      const { chromium } = await import('playwright');
      chromium.launch.mockRejectedValue(new Error('浏览器启动失败'));

      const result = await browserModule.initBrowser('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('启动失败');
    });
  });

  describe('clickElement', () => {
    it('应该正确点击元素', async () => {
      await browserModule.initBrowser('https://example.com');
      const result = await browserModule.clickElement('#button', 0);

      expect(result.success).toBe(true);
      expect(mockPage.click).toHaveBeenCalledWith('#button', { timeout: 30000 });
    });

    it('应该处理元素不存在的情况', async () => {
      await browserModule.initBrowser('https://example.com');
      mockPage.click.mockRejectedValue(new Error('元素不存在'));

      const result = await browserModule.clickElement('#nonexistent', 0);

      expect(result.success).toBe(false);
    });

    it('应该支持点击索引元素', async () => {
      await browserModule.initBrowser('https://example.com');
      
      const result = await browserModule.clickElement('.item', 2);

      expect(result.success).toBe(true);
    });
  });

  describe('fillField', () => {
    it('应该正确填写表单字段', async () => {
      await browserModule.initBrowser('https://example.com');
      const result = await browserModule.fillField('input[name="username"]', 'testuser');

      expect(result.success).toBe(true);
      expect(mockPage.fill).toHaveBeenCalledWith('input[name="username"]', 'testuser');
    });

    it('应该处理字段不存在的情况', async () => {
      await browserModule.initBrowser('https://example.com');
      mockPage.fill.mockRejectedValue(new Error('字段不存在'));

      const result = await browserModule.fillField('#nonexistent', 'value');

      expect(result.success).toBe(false);
    });
  });

  describe('selectOption', () => {
    it('应该正确选择下拉选项', async () => {
      await browserModule.initBrowser('https://example.com');
      const result = await browserModule.selectOption('select[name="country"]', 'CN');

      expect(result.success).toBe(true);
      expect(mockPage.selectOption).toHaveBeenCalled();
    });
  });

  describe('getPageContent', () => {
    it('应该正确获取页面内容', async () => {
      await browserModule.initBrowser('https://example.com');
      const result = await browserModule.getPageContent();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('应该在浏览器未初始化时返回错误', async () => {
      // 不初始化浏览器
      const result = await browserModule.getPageContent();

      expect(result.success).toBe(false);
    });
  });

  describe('takeScreenshot', () => {
    it('应该正确截图', async () => {
      await browserModule.initBrowser('https://example.com');
      const result = await browserModule.takeScreenshot('./test-screenshot.png');

      expect(result.success).toBe(true);
      expect(result.data).toContain('截图已保存');
    });

    it('应该处理截图失败', async () => {
      await browserModule.initBrowser('https://example.com');
      mockPage.screenshot.mockRejectedValue(new Error('截图失败'));

      const result = await browserModule.takeScreenshot('./test-screenshot.png');

      expect(result.success).toBe(false);
    });
  });

  describe('closeBrowser', () => {
    it('应该正确关闭浏览器', async () => {
      await browserModule.initBrowser('https://example.com');
      const result = await browserModule.closeBrowser();

      expect(result.success).toBe(true);
      expect(mockPage.close).toHaveBeenCalled();
    });
  });

  describe('searchOnPage', () => {
    it('应该在页面中搜索文本', async () => {
      await browserModule.initBrowser('https://example.com');
      mockPage.content.mockResolvedValue('<html><body>Hello World</body></html>');

      const result = await browserModule.searchOnPage('Hello', 'World');

      expect(result.success).toBe(true);
    });

    it('应该处理搜索无结果', async () => {
      await browserModule.initBrowser('https://example.com');
      mockPage.content.mockResolvedValue('<html><body>Hello</body></html>');

      const result = await browserModule.searchOnPage('Goodbye');

      expect(result.success).toBe(false);
    });
  });

  describe('findElements', () => {
    it('应该找到所有匹配的元素', async () => {
      await browserModule.initBrowser('https://example.com');
      
      const result = await browserModule.findElements('.item', '');

      expect(result.success).toBe(true);
    });
  });

  describe('下载功能', () => {
    it('应该正确处理文件下载', async () => {
      await browserModule.initBrowser('https://example.com');
      
      const result = await browserModule.downloadFile(
        'https://example.com/file.pdf',
        './downloads',
        'file.pdf'
      );

      expect(result.success).toBe(true);
    });
  });
});
