/**
 * 浏览器自动化工具 - 延迟加载 playwright
 */
let browser = null;
let page = null;
let pageStateSnapshot = null;
let chromium = null;

/**
 * 检查 playwright 是否可用
 */
async function checkPlaywright() {
  if (chromium) return true;
  
  try {
    const { chromium: chromiumModule } = await import('playwright');
    chromium = chromiumModule;
    return true;
  } catch (err) {
    return false;
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
 * 捕获页面当前状态（用于后续对比变化）
 */
async function capturePageState() {
  if (!page) return null;
  
  try {
    const state = await page.evaluate(() => {
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
        forms: forms.slice(0, 50),
        bodyText: document.body.innerText.slice(0, 2000)
      };
    });
    
    return state;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * 比较页面状态变化
 */
function comparePageState(oldState, newState) {
  if (!oldState || !newState) return '';
  
  const changes = [];
  
  if (oldState.url !== newState.url) {
    changes.push(`URL 变化：${oldState.url} → ${newState.url}`);
  }
  
  if (oldState.title !== newState.title) {
    changes.push(`标题变化：${oldState.title} → ${newState.title}`);
  }
  
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
  
  if (oldState.bodyText !== newState.bodyText) {
    changes.push('页面文本内容发生变化');
  }
  
  return changes.length > 0 ? changes.join('\n') : '无明显变化';
}

/**
 * 初始化浏览器并打开网页
 */
async function initBrowser(url) {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
  try {
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
      viewport: { width: 1920, height: 1080 },
      acceptDownloads: true,
      downloadsPath: './downloads'
    });
    page = await context.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    pageStateSnapshot = await capturePageState();
    
    return { 
      success: true, 
      data: `已成功打开网页：${url}` 
    };
  } catch (error) {
    browser = null;
    page = null;
    return { 
      success: false, 
      error: `打开网页失败：${error.message}` 
    };
  }
}

/**
 * 点击网页元素
 */
async function clickElement(selector, description = '') {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    await page.evaluate('1');
  } catch (e) {
    return { success: false, error: '浏览器页面已关闭，请重新使用 initBrowser 打开网页' };
  }
  
  try {
    let element = null;
    
    try {
      element = await page.$(selector);
    } catch (e) {
      // 不是有效的 CSS 选择器
    }
    
    if (!element && (selector.startsWith('//') || selector.startsWith('id('))) {
      element = await page.$(`xpath=${selector}`);
    }
    
    if (!element) {
      const textSelector = selector.trim();
      element = await page.locator(`text=${textSelector}`).first();
      if (!await element.count()) {
        element = null;
      }
    }
    
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
 */
async function fillField(selector, value, description = '') {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    await page.evaluate('1');
  } catch (e) {
    return { success: false, error: '浏览器页面已关闭，请重新使用 initBrowser 打开网页' };
  }
  
  try {
    let element = null;
    
    try {
      element = await page.$(selector);
    } catch (e) {
      // 不是有效的 CSS 选择器
    }
    
    if (!element && (selector.startsWith('//') || selector.startsWith('id('))) {
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
 */
async function selectOption(selector, value) {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
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
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
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
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
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
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
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
    browser = null;
    page = null;
    pageStateSnapshot = null;
    return { success: true, data: '浏览器状态已清理' };
  }
}

/**
 * 下载文件
 */
async function downloadFile(urlOrSelector, description = '', options = {}) {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
  try {
    const {
      savePath = './downloads',
      fullPath,
      timeout = 60000,
      acceptDownloads = true
    } = options;
    
    const fs = await import('fs');
    const path = await import('path');
    
    const downloadDir = fullPath ? path.dirname(fullPath) : savePath;
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    
    let needInit = !page;
    
    if (needInit) {
      if (urlOrSelector.startsWith('http')) {
        const initResult = await initBrowser(urlOrSelector);
        if (!initResult.success) {
          return initResult;
        }
      } else {
        return { 
          success: false, 
          error: '请先使用 initBrowser 打开网页，或提供完整的下载页面 URL' 
        };
      }
    } else {
      if (urlOrSelector.startsWith('http')) {
        await page.goto(urlOrSelector, { waitUntil: 'networkidle', timeout: 30000 });
      }
    }
    
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    
    let downloadElement = null;
    let usedSelector = '';
    
    if (!urlOrSelector.startsWith('http')) {
      try {
        downloadElement = await page.$(urlOrSelector);
        usedSelector = urlOrSelector;
      } catch (e) {
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
        '[id*="download"]'
      ];
      
      for (const selector of downloadSelectors) {
        try {
          downloadElement = await page.$(selector);
          if (downloadElement && await downloadElement.isVisible()) {
            usedSelector = selector;
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!downloadElement && description) {
      try {
        downloadElement = await page.locator(`text=${description}`).first();
        if (await downloadElement.count()) {
          usedSelector = `text=${description}`;
        } else {
          downloadElement = null;
        }
      } catch (e) {
        // 忽略错误
      }
    }
    
    if (!downloadElement) {
      const pageInfo = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const downloadLinks = links.filter(a => {
          const href = a.href || '';
          const text = (a.innerText || a.textContent || '').toLowerCase();
          return href.match(/\.(exe|zip|msi|dmg|pkg|deb|rpm|tar|gz|7z|rar)$/i) ||
                 text.includes('下载') || 
                 text.includes('download') ||
                 text.includes('安装') ||
                 text.includes('installer');
        }).map(a => ({
          href: a.href,
          text: (a.innerText || a.textContent || '').trim(),
          id: a.id,
          class: a.className
        }));
        
        return {
          url: window.location.href,
          title: document.title,
          downloadLinks: downloadLinks.slice(0, 10)
        };
      });
      
      return { 
        success: false, 
        error: `未找到下载链接。页面信息：${pageInfo.title} (${pageInfo.url}), 可能的下载链接：${JSON.stringify(pageInfo.downloadLinks)}` 
      };
    }
    
    const href = await downloadElement.getAttribute('href');
    const text = await downloadElement.innerText();
    
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout }),
      downloadElement.click()
    ]);
    
    const suggestedFilename = download.suggestedFilename();
    const finalPath = fullPath ? fullPath : path.join(savePath, suggestedFilename);
    
    await download.saveAs(finalPath);
    await download.finished();
    
    return { 
      success: true, 
      data: `文件下载成功！\n文件名：${suggestedFilename}\n保存路径：${finalPath}\n来源：${text || href}\n使用选择器：${usedSelector || '自动检测'}` 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `下载失败：${error.message}` 
    };
  }
}

