/**
 * 浏览器交互动作 - 点击/填写/选择/搜索/查找/下载
 * 所有动作共享 browser-state.ts 的 page 实例。
 */

import { resolveInWorkspace } from './path.ts';
import {
  checkPlaywright,
  capturePageState,
  comparePageState,
  initBrowser,
  setPageStateSnapshot,
  page,
  pageStateSnapshot,
} from './browser-state.ts';

// 以下声明仅用于 page!.evaluate() 回调中的类型检查，不产生运行时代码。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const document: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const NodeFilter: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type _Element = any;

/**
 * 点击网页元素
 */
export async function clickElement(
  selector: string,
  description: string = '',
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
    await page!.evaluate('1');
  } catch {
    return { success: false, error: '浏览器页面已关闭，请重新使用 initBrowser 打开网页' };
  }

  try {
    let element = null;

    try {
      element = await page!.$(selector);
    } catch {
      // 不是有效的 CSS 选择器
    }

    if (!element && (selector.startsWith('//') || selector.startsWith('id('))) {
      element = await page!.$(`xpath=${selector}`);
    }

    if (!element) {
      const textSelector = selector.trim();
      element = await page!.locator(`text=${textSelector}`).first();
      if (!(await element.count())) {
        element = null;
      }
    }

    if (!element) {
      // 对 selector 做 CSS 转义：双引号与反斜杠会破坏选择器语法。
      // 必须先转义反斜杠再转义双引号，否则 selector="a\b" 会变成 a\\b（正确），
      // 反过来则 `\` 会转义后续的 `\"` 导致注入。
      const safe = selector.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const selectors = [
        `[id="${safe}"]`,
        `[name="${safe}"]`,
        `[placeholder="${safe}"]`,
        `button:has-text("${safe}")`,
        `a:has-text("${safe}")`,
        `[data-testid="${safe}"]`,
      ];

      for (const sel of selectors) {
        try {
          element = await page!.$(sel);
          if (element) break;
        } catch {
          continue;
        }
      }
    }

    if (!element) {
      return {
        success: false,
        error: `未找到元素：${selector}${description ? ` (${description})` : ''}`,
      };
    }

    try {
      await element.click();
    } catch {
      try {
        await element.click({ force: true });
      } catch {
        try {
          await page!.evaluate((el: _Element) => {
            el.click();
          }, element);
        } catch {
          return {
            success: false,
            error: `点击元素失败：元素不可见或被遮挡，尝试了普通点击、强制点击和JS点击均失败`,
          };
        }
      }
    }
    await page!.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const newState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, newState);
    setPageStateSnapshot(newState);

    return {
      success: true,
      data: `成功点击元素：${selector}${description ? ` (${description})` : ''}\n${changes}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `点击元素失败：${(error as Error).message}`,
    };
  }
}

/**
 * 填写表格字段
 */
export async function fillField(
  selector: string,
  value: string,
  description: string = '',
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
    await page!.evaluate('1');
  } catch {
    return { success: false, error: '浏览器页面已关闭，请重新使用 initBrowser 打开网页' };
  }

  try {
    let element = null;

    try {
      element = await page!.$(selector);
    } catch {
      // 不是有效的 CSS 选择器
    }

    if (!element && (selector.startsWith('//') || selector.startsWith('id('))) {
      element = await page!.$(`xpath=${selector}`);
    }

    if (!element) {
      // 同上方 fillField 的 safe 处理：先转义反斜杠再转义双引号。
      const safe2 = selector.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const selectors = [
        `[id="${safe2}"]`,
        `[name="${safe2}"]`,
        `[placeholder="${safe2}"]`,
        `input[aria-label="${safe2}"]`,
        `textarea[aria-label="${safe2}"]`,
        `label:has-text("${safe2}") + input`,
        `label:has-text("${safe2}") + textarea`,
      ];

      for (const sel of selectors) {
        try {
          element = await page!.$(sel);
          if (element) break;
        } catch {
          continue;
        }
      }
    }

    if (!element) {
      return {
        success: false,
        error: `未找到输入框：${selector}${description ? ` (${description})` : ''}`,
      };
    }

    await element.fill(value);

    const newState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, newState);
    setPageStateSnapshot(newState);

    return {
      success: true,
      data: `成功填写字段：${selector}${description ? ` (${description})` : ''} = "${value}"\n${changes}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `填写字段失败：${(error as Error).message}`,
    };
  }
}

