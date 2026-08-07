/**
 * 浏览器共享状态与生命周期 - 供 browser.ts / browser-actions.ts 复用
 *
 * 浏览器全局的 page/browser/chromium 快照状态统一收敛到此模块，
 * 避免多个文件各自声明导致状态不一致；入口与动作模块通过本模块共享同一实例。
 */

// 以下声明仅用于 page.evaluate() 回调中的类型检查，不产生运行时代码。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const document: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type _Element = any;

import type { Browser, Page } from 'playwright';

type ChromiumModule = typeof import('playwright').chromium;

export let browser: Browser | null = null; // playwright Browser, lazily loaded
export let page: Page | null = null; // playwright Page, lazily loaded
export let pageStateSnapshot: Record<string, unknown> | null = null;
// playwright chromium 模块对象（lazily loaded）
export let chromium: ChromiumModule | null = null;

export function setBrowser(b: Browser | null): void {
  browser = b;
}

export function setPage(p: Page | null): void {
  page = p;
}

export function setChromium(c: ChromiumModule | null): void {
  chromium = c;
}

export function setPageStateSnapshot(s: Record<string, unknown> | null): void {
  pageStateSnapshot = s;
}

/**
 * 检查 playwright 是否可用
 */
export async function checkPlaywright(): Promise<boolean> {
  if (chromium) return true;

  try {
    const { chromium: chromiumModule } = await import('playwright');
    chromium = chromiumModule;
    return true;
  } catch {
    return false;
  }
}

/**
 * 捕获页面当前状态（用于后续对比变化）
 */
export async function capturePageState(): Promise<Record<string, unknown> | null> {
  if (!page) return null;

  try {
    const state = await page.evaluate(() => {
      // getXPath 必须在浏览器上下文内定义：page.evaluate 回调在页面 V8 上下文序列化执行，
      // 无法访问 Node 模块作用域的函数，外部定义会导致 ReferenceError。
      function getXPath(element: _Element | null): string | null {
        if (!element) return null;
        if (element.id !== '') return `id("${element.id}")`;
        if (element === document.body) return '/html/body';

        let ix = 0;
        const siblings = element.parentNode ? element.parentNode.childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling === element) {
            const parentPath = getXPath(element.parentNode);
            const tagName = element.tagName.toLowerCase();
            return parentPath ? `${parentPath}/${tagName}[${ix + 1}]` : `/${tagName}[${ix + 1}]`;
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }
        return null;
      }

      const forms: Record<string, unknown>[] = [];
      document
        .querySelectorAll('form, input, select, textarea, button, table')
        .forEach((el: _Element) => {
          forms.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            class: el.className || null,
            name: el.name || null,
            type: el.type || null,
            value: el.value || null,
            text: el.innerText?.slice(0, 100) || null,
            placeholder: el.placeholder || null,
            href: el.href || null,
            xpath: getXPath(el),
          });
        });

      return {
        url: window.location.href,
        title: document.title,
        forms: forms.slice(0, 50),
        bodyText: document.body.innerText.slice(0, 2000),
      };
    });

    return state;
  } catch (error: unknown) {
    return { error: (error as Error).message };
  }
}

/**
 * 比较页面状态变化
 */
export function comparePageState(
  oldState: Record<string, unknown> | null,
  newState: Record<string, unknown> | null,
): string {
  if (!oldState || !newState) return '';

  const changes: string[] = [];

  if (oldState.url !== newState.url) {
    changes.push(`URL 变化：${oldState.url} → ${newState.url}`);
  }

  if (oldState.title !== newState.title) {
    changes.push(`标题变化：${oldState.title} → ${newState.title}`);
  }

  if (oldState.forms && newState.forms) {
    const oldValues = new Map(
      (oldState.forms as Record<string, unknown>[]).map((f) => [f.xpath, f.value]),
    );
    const newValues = new Map(
      (newState.forms as Record<string, unknown>[]).map((f) => [f.xpath, f.value]),
    );

    for (const [xpath, newValue] of newValues.entries()) {
      const oldValue = oldValues.get(xpath);
      if (oldValue !== newValue) {
        const form = (newState.forms as Record<string, unknown>[]).find(
          (f) => f.xpath === xpath,
        ) as Record<string, unknown> | undefined;
        changes.push(
          `表单变化：${form?.tag || '元素'}${form?.name ? `[name="${form.name}"]` : ''}${form?.id ? `[id="${form.id}"]` : ''} 值从 "${oldValue || '空'}" 变为 "${newValue || '空'}"`,
        );
      }
    }
  }

  if (oldState.bodyText !== newState.bodyText) {
    changes.push('页面文本内容发生变化');
  }

  return changes.length > 0 ? changes.join('\n') : '无明显变化';
}

/**
 * 初始化浏览器并打开网页
 */
export async function initBrowser(
  url: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!(await checkPlaywright())) {
    return {
      success: false,
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install',
    };
  }

  try {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // 忽略关闭错误
      }
      browser = null;
      page = null;
    }

    browser = await chromium!.launch({
      headless: false,
      args: ['--start-maximized'],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
    });
    page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    pageStateSnapshot = await capturePageState();

    return {
      success: true,
      data: `已成功打开网页：${url}`,
    };
  } catch (error: unknown) {
    browser = null;
    page = null;
    return {
      success: false,
      error: `打开网页失败：${(error as Error).message}`,
    };
  }
}

/**
 * 关闭浏览器
 */
export async function closeBrowser(): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  try {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // 忽略已经关闭的错误
      }
      browser = null;
      page = null;
      pageStateSnapshot = null;
    }
    return { success: true, data: '浏览器已关闭' };
  } catch {
    browser = null;
    page = null;
    pageStateSnapshot = null;
    return { success: true, data: '浏览器状态已清理' };
  }
}
