import { chromium } from 'playwright';

/**
 * 浏览器自动化实例管理
 */
let browser = null;
let page = null;
let pageStateSnapshot = null;

/**
 * 初始化浏览器并打开网页
 */
async function initBrowser(url) {
  try {
    // 清理可能已关闭的旧实例
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // 忽略关闭错误
      }
      browser = null;
      page = null;
    }
    
    browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    page = await context.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    pageStateSnapshot = await capturePageState();
    
    return { 
      success: true, 
      data: `已成功打开网页：${url}` 
    };
  } catch (error) {
    // 确保失败后清理状态
    browser = null;
    page = null;
    return { 
      success: false, 
      error: `打开网页失败：${error.message}` 
    };
  }
}

/**
 * 捕获页面当前状态（用于后续对比变化）
 */
async function capturePageState() {
  if (!page) return null;
  
  try {
    const state = await page.evaluate(() => {
      // 获取所有表单元素
      const forms = [];
      document.querySelectorAll('form, input, select, textarea, button, table').forEach((el, idx) => {
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
          xpath: getXPath(el)
        });
      });
      
      return {
        url: window.location.href,
        title: document.title,
        forms: forms.slice(0, 50), // 限制数量避免过多
        bodyText: document.body.innerText.slice(0, 2000)
      };
    });
    
    return state;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * 生成元素的 XPath
 */
function getXPath(element) {
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

/**
 * 点击网页元素
 * @param {string} selector - CSS 选择器或 XPath
 * @param {string} description - 元素描述（可选）
 */
async function clickElement(selector, description = '') {
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  // 检查页面是否仍然有效
  try {
    await page.evaluate('1');
  } catch (e) {
    return { success: false, error: '浏览器页面已关闭，请重新使用 initBrowser 打开网页' };
  }
  
  try {
    // 尝试多种选择器策略
    let element = null;
    
    // 1. 尝试作为 CSS 选择器
    try {
      element = await page.$(selector);
    } catch (e) {
      // 不是有效的 CSS 选择器
    }
    
    // 2. 如果没找到，尝试 XPath
    if (!element && selector.startsWith('//') || selector.startsWith('id(')) {
      element = await page.$(`xpath=${selector}`);
    }
    
    // 3. 如果还是没找到，尝试通过文本内容查找
    if (!element) {
      const textSelector = selector.trim();
      element = await page.locator(`text=${textSelector}`).first();
      if (!await element.count()) {
        element = null;
      }
    }
    
    // 4. 尝试通过常见属性查找
    if (!element) {
      const selectors = [
        `[id="${selector}"]`,
        `[name="${selector}"]`,
        `[placeholder="${selector}"]`,
        `button:has-text("${selector}")`,
        `a:has-text("${selector}")`,
        `[data-testid="${selector}"]`
      ];
      
      for (const sel of selectors) {
        try {
          element = await page.$(sel);
          if (element) break;
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!element) {
      return { 
        success: false, 
        error: `未找到元素：${selector}${description ? ` (${description})` : ''}` 
      };
    }
    
    await element.click();
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    
    const newState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, newState);
    pageStateSnapshot = newState;
    
    return { 
      success: true, 
      data: `成功点击元素：${selector}${description ? ` (${description})` : ''}\n${changes}` 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `点击元素失败：${error.message}` 
    };
  }
}

/**
 * 填写表格字段
 * @param {string} selector - 输入框选择器
 * @param {string} value - 要填写的值
 * @param {string} description - 字段描述（可选）
 */
async function fillField(selector, value, description = '') {
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  // 检查页面是否仍然有效
  try {
    await page.evaluate('1');
  } catch (e) {
    return { success: false, error: '浏览器页面已关闭，请重新使用 initBrowser 打开网页' };
  }
  
  try {
    let element = null;
    
    // 尝试多种选择器策略
    try {
      element = await page.$(selector);
    } catch (e) {
      // 不是有效的 CSS 选择器
    }
    
    if (!element && selector.startsWith('//') || selector.startsWith('id(')) {
      element = await page.$(`xpath=${selector}`);
    }
    
    if (!element) {
      const selectors = [
        `[id="${selector}"]`,
        `[name="${selector}"]`,
        `[placeholder="${selector}"]`,
        `input[aria-label="${selector}"]`,
        `textarea[aria-label="${selector}"]`,
        `label:has-text("${selector}") + input`,
        `label:has-text("${selector}") + textarea`
      ];
      
      for (const sel of selectors) {
        try {
          element = await page.$(sel);
          if (element) break;
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!element) {
      return { 
        success: false, 
        error: `未找到输入框：${selector}${description ? ` (${description})` : ''}` 
      };
    }
    
    await element.fill(value);
    
    const newState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, newState);
    pageStateSnapshot = newState;
    
    return { 
      success: true, 
      data: `成功填写字段：${selector}${description ? ` (${description})` : ''} = "${value}"\n${changes}` 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `填写字段失败：${error.message}` 
    };
  }
}

/**
 * 选择下拉框选项
 * @param {string} selector - 下拉框选择器
 * @param {string} value - 选项值或文本
 */
async function selectOption(selector, value) {
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    await page.selectOption(selector, value);
    
    const newState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, newState);
    pageStateSnapshot = newState;
    
    return { 
      success: true, 
      data: `成功选择选项：${selector} = "${value}"\n${changes}` 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `选择选项失败：${error.message}` 
    };
  }
}

/**
 * 查看页面变化（对比当前状态和上次快照）
 */
async function viewChanges() {
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    const currentState = await capturePageState();
    const changes = comparePageState(pageStateSnapshot, currentState);
    pageStateSnapshot = currentState;
    
    return { 
      success: true, 
      data: changes || '页面没有明显变化' 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `查看变化失败：${error.message}` 
    };
  }
}

