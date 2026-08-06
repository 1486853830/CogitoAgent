/**
 * 浏览器自动化工具入口 - 延迟加载 playwright
 * 由 browser-state.ts（共享状态+生命周期）、browser-actions.ts（交互动作）组合而成。
 */

import {
  checkPlaywright,
  capturePageState,
  comparePageState,
  initBrowser,
  closeBrowser,
  setPageStateSnapshot,
  page,
  pageStateSnapshot,
} from './browser-state.ts';
import {
  clickElement,
  fillField,
  selectOption,
  downloadFile,
  searchOnPage,
  findElements,
} from './browser-actions.ts';

// 以下声明仅用于 page.evaluate() 回调中的类型检查，不产生运行时代码。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const document: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const XPathResult: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const KeyboardEvent: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Event: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type _Element = any;

/**
 * 查看页面变化（对比当前状态和上次快照）
 */
async function viewChanges(): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!(await checkPlaywright())) {
    return {
      success: false,
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install',
    };
  }

  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }

  try {
    const currentState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, currentState);
    setPageStateSnapshot(currentState);

    return {
      success: true,
      data: changes || '页面没有明显变化',
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `查看变化失败：${(error as Error).message}`,
    };
  }
}

/**
 * 获取页面内容
 */
async function getPageContent(): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  if (!(await checkPlaywright())) {
    return {
      success: false,
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install',
    };
  }

  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }

  try {
    const content = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 3000),
        forms: Array.from(document.querySelectorAll('input, select, textarea'))
          .map((el: _Element) => ({
            tag: el.tagName.toLowerCase(),
            name: el.name,
            id: el.id,
            type: el.type,
            value: el.value,
            placeholder: el.placeholder,
          }))
          .slice(0, 30),
        tables: Array.from(document.querySelectorAll('table'))
          .map((table: _Element, idx: number) => {
            const rows: string[][] = [];
            table.querySelectorAll('tr').forEach((row: _Element) => {
              const cells: string[] = [];
              row.querySelectorAll('td, th').forEach((cell: _Element) => {
                cells.push(cell.innerText.trim());
              });
              if (cells.length > 0) rows.push(cells);
            });
            return { index: idx, rows: rows.slice(0, 10) };
          })
          .slice(0, 5),
      };
    });

    return { success: true, data: content };
  } catch (error: unknown) {
    return { success: false, error: `获取页面内容失败：${(error as Error).message}` };
  }
}

/**
 * 截图页面
 */
async function takeScreenshot(
  name: string = 'screenshot',
): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!(await checkPlaywright())) {
    return {
      success: false,
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install',
    };
  }

  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }

  try {
    // 安全验证：防止路径注入
    const safeName = name.replace(/[\\:*?"<>|]/g, '_').replace(/\.\./g, '');
    const screenshotPath = `${safeName}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      success: true,
      data: `截图已保存：${screenshotPath}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `截图失败：${(error as Error).message}` };
  }
}

/**
 * 在搜索引擎中搜索
 */