/**
 * 在页面内搜索文本内容
 */
async function searchOnPage(text, description = '') {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    const results = await page.evaluate((searchText) => {
      function getXPathInternal(element) {
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
      
      const matches = [];
      
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while ((node = walker.nextNode())) {
        const textContent = node.textContent;
        if (textContent && textContent.toLowerCase().includes(searchText.toLowerCase())) {
          const parent = node.parentElement;
          matches.push({
            type: 'text',
            text: textContent.trim().slice(0, 200),
            parentTag: parent?.tagName?.toLowerCase() || null,
            parentClass: parent?.className || null,
            parentXPath: getXPathInternal(parent)
          });
        }
      }
      
      document.querySelectorAll('input, textarea').forEach((el) => {
        const value = el.value || '';
        const placeholder = el.placeholder || '';
        if (value.toLowerCase().includes(searchText.toLowerCase()) ||
            placeholder.toLowerCase().includes(searchText.toLowerCase())) {
          matches.push({
            type: 'input',
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            name: el.name || null,
            value: value,
            placeholder: placeholder,
            xpath: getXPathInternal(el)
          });
        }
      });
      
      document.querySelectorAll('button, a').forEach((el) => {
        const text = el.innerText || el.textContent || '';
        if (text.toLowerCase().includes(searchText.toLowerCase())) {
          matches.push({
            type: 'interactive',
            tag: el.tagName.toLowerCase(),
            text: text.trim(),
            href: el.href || null,
            id: el.id || null,
            xpath: getXPathInternal(el)
          });
        }
      });
      
      return matches.slice(0, 20);
    }, text);
    
    if (results.length === 0) {
      return { 
        success: true, 
        data: `未在页面中找到 "${text}"` 
      };
    }
    
    let output = `在页面中找到 ${results.length} 处匹配 "${text}"：\n\n`;
    results.forEach((result, idx) => {
      output += `[${idx + 1}] ${result.type.toUpperCase()}\n`;
      if (result.text) output += `   内容：${result.text}\n`;
      if (result.value) output += `   值：${result.value}\n`;
      if (result.placeholder) output += `   占位符：${result.placeholder}\n`;
      if (result.href) output += `   链接：${result.href}\n`;
      if (result.parentTag) output += `   位置：${result.parentTag}${result.parentClass ? `(${result.parentClass})` : ''}\n`;
      if (result.xpath) output += `   XPath: ${result.xpath}\n`;
      output += '\n';
    });
    
    return { success: true, data: output };
  } catch (error) {
    return { success: false, error: `搜索失败：${error.message}` };
  }
}

/**
 * 查找页面元素并返回详细信息
 */
