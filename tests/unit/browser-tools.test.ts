/**
 * browser.ts 单元测试
 *
 * 覆盖 src/agent/tools/browser.ts 中导出的所有函数：
 *  - initBrowser / closeBrowser
 *  - clickElement / fillField / selectOption
 *  - viewChanges / getPageContent / takeScreenshot
 *  - searchOnPage / findElements / searchOnEngine / downloadFile
 *
 * 通过 jest.unstable_mockModule 模拟 playwright（动态 import），
 * 以及 fs / path 模块（downloadFile 中动态 import）。
 */

import { jest } from '@jest/globals';

// === Mock playwright 模块 ===
const mockLaunch = jest.fn();

jest.unstable_mockModule('playwright', () => ({
  chromium: {
    launch: mockLaunch,
  },
}));

// === Mock fs / path 避免 downloadFile 产生文件系统副作用 ===
jest.unstable_mockModule('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.unstable_mockModule('path', () => ({
  dirname: jest.fn().mockReturnValue('/tmp'),
  join: jest.fn().mockReturnValue('/tmp/downloaded-file'),
}));

const browserModule = await import('../../src/agent/tools/browser.ts');

// === 辅助函数 ===

function createMockPage() {
  const mockState = {
    url: 'http://test.example.com',
    title: 'Test Page',
    forms: [],
    bodyText: 'page body content',
  };

  const mockPage: any = {
    goto: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(mockState),
    screenshot: jest.fn().mockResolvedValue(undefined),
    $: jest.fn().mockResolvedValue(null),
    $$: jest.fn().mockResolvedValue([]),
    locator: jest.fn().mockReturnValue({
      first: jest.fn().mockResolvedValue({
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined),
        fill: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(undefined),
        getAttribute: jest.fn().mockResolvedValue(null),
        innerText: jest.fn().mockResolvedValue(''),
        isVisible: jest.fn().mockResolvedValue(true),
        press: jest.fn().mockResolvedValue(undefined),
        boundingBox: jest.fn().mockResolvedValue({ width: 200, height: 40 }),
      }),
    }),
    selectOption: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForEvent: jest.fn().mockResolvedValue({}),
    url: jest.fn().mockReturnValue('http://test.example.com'),
    close: jest.fn().mockResolvedValue(undefined),
  };

  return { mockPage, mockState };
}