async function searchOnEngine(query: string, engine: string = 'bing'): Promise<any> {
  if (!(await checkPlaywright())) {
    return {
      success: false,
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install',
    };
  }

  try {
    let searchUrl: string;
    if (engine.startsWith('http')) {
      searchUrl = engine;
    } else {
      const engines: Record<string, string> = {
        baidu: 'https://www.baidu.com',
        google: 'https://www.google.com',
        bing: 'https://www.bing.com',
        sogou: 'https://www.sogou.com',
        '360': 'https://www.so.com',
      };
      searchUrl = engines[engine.toLowerCase()] || engines['baidu'];
    }

    const initResult = await initBrowser(searchUrl);
    if (!initResult.success) {
      return initResult;
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const searchInputSelectors = [
      'input[name="wd"]',
      '#kw',
      'input#kw',
      'input[name="q"]',
      'textarea[name="q"]',
      '#sb_form_q',
      'input[name="keyword"]',
      '#keyword',
      'input[name="query"]',
      '#query',
      'input[type="search"]',
      'input[type="text"]',
      'input[role="combobox"]',
      'input[aria-label*="搜索"]',
      'input[aria-label*="search" i]',
      'input[placeholder*="搜索"]',
      'input[placeholder*="search" i]',
      'input[placeholder*="百度"]',
      '.search-input',
      '.search-box input',
      'form input[type="text"]',
      'form input[type="search"]',
    ];

    let searchInput = null;
    let usedSelector = '';

    for (const selector of searchInputSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput && (await searchInput.isVisible())) {
          usedSelector = selector;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!searchInput) {
      try {
        const inputs = await page.$$('input, textarea');
        for (const input of inputs) {
          const isVisible = await input.isVisible().catch(() => false);
          if (isVisible) {
            const type = await input.getAttribute('type');
            const id = await input.getAttribute('id');
            const className = await input.getAttribute('class');
            const placeholder = await input.getAttribute('placeholder');

            const isSearchInput =
              (type === 'text' || type === 'search' || type === null) &&
              (id?.includes('kw') ||
                id?.includes('search') ||
                id?.includes('q') ||
                className?.includes('search') ||
                className?.includes('input') ||
                placeholder?.includes('搜索') ||
                placeholder?.includes('search') ||
                placeholder?.includes('百度'));

            if (isSearchInput) {
              searchInput = input;
              usedSelector = `自动检测 (id=${id}, class=${className})`;
              break;
            }
          }
        }
      } catch {
        // 忽略错误
      }
    }

    if (!searchInput) {
      try {
        const inputs = await page.$$('input[type="text"], input:not([type])');
        for (const input of inputs) {
          if (await input.isVisible().catch(() => false)) {
            const boundingBox = await input.boundingBox();
            if (boundingBox && boundingBox.width > 100 && boundingBox.height > 30) {
              searchInput = input;
              usedSelector = '第一个可见文本框';
              break;
            }
          }
        }
      } catch {
        // 忽略错误
      }
    }

    if (!searchInput) {
      const pageInfo = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea'));
        return {
          url: window.location.href,
          title: document.title,
          inputCount: inputs.length,
          visibleInputs: inputs
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((i: any) => i.offsetParent !== null)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((i: any) => ({
              tag: i.tagName,
              id: i.id,
              name: i.name,
              type: i.type,
              class: i.className,
              placeholder: i.placeholder,
            }))
            .slice(0, 10),
        };
      });

      return {
        success: false,
        error: `未找到搜索框。页面信息：${pageInfo.title} (${pageInfo.url}), 输入框数量：${pageInfo.inputCount}, 可见输入框：${JSON.stringify(pageInfo.visibleInputs)}`,
      };
    }

    try {
      await page.evaluate(
        (selector: string, value: string) => {
          let element: any = null;

          try {
            element = document.querySelector(selector);
          } catch {
            // 无效选择器时 element 保持 null，回退到 XPath
          }

          if (!element && (selector.startsWith('//') || selector.startsWith('id('))) {
            const result = document.evaluate(
              selector,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null,
            );
            element = result.singleNodeValue;
          }

          if (
            !element &&
            !selector.includes(' ') &&
            !selector.startsWith('.') &&
            !selector.startsWith('[')
          ) {
            element = document.getElementById(selector);
          }

          if (element) {
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('focus', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
          } else {
            throw new Error(`找不到元素：${selector}`);
          }
        },
        usedSelector,
        query,
      );
    } catch (fillError: any) {
      try {
        await searchInput.evaluate((el: any, value: string) => {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, query);
      } catch {
        return {
          success: false,
          error: `填写搜索框失败：${fillError.message}`,
        };
      }
    }

    const submitSelectors = [
      'input[type="submit"]',
      '#su',
      'button[type="submit"]',
      '.btn',
      'input[value="Google 搜索"]',
      'input[value*="Search"]',
      'button[aria-label*="搜索"]',
      'button[aria-label*="search" i]',
      'input[value*="搜索"]',
      'input[value*="Search"]',
      '.search-btn',
      '#search-btn',
      'button.search-button',
    ];

    let submitButton = null;
    for (const selector of submitSelectors) {
      try {
        submitButton = await page.$(selector);
        if (submitButton && (await submitButton.isVisible())) {
          break;
        }
      } catch {
        continue;
      }
    }

    if (submitButton) {
      await submitButton.click();
    } else {
      await searchInput.press('Enter');
    }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const searchResults = await page.evaluate(() => {
      const results: any[] = [];
      const resultContainers = document.querySelectorAll(
        '#content_left, #search, .results, .search-results, [role="main"], #main',
      );
      const container = resultContainers[0] || document.body;

      container.querySelectorAll('a[href]').forEach((link: any) => {
        const href = link.href;
        const text = (link.innerText || link.textContent || '').trim();

        if (
          href &&
          text &&
          text.length > 5 &&
          text.length < 200 &&
          !href.includes('javascript:') &&
          !text.includes('登录') &&
          !text.includes('注册') &&
          !text.includes('广告')
        ) {
          results.push({
            title: text,
            url: href,
          });
        }
      });

      const unique: any[] = [];
      const seen = new Set();
      for (const item of results) {
        if (!seen.has(item.url) && unique.length < 15) {
          unique.push(item);
          seen.add(item.url);
        }
      }

      return unique;
    });

    let output = `已在 ${engine} 搜索 "${query}"\n\n`;
    output += `当前页面：${page.url()}\n`;
    output += `使用搜索框选择器：${usedSelector}\n\n`;

    if (searchResults.length > 0) {
      output += `找到 ${searchResults.length} 个搜索结果：\n\n`;
      searchResults.forEach((result: any, idx: number) => {
        output += `[${idx + 1}] ${result.title}\n`;
        output += `    ${result.url}\n\n`;
      });
    } else {
      output += `未提取到搜索结果，可能需要手动查看页面。\n`;
    }

    setPageStateSnapshot(await capturePageState());

    return { success: true, data: output };
  } catch (error) {
    return { success: false, error: `搜索引擎搜索失败：${(error as Error).message}` };
  }
}

export {
  initBrowser,
  closeBrowser,
  clickElement,
  fillField,
  selectOption,
  viewChanges,
  getPageContent,
  takeScreenshot,
  searchOnPage,
  findElements,
  searchOnEngine,
  downloadFile,
};