/**
 * 获取页面内容
 */
async function getPageContent() {
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    const content = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.slice(0, 3000),
        forms: Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
          tag: el.tagName.toLowerCase(),
          name: el.name,
          id: el.id,
          type: el.type,
          value: el.value,
          placeholder: el.placeholder
        })).slice(0, 30),
        tables: Array.from(document.querySelectorAll('table')).map((table, idx) => {
          const rows = [];
          table.querySelectorAll('tr').forEach(row => {
            const cells = [];
            row.querySelectorAll('td, th').forEach(cell => {
              cells.push(cell.innerText.trim());
            });
            if (cells.length > 0) rows.push(cells);
          });
          return { index: idx, rows: rows.slice(0, 10) };
        }).slice(0, 5)
      };
    });
    
    return { success: true, data: content };
  } catch (error) {
    return { success: false, error: `获取页面内容失败：${error.message}` };
  }
}

/**
 * 截图页面
 */
async function takeScreenshot(name = 'screenshot') {
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    const screenshotPath = `${name}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { 
      success: true, 
      data: `截图已保存：${screenshotPath}` 
    };
  } catch (error) {
    return { success: false, error: `截图失败：${error.message}` };
  }
}

/**
 * 关闭浏览器
 */
async function closeBrowser() {
  try {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // 忽略已经关闭的错误
      }
      browser = null;
      page = null;
      pageStateSnapshot = null;
    }
    return { success: true, data: '浏览器已关闭' };
  } catch (error) {
    // 即使出错也清理状态
    browser = null;
    page = null;
    pageStateSnapshot = null;
    return { success: true, data: '浏览器状态已清理' };
  }
}

/**
 * 比较页面状态变化
 */
function comparePageState(oldState, newState) {
  if (!oldState || !newState) return '';
  
  const changes = [];
  
  // URL 变化
  if (oldState.url !== newState.url) {
    changes.push(`URL 变化：${oldState.url} → ${newState.url}`);
  }
  
  // 标题变化
  if (oldState.title !== newState.title) {
    changes.push(`标题变化：${oldState.title} → ${newState.title}`);
  }
  
  // 表单元素变化
  if (oldState.forms && newState.forms) {
    const oldValues = new Map(oldState.forms.map(f => [f.xpath, f.value]));
    const newValues = new Map(newState.forms.map(f => [f.xpath, f.value]));
    
    for (const [xpath, newValue] of newValues.entries()) {
      const oldValue = oldValues.get(xpath);
      if (oldValue !== newValue) {
        const form = newState.forms.find(f => f.xpath === xpath);
        changes.push(`表单变化：${form?.tag || '元素'}${form?.name ? `[name="${form.name}"]` : ''}${form?.id ? `[id="${form.id}"]` : ''} 值从 "${oldValue || '空'}" 变为 "${newValue || '空'}"`);
      }
    }
  }
  
  // 页面文本内容变化（简化检测）
  if (oldState.bodyText !== newState.bodyText) {
    changes.push('页面文本内容发生变化');
  }
  
  return changes.length > 0 ? changes.join('\n') : '无明显变化';
}

export {
  initBrowser,
  clickElement,
  fillField,
  selectOption,
  viewChanges,
  getPageContent,
  takeScreenshot,
  closeBrowser
};