async function findElements(selector, description = '') {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
  if (!page) {
    return { success: false, error: '请先使用 initBrowser 打开网页' };
  }
  
  try {
    const elements = await page.evaluate((searchSelector) => {
      function getXPathInternal(element) {
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
      
      const results = [];
      let found = document.querySelectorAll(searchSelector);
      
      if (found.length === 0) {
        document.querySelectorAll('*').forEach((el) => {
          const text = el.innerText || el.textContent || '';
          if (text.includes(searchSelector)) {
            results.push({
              tag: el.tagName.toLowerCase(),
              id: el.id || null,
              class: el.className || null,
              text: text.trim().slice(0, 100),
              xpath: getXPathInternal(el)
            });
          }
        });
      } else {
        found.forEach((el) => {
          results.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            class: el.className || null,
            text: (el.innerText || el.textContent || '').trim().slice(0, 100),
            xpath: getXPathInternal(el)
          });
        });
      }
      
      return results.slice(0, 15);
    }, selector);
    
    if (elements.length === 0) {
      return { 
        success: true, 
        data: `未找到匹配 "${selector}" 的元素${description ? ` (${description})` : ''}` 
      };
    }
    
    let output = `找到 ${elements.length} 个匹配元素：\n\n`;
    elements.forEach((el, idx) => {
      output += `[${idx + 1}] <${el.tag}>`;
      if (el.id) output += `#${el.id}`;
      if (el.class) output += `.${el.class.split(' ')[0]}`;
      output += `\n`;
      if (el.text) output += `   文本：${el.text}\n`;
      if (el.xpath) output += `   XPath: ${el.xpath}\n`;
      output += '\n';
    });
    
    return { success: true, data: output };
  } catch (error) {
    return { success: false, error: `查找元素失败：${error.message}` };
  }
}

/**
 * 在搜索引擎中搜索
 */
async function searchOnEngine(query, engine = 'bing') {
  if (!await checkPlaywright()) {
    return { 
      success: false, 
      error: 'playwright 未安装，请先安装：npm install playwright && npx playwright install' 
    };
  }
  
  try {
    let searchUrl;
    if (engine.startsWith('http')) {
      searchUrl = engine;
    } else {
      const engines = {
        'baidu': 'https://www.baidu.com',
        'google': 'https://www.google.com',
        'bing': 'https://www.bing.com',
        'sogou': 'https://www.sogou.com',
        '360': 'https://www.so.com'
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
      'form input[type="search"]'
    ];
    
    let searchInput = null;
    let usedSelector = '';
    
    for (const selector of searchInputSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput && await searchInput.isVisible()) {
          usedSelector = selector;
          break;
        }
      } catch (e) {
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
              (id?.includes('kw') || id?.includes('search') || id?.includes('q') ||
               className?.includes('search') || className?.includes('input') ||
               placeholder?.includes('搜索') || placeholder?.includes('search') ||
               placeholder?.includes('百度'));
            
            if (isSearchInput) {
              searchInput = input;
              usedSelector = `自动检测 (id=${id}, class=${className})`;
              break;
            }
          }
        }
      } catch (e) {
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
      } catch (e) {
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
          visibleInputs: inputs.filter(i => i.offsetParent !== null).map(i => ({
            tag: i.tagName,
            id: i.id,
            name: i.name,
            type: i.type,
            class: i.className,
            placeholder: i.placeholder
          })).slice(0, 10)
        };
      });
      
      return { 
        success: false, 
        error: `未找到搜索框。页面信息：${pageInfo.title} (${pageInfo.url}), 输入框数量：${pageInfo.inputCount}, 可见输入框：${JSON.stringify(pageInfo.visibleInputs)}` 
      };
    }
    
    try {
      await page.evaluate((selector, value) => {
        let element = null;
        
        try {
          element = document.querySelector(selector);
        } catch (e) {}
        
        if (!element && (selector.startsWith('//') || selector.startsWith('id('))) {
          const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          element = result.singleNodeValue;
        }
        
        if (!element && !selector.includes(' ') && !selector.startsWith('.') && !selector.startsWith('[')) {
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
      }, usedSelector, query);
    } catch (fillError) {
      try {
        await searchInput.evaluate((el, value) => {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, query);
      } catch (e) {
        return { 
          success: false, 
          error: `填写搜索框失败：${fillError.message}` 
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
      'button.search-button'
    ];
    
    let submitButton = null;
    for (const selector of submitSelectors) {
      try {
        submitButton = await page.$(selector);
        if (submitButton && await submitButton.isVisible()) {
          break;
        }
      } catch (e) {
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
      const results = [];
      const resultContainers = document.querySelectorAll('#content_left, #search, .results, .search-results, [role="main"], #main');
      const container = resultContainers[0] || document.body;
      
      container.querySelectorAll('a[href]').forEach((link) => {
        const href = link.href;
        const text = (link.innerText || link.textContent || '').trim();
        
        if (href && text && text.length > 5 && text.length < 200 &&
            !href.includes('javascript:') &&
            !text.includes('登录') && 
            !text.includes('注册') &&
            !text.includes('广告')) {
          results.push({
            title: text,
            url: href
          });
        }
      });
      
      const unique = [];
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
      searchResults.forEach((result, idx) => {
        output += `[${idx + 1}] ${result.title}\n`;
        output += `    ${result.url}\n\n`;
      });
    } else {
      output += `未提取到搜索结果，可能需要手动查看页面。\n`;
    }
    
    pageStateSnapshot = await capturePageState();
    
    return { success: true, data: output };
  } catch (error) {
    return { success: false, error: `搜索引擎搜索失败：${error.message}` };
  }
}

export {
  initBrowser,
  clickElement,
  fillField,
  selectOption,
  viewChanges,
  getPageContent,
  takeScreenshot,
  closeBrowser,
  searchOnPage,
  findElements,
  searchOnEngine,
  downloadFile
};