/**
 * 选择下拉框选项
 */
export async function selectOption(
  selector: string,
  value: string,
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
    await page!.selectOption(selector, value);

    const newState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, newState);
    setPageStateSnapshot(newState);

    return {
      success: true,
      data: `成功选择选项：${selector} = "${value}"\n${changes}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `选择选项失败：${(error as Error).message}`,
    };
  }
}

/**
 * 下载文件
 */
export async function downloadFile(
  urlOrSelector: string,
  description: string = '',
  options: {
    savePath?: string;
    fullPath?: string;
    timeout?: number;
    acceptDownloads?: boolean;
  } = {},
): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!(await checkPlaywright())) {
    return {
      success: false,
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install',
    };
  }

  try {
    let { savePath = './downloads', fullPath } = options;
    const { timeout = 60000 } = options;

    // 校验下载路径必须在工作区内，防止路径穿越写到工作区外
    if (fullPath) {
      const resolved = resolveInWorkspace(fullPath);
      if (!resolved) {
        return { success: false, error: 'fullPath 越界：必须位于工作区内' };
      }
      fullPath = resolved;
    }
    const resolvedSavePath = resolveInWorkspace(savePath);
    if (!resolvedSavePath) {
      return { success: false, error: 'savePath 越界：必须位于工作区内' };
    }
    savePath = resolvedSavePath;

    const fs = await import('fs');
    const path = await import('path');

    const downloadDir = fullPath ? path.dirname(fullPath) : savePath;
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const needInit = !page;

    if (needInit) {
      if (urlOrSelector.startsWith('http')) {
        const initResult = await initBrowser(urlOrSelector);
        if (!initResult.success) {
          return initResult;
        }
      } else {
        return {
          success: false,
          error: '请先使用 initBrowser 打开网页，或提供完整的下载页面 URL',
        };
      }
    } else {
      if (urlOrSelector.startsWith('http')) {
        await page!.goto(urlOrSelector, { waitUntil: 'networkidle', timeout: 30000 });
      }
    }

    await page!.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page!.waitForTimeout(1000);

    let downloadElement = null;
    let usedSelector = '';

    if (!urlOrSelector.startsWith('http')) {
      try {
        downloadElement = await page!.$(urlOrSelector);
        usedSelector = urlOrSelector;
      } catch {
        // 不是有效的选择器
      }
    }

    if (!downloadElement) {
      const downloadSelectors = [
        'a[download]',
        'a[href*=".exe"]',
        'a[href*=".zip"]',
        'a[href*=".msi"]',
        'a[href*=".dmg"]',
        'a[href*=".pkg"]',
        'a[href*=".deb"]',
        'a[href*=".rpm"]',
        'a[href*=".tar"]',
        'a[href*=".gz"]',
        'button:has-text("下载")',
        'button:has-text("Download")',
        'a:has-text("下载")',
        'a:has-text("Download")',
        'a:has-text("安装")',
        'a:has-text("Installer")',
        '.download-btn',
        '.download-button',
        '#download-btn',
        '#download-button',
        '[class*="download"]',
        '[id*="download"]',
      ];

      for (const selector of downloadSelectors) {
        try {
          downloadElement = await page!.$(selector);
          if (downloadElement && (await downloadElement.isVisible())) {
            usedSelector = selector;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!downloadElement && description) {
      try {
        downloadElement = await page!.locator(`text=${description}`).first();
        if (await downloadElement.count()) {
          usedSelector = `text=${description}`;
        } else {
          downloadElement = null;
        }
      } catch {
        // 忽略错误
      }
    }

    if (!downloadElement) {
      const pageInfo = await page!.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const downloadLinks = links
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((a: any) => {
            const href = a.href || '';
            const text = (a.innerText || a.textContent || '').toLowerCase();
            return (
              href.match(/\.(exe|zip|msi|dmg|pkg|deb|rpm|tar|gz|7z|rar)$/i) ||
              text.includes('下载') ||
              text.includes('download') ||
              text.includes('安装') ||
              text.includes('installer')
            );
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((a: any) => ({
            href: a.href,
            text: (a.innerText || a.textContent || '').trim(),
            id: a.id,
            class: a.className,
          }));

        return {
          url: window.location.href,
          title: document.title,
          downloadLinks: downloadLinks.slice(0, 10),
        };
      });

      return {
        success: false,
        error: `未找到下载链接。页面信息：${pageInfo.title} (${pageInfo.url}), 可能的下载链接：${JSON.stringify(pageInfo.downloadLinks)}`,
      };
    }

    const href = await downloadElement.getAttribute('href');
    const text = await downloadElement.innerText();

    const [download] = await Promise.all([
      page!.waitForEvent('download', { timeout }),
      downloadElement.click(),
    ]);

    const suggestedFilename = download.suggestedFilename();
    // 文件名来自服务器（Content-Disposition），必须消毒：仅保留 basename，
    // 并移除路径分隔符/穿越段，防止恶意文件名逃逸 savePath 写任意路径。
    const safeFilename = path
      .basename(suggestedFilename || 'download')
      // eslint-disable-next-line no-control-regex -- \x00-\x1f 是有意移除的控制字符
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    const finalPath = fullPath ? fullPath : path.join(savePath, safeFilename);

    await download.saveAs(finalPath);

    return {
      success: true,
      data: `文件下载成功！\n文件名：${suggestedFilename}\n保存路径：${finalPath}\n来源：${text || href}\n使用选择器：${usedSelector || '自动检测'}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `下载失败：${(error as Error).message}`,
    };
  }
}