function createMockBrowser() {
  const { mockPage, mockState } = createMockPage();
  const mockContext = {
    newPage: jest.fn().mockResolvedValue(mockPage),
  };
  const mockBrowser = {
    newContext: jest.fn().mockResolvedValue(mockContext),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { mockBrowser, mockContext, mockPage, mockState };
}

describe('browser tools', () => {
  let mockBrowser: any;
  let mockPage: any;
  let mockState: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    await browserModule.closeBrowser();

    const mocks = createMockBrowser();
    mockBrowser = mocks.mockBrowser;
    mockPage = mocks.mockPage;
    mockState = mocks.mockState;
    mockLaunch.mockResolvedValue(mockBrowser);
  });

  afterEach(async () => {
    await browserModule.closeBrowser();
  });

  // ===================================================================
  // 未初始化状态
  // ===================================================================
  describe('not initialized state', () => {
    it('clickElement should return error when page is null', async () => {
      const result = await browserModule.clickElement('#button');
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('fillField should return error when page is null', async () => {
      const result = await browserModule.fillField('input', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('selectOption should return error when page is null', async () => {
      const result = await browserModule.selectOption('select', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('viewChanges should return error when page is null', async () => {
      const result = await browserModule.viewChanges();
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('getPageContent should return error when page is null', async () => {
      const result = await browserModule.getPageContent();
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('takeScreenshot should return error when page is null', async () => {
      const result = await browserModule.takeScreenshot();
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('searchOnPage should return error when page is null', async () => {
      const result = await browserModule.searchOnPage('text');
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('findElements should return error when page is null', async () => {
      const result = await browserModule.findElements('selector');
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });
  });

  // ===================================================================
  // initBrowser
  // ===================================================================
  describe('initBrowser', () => {
    it('should initialize browser and navigate to url', async () => {
      const result = await browserModule.initBrowser('http://test.example.com');

      expect(result.success).toBe(true);
      expect(result.data).toContain('http://test.example.com');
      expect(mockLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: false,
          args: ['--start-maximized'],
        }),
      );
      expect(mockPage.goto).toHaveBeenCalledWith(
        'http://test.example.com',
        expect.objectContaining({ waitUntil: 'networkidle' }),
      );
    });

    it('should create context with correct viewport', async () => {
      await browserModule.initBrowser('http://test.example.com');

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: { width: 1920, height: 1080 },
          acceptDownloads: true,
        }),
      );
    });

    it('should return error when launch fails', async () => {
      mockLaunch.mockRejectedValue(new Error('launch failed'));

      const result = await browserModule.initBrowser('http://test.example.com');

      expect(result.success).toBe(false);
      expect(result.error).toContain('launch failed');
    });

    it('should close existing browser before re-initializing', async () => {
      await browserModule.initBrowser('http://test.example.com');
      const firstBrowser = mockBrowser;

      // Re-init with new browser
      const newMocks = createMockBrowser();
      mockLaunch.mockResolvedValue(newMocks.mockBrowser);

      await browserModule.initBrowser('http://test2.example.com');

      expect(firstBrowser.close).toHaveBeenCalled();
    });

    it('should handle close error when re-initializing', async () => {
      await browserModule.initBrowser('http://test.example.com');
      mockBrowser.close.mockRejectedValue(new Error('already closed'));

      const newMocks = createMockBrowser();
      mockLaunch.mockResolvedValue(newMocks.mockBrowser);

      const result = await browserModule.initBrowser('http://test2.example.com');
      expect(result.success).toBe(true);
    });
  });

  // ===================================================================
  // closeBrowser
  // ===================================================================
  describe('closeBrowser', () => {
    it('should return success when no browser is initialized', async () => {
      const result = await browserModule.closeBrowser();
      expect(result.success).toBe(true);
      expect(result.data).toContain('浏览器已关闭');
    });

    it('should close browser when initialized', async () => {
      await browserModule.initBrowser('http://test.example.com');
      const result = await browserModule.closeBrowser();

      expect(result.success).toBe(true);
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      await browserModule.initBrowser('http://test.example.com');
      mockBrowser.close.mockRejectedValue(new Error('close failed'));

      const result = await browserModule.closeBrowser();
      expect(result.success).toBe(true);
    });
  });

  // ===================================================================
  // clickElement
  // ===================================================================
  describe('clickElement', () => {
    it('should click element found by CSS selector', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const mockElement = { click: jest.fn().mockResolvedValue(undefined) };
      mockPage.$.mockResolvedValue(mockElement);

      const result = await browserModule.clickElement('#button', 'submit button');

      expect(result.success).toBe(true);
      expect(result.data).toContain('#button');
      expect(result.data).toContain('submit button');
      expect(mockElement.click).toHaveBeenCalled();
    });

    it('should return error when element is not found', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.$.mockResolvedValue(null);

      const result = await browserModule.clickElement('#nonexistent', 'description');

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到元素');
      expect(result.error).toContain('#nonexistent');
    });

    it('should return error when page is closed (liveness check fails)', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockRejectedValue(new Error('page closed'));

      const result = await browserModule.clickElement('#button');

      expect(result.success).toBe(false);
      expect(result.error).toContain('浏览器页面已关闭');
    });

    it('should try force click and JS click when normal click fails', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const mockElement = { click: jest.fn().mockRejectedValue(new Error('click failed')) };
      mockPage.$.mockResolvedValue(mockElement);

      // Liveness check resolves, but JS click (evaluate with element arg) rejects
      mockPage.evaluate.mockImplementation((fn: any, ...args: any[]) => {
        if (fn === '1') return Promise.resolve();
        return Promise.reject(new Error('js click failed'));
      });

      const result = await browserModule.clickElement('#button');

      expect(result.success).toBe(false);
      expect(result.error).toContain('元素不可见或被遮挡');
      expect(mockElement.click).toHaveBeenCalledTimes(2);
    });
  });

  // ===================================================================
  // fillField
  // ===================================================================
  describe('fillField', () => {
    it('should fill field successfully', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const mockElement = { fill: jest.fn().mockResolvedValue(undefined) };
      mockPage.$.mockResolvedValue(mockElement);

      const result = await browserModule.fillField('input', 'test value', 'username');

      expect(result.success).toBe(true);
      expect(result.data).toContain('input');
      expect(result.data).toContain('test value');
      expect(mockElement.fill).toHaveBeenCalledWith('test value');
    });

    it('should return error when input field is not found', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.$.mockResolvedValue(null);

      const result = await browserModule.fillField('#missing', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到输入框');
    });

    it('should return error when fill throws', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const mockElement = { fill: jest.fn().mockRejectedValue(new Error('fill failed')) };
      mockPage.$.mockResolvedValue(mockElement);

      const result = await browserModule.fillField('input', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('填写字段失败');
    });

    it('should return error when page is closed (liveness check fails)', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockRejectedValue(new Error('page closed'));

      const result = await browserModule.fillField('input', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('浏览器页面已关闭');
    });
  });

  // ===================================================================
  // selectOption
  // ===================================================================
  describe('selectOption', () => {
    it('should select option successfully', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.selectOption.mockResolvedValue(undefined);

      const result = await browserModule.selectOption('select#country', 'CN');

      expect(result.success).toBe(true);
      expect(result.data).toContain('select#country');
      expect(result.data).toContain('CN');
      expect(mockPage.selectOption).toHaveBeenCalledWith('select#country', 'CN');
    });

    it('should return error when selectOption throws', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.selectOption.mockRejectedValue(new Error('select failed'));

      const result = await browserModule.selectOption('select', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('选择选项失败');
    });
  });

  // ===================================================================
  // viewChanges
  // ===================================================================
  describe('viewChanges', () => {
    it('should return changes (or no change) successfully', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const result = await browserModule.viewChanges();

      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('string');
    });

    it('should detect URL changes', async () => {
      await browserModule.initBrowser('http://test.example.com');

      // Override capturePageState to return a different URL
      mockPage.evaluate.mockResolvedValue({
        ...mockState,
        url: 'http://changed.example.com',
      });

      const result = await browserModule.viewChanges();

      expect(result.success).toBe(true);
      expect(result.data).toContain('URL 变化');
    });

    it('should handle capturePageState error gracefully and still return changes', async () => {
      await browserModule.initBrowser('http://test.example.com');

      // capturePageState catches evaluate errors internally and returns { error: message }
      mockPage.evaluate.mockRejectedValue(new Error('evaluate failed'));

      const result = await browserModule.viewChanges();

      // viewChanges does not throw — it receives an error-state object from
      // capturePageState and compares it with the snapshot, detecting changes.
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('string');
    });
  });

  // ===================================================================
  // getPageContent
  // ===================================================================
  describe('getPageContent', () => {
    it('should return page content successfully', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockResolvedValue({
        url: 'http://test.example.com',
        title: 'Test Page',
        bodyText: 'body text',
        forms: [],
        tables: [],
      });

      const result = await browserModule.getPageContent();

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('http://test.example.com');
      expect(result.data.title).toBe('Test Page');
    });

    it('should return error when evaluate throws', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockRejectedValue(new Error('evaluate failed'));

      const result = await browserModule.getPageContent();

      expect(result.success).toBe(false);
      expect(result.error).toContain('获取页面内容失败');
    });
  });

  // ===================================================================
  // takeScreenshot
  // ===================================================================
  describe('takeScreenshot', () => {
    it('should take screenshot successfully', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const result = await browserModule.takeScreenshot('my-screenshot');

      expect(result.success).toBe(true);
      expect(result.data).toContain('my-screenshot');
      expect(result.data).toContain('.png');
      expect(mockPage.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: true }));
    });

    it('should sanitize screenshot name to prevent path injection', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const result = await browserModule.takeScreenshot('../etc/passwd');

      expect(result.success).toBe(true);
      expect(result.data).not.toContain('../');
      expect(result.data).toContain('passwd');
    });

    it('should return error when screenshot throws', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.screenshot.mockRejectedValue(new Error('screenshot failed'));

      const result = await browserModule.takeScreenshot();

      expect(result.success).toBe(false);
      expect(result.error).toContain('截图失败');
    });
  });

  // ===================================================================
  // searchOnPage
  // ===================================================================
  describe('searchOnPage', () => {
    it('should return "not found" when no matches exist', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockResolvedValue([]);

      const result = await browserModule.searchOnPage('nonexistent text');

      expect(result.success).toBe(true);
      expect(result.data).toContain('未在页面中找到');
    });

    it('should format matches when results are found', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockResolvedValue([
        {
          type: 'text',
          text: 'found text content',
          parentTag: 'p',
          parentClass: 'content',
          parentXPath: '/html/body/p[1]',
        },
        {
          type: 'interactive',
          tag: 'a',
          text: 'found link',
          href: 'http://link.example.com',
          id: 'link1',
          xpath: '/html/body/a[1]',
        },
      ]);

      const result = await browserModule.searchOnPage('found');

      expect(result.success).toBe(true);
      expect(result.data).toContain('2 处匹配');
      expect(result.data).toContain('found text content');
      expect(result.data).toContain('found link');
    });

    it('should return error when evaluate throws', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockRejectedValue(new Error('search failed'));

      const result = await browserModule.searchOnPage('text');

      expect(result.success).toBe(false);
      expect(result.error).toContain('搜索失败');
    });
  });

  // ===================================================================
  // findElements
  // ===================================================================
  describe('findElements', () => {
    it('should return "not found" when no elements match', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockResolvedValue([]);

      const result = await browserModule.findElements('.nonexistent', 'test desc');

      expect(result.success).toBe(true);
      expect(result.data).toContain('未找到匹配');
    });

    it('should format found elements', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockResolvedValue([
        {
          tag: 'button',
          id: 'submit',
          class: 'btn primary',
          text: 'Submit',
          xpath: '/html/body/button[1]',
        },
      ]);

      const result = await browserModule.findElements('button', 'submit button');

      expect(result.success).toBe(true);
      expect(result.data).toContain('1 个匹配元素');
      expect(result.data).toContain('<button>');
      expect(result.data).toContain('#submit');
    });

    it('should return error when evaluate throws', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.evaluate.mockRejectedValue(new Error('find failed'));

      const result = await browserModule.findElements('selector');

      expect(result.success).toBe(false);
      expect(result.error).toContain('查找元素失败');
    });
  });

  // ===================================================================
  // searchOnEngine
  // ===================================================================
  describe('searchOnEngine', () => {
    it('should return error when no search input is found', async () => {
      const result = await browserModule.searchOnEngine('test query', 'baidu');

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到搜索框');
    });

    it('should use bing as default engine', async () => {
      const result = await browserModule.searchOnEngine('test query');

      // Should attempt to open bing (the default engine)
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.bing.com',
        expect.objectContaining({ waitUntil: 'networkidle' }),
      );
    });

    it('should accept custom engine URL', async () => {
      const result = await browserModule.searchOnEngine('test query', 'https://custom.engine.com');

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://custom.engine.com',
        expect.objectContaining({ waitUntil: 'networkidle' }),
      );
    });

    it('should return error when initBrowser fails', async () => {
      mockLaunch.mockRejectedValue(new Error('launch failed'));

      const result = await browserModule.searchOnEngine('test query', 'bing');

      expect(result.success).toBe(false);
      // searchOnEngine returns the initBrowser error directly
      expect(result.error).toContain('launch failed');
    });
  });

  // ===================================================================
  // downloadFile
  // ===================================================================
  describe('downloadFile', () => {
    it('should return error when no page and non-http url', async () => {
      const result = await browserModule.downloadFile('#download-link');

      expect(result.success).toBe(false);
      expect(result.error).toContain('请先使用 initBrowser');
    });

    it('should return error when download element is not found', async () => {
      await browserModule.initBrowser('http://test.example.com');

      mockPage.$.mockResolvedValue(null);

      const result = await browserModule.downloadFile('#missing-download');

      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到下载链接');
    });

    it('should download file successfully when download element is found', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const mockDownloadElement = {
        click: jest.fn().mockResolvedValue(undefined),
        getAttribute: jest.fn().mockResolvedValue('http://file.example.com/file.zip'),
        innerText: jest.fn().mockResolvedValue('Download'),
        isVisible: jest.fn().mockResolvedValue(true),
      };
      const mockDownload = {
        suggestedFilename: jest.fn().mockReturnValue('file.zip'),
        saveAs: jest.fn().mockResolvedValue(undefined),
        finished: jest.fn().mockResolvedValue(undefined),
      };

      mockPage.$.mockImplementation((selector: string) => {
        if (selector === 'a[download]') return Promise.resolve(mockDownloadElement);
        return Promise.resolve(null);
      });
      mockPage.waitForEvent.mockResolvedValue(mockDownload);

      const result = await browserModule.downloadFile('#download-btn', 'download button');

      expect(result.success).toBe(true);
      expect(result.data).toContain('file.zip');
      expect(result.data).toContain('/tmp/downloaded-file');
      expect(mockDownload.saveAs).toHaveBeenCalled();
      expect(mockDownload.finished).toHaveBeenCalled();
    });

    it('should return error when download fails', async () => {
      await browserModule.initBrowser('http://test.example.com');

      const mockDownloadElement = {
        click: jest.fn().mockRejectedValue(new Error('click failed')),
        getAttribute: jest.fn().mockResolvedValue('http://file.example.com/file.zip'),
        innerText: jest.fn().mockResolvedValue('Download'),
        isVisible: jest.fn().mockResolvedValue(true),
      };

      mockPage.$.mockImplementation((selector: string) => {
        if (selector === 'a[download]') return Promise.resolve(mockDownloadElement);
        return Promise.resolve(null);
      });
      mockPage.waitForEvent.mockRejectedValue(new Error('download timeout'));

      const result = await browserModule.downloadFile('#download-btn');

      expect(result.success).toBe(false);
      expect(result.error).toContain('下载失败');
    });
  });

  // ===================================================================
  // 浏览器状态管理
  // ===================================================================
  describe('browser state management', () => {
    it('should reset state after closeBrowser', async () => {
      await browserModule.initBrowser('http://test.example.com');
      await browserModule.closeBrowser();

      // After close, functions should return "not initialized" error
      const result = await browserModule.getPageContent();
      expect(result.success).toBe(false);
      expect(result.error).toContain('请先');
    });

    it('should allow re-initialization after close', async () => {
      await browserModule.initBrowser('http://test1.example.com');
      await browserModule.closeBrowser();

      const result = await browserModule.initBrowser('http://test2.example.com');
      expect(result.success).toBe(true);
      expect(result.data).toContain('http://test2.example.com');
    });
  });
});