/**
 * 在页面内搜索文本内容
 */
export async function searchOnPage(
  text: string,
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
    const results = await page!.evaluate((searchText: string) => {
      function getXPathInternal(element: _Element | null): string | null {
        if (!element) return null;
        if (element.id !== '') return `id("${element.id}")`;
        if (element === document.body) return '/html/body';

        let ix = 0;
        const siblings = element.parentNode ? element.parentNode.childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling === element) {
            const parentPath = getXPathInternal(element.parentNode);
            const tagName = element.tagName.toLowerCase();
            return parentPath ? `${parentPath}/${tagName}[${ix + 1}]` : `/${tagName}[${ix + 1}]`;
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }
        return null;
      }

      const matches: Record<string, unknown>[] = [];

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);

      let node;
      while ((node = walker.nextNode())) {
        const textContent = node.textContent;
        if (textContent && textContent.toLowerCase().includes(searchText.toLowerCase())) {
          const parent = (node as _Element).parentElement;
          matches.push({
            type: 'text',
            text: textContent.trim().slice(0, 200),
            parentTag: parent?.tagName?.toLowerCase() || null,
            parentClass: parent?.className || null,
            parentXPath: getXPathInternal(parent),
          });
        }
      }

      document.querySelectorAll('input, textarea').forEach((el: _Element) => {
        const value = el.value || '';
        const placeholder = el.placeholder || '';
        if (
          value.toLowerCase().includes(searchText.toLowerCase()) ||
          placeholder.toLowerCase().includes(searchText.toLowerCase())
        ) {
          matches.push({
            type: 'input',
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            name: el.name || null,
            value: value,
            placeholder: placeholder,
            xpath: getXPathInternal(el),
          });
        }
      });

      document.querySelectorAll('button, a').forEach((el: _Element) => {
        const text = el.innerText || el.textContent || '';
        if (text.toLowerCase().includes(searchText.toLowerCase())) {
          matches.push({
            type: 'interactive',
            tag: el.tagName.toLowerCase(),
            text: text.trim(),
            href: el.href || null,
            id: el.id || null,
            xpath: getXPathInternal(el),
          });
        }
      });

      return matches.slice(0, 20);
    }, text);

    if (results.length === 0) {
      return {
        success: true,
        data: `未在页面中找到 "${text}"`,
      };
    }

    let output = `在页面中找到 ${results.length} 处匹配 "${text}"：\n\n`;
    results.forEach((result: Record<string, unknown>, idx: number) => {
      output += `[${idx + 1}] ${(result.type as string).toUpperCase()}\n`;
      if (result.text) output += `   内容：${result.text}\n`;
      if (result.value) output += `   值：${result.value}\n`;
      if (result.placeholder) output += `   占位符：${result.placeholder}\n`;
      if (result.href) output += `   链接：${result.href}\n`;
      if (result.parentTag)
        output += `   位置：${result.parentTag}${result.parentClass ? `(${result.parentClass})` : ''}\n`;
      if (result.xpath) output += `   XPath: ${result.xpath}\n`;
      output += '\n';
    });

    return { success: true, data: output };
  } catch (error: unknown) {
    return { success: false, error: `搜索失败：${(error as Error).message}` };
  }
}

/**
 * 查找页面元素并返回详细信息
 */
export async function findElements(
  selector: string,
  description: string = '',
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
    const elements = await page!.evaluate((searchSelector: string) => {
      interface DomElement {
        id?: string;
        tagName: string;
        className?: string;
        innerText?: string;
        textContent?: string;
        parentNode: DomElement | null;
        childNodes: DomElement[];
        nodeType: number;
      }
      interface FoundElementInfo {
        tag: string;
        id: string | null;
        class: string | null;
        text: string;
        xpath: string | null;
      }

      function getXPathInternal(element: DomElement | null): string | null {
        if (!element) return null;
        if (element.id !== '') return `id("${element.id}")`;
        if (element === document.body) return '/html/body';

        let ix = 0;
        const siblings = element.parentNode ? element.parentNode.childNodes : [];
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling === element) {
            const parentPath = getXPathInternal(element.parentNode);
            const tagName = element.tagName.toLowerCase();
            return parentPath ? `${parentPath}/${tagName}[${ix + 1}]` : `/${tagName}[${ix + 1}]`;
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }
        return null;
      }

      const results: FoundElementInfo[] = [];
      const found = document.querySelectorAll(searchSelector);

      if (found.length === 0) {
        document.querySelectorAll('*').forEach((el: DomElement) => {
          const text = el.innerText || el.textContent || '';
          if (text.includes(searchSelector)) {
            results.push({
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              class: el.className || null,
              text: text.trim().slice(0, 100),
              xpath: getXPathInternal(el),
            });
          }
        });
      } else {
        found.forEach((el: DomElement) => {
          results.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            class: el.className || null,
            text: (el.innerText || el.textContent || '').trim().slice(0, 100),
            xpath: getXPathInternal(el),
          });
        });
      }

      return results.slice(0, 15);
    }, selector);

    if (elements.length === 0) {
      return {
        success: true,
        data: `未找到匹配 "${selector}" 的元素${description ? ` (${description})` : ''}`,
      };
    }

    let output = `找到 ${elements.length} 个匹配元素：\n\n`;
    elements.forEach(
      (
        el: {
          tag: string;
          id: string | null;
          class: string | null;
          text: string;
          xpath: string | null;
        },
        idx: number,
      ) => {
        output += `[${idx + 1}] <${el.tag}>`;
        if (el.id) output += `#${el.id}`;
        if (el.class) output += `.${el.class.split(' ')[0]}`;
        output += `\n`;
        if (el.text) output += `   文本：${el.text}\n`;
        if (el.xpath) output += `   XPath: ${el.xpath}\n`;
        output += '\n';
      },
    );

    return { success: true, data: output };
  } catch (error) {
    return { success: false, error: `查找元素失败：${(error as Error).message}` };
  }
}
