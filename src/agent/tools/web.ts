import { execFile } from 'child_process';
import { search as webSearch } from '../../api/webSearch.ts';
import * as cheerio from 'cheerio';
import os from 'os';

function isValidUrl(url: string): boolean {
  try {
    const cleanedUrl = url.trim().replace(/`/g, '');
    const parsed = new URL(cleanedUrl);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * 联网搜索
 * 将搜索结果格式化为可读性强的文本
 */
async function search(
  query: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const result = await webSearch(query);
  if (!result.success) {
    return result;
  }
  const raw = result.data;
  let summary = `搜索关键词: ${query}\n\n`;
  try {
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const snippets: string[] = [];
      if (obj.snippets || obj.results || obj.organic_results || obj.web) {
        const list = obj.snippets || obj.results || obj.organic_results || obj.web;
        if (Array.isArray(list)) {
          list.forEach((item, idx) => {
            const it = item as Record<string, unknown>;
            const title = it.title ?? it.name ?? '无标题';
            const url = it.url ?? it.link ?? '';
            const content = it.snippet ?? it.content ?? it.description ?? it.text ?? '';
            snippets.push(`[${idx + 1}] ${title}${url ? ` (${url})` : ''}\n${content}`);
          });
        }
      } else if (obj.answer_text || obj.answer || obj.content) {
        summary += `摘要: ${obj.answer_text || obj.answer || obj.content}`;
      } else if (obj.summary) {
        summary += obj.summary;
      } else {
        summary += JSON.stringify(raw, null, 2).slice(0, 3000);
      }
      if (snippets.length) {
        summary += snippets.join('\n\n');
      }
    }
  } catch {
    summary += `原始响应:\n` + JSON.stringify(raw, null, 2).slice(0, 3000);
  }
  return { success: true, data: summary };
}

/**
 * 在浏览器中打开 URL
 */
async function browse(url: string): Promise<{ success: boolean; data?: string; error?: string }> {
  return new Promise((resolve) => {
    const cleanedUrl = url.trim().replace(/`/g, '');
    if (!isValidUrl(cleanedUrl)) {
      resolve({ success: false, error: `无效的 URL: ${url}` });
      return;
    }
    // 仅拒绝控制字符、空白与引号：
    // 全程通过 execFile 直接启动可执行文件（不经过 shell），
    // URL 中的 & | ^ < > % ( ) 等字符不会被二次解析，合法 URL（如含 @ & 的查询串）允许放行
    if (/[\p{Cc}\s"']/u.test(cleanedUrl)) {
      resolve({ success: false, error: 'URL 包含不允许的字符，已拒绝打开' });
      return;
    }
    const platform = os.platform();
    let command: string;
    let args: string[];

    if (platform === 'win32') {
      // explorer.exe 是 GUI 程序：通过 execFile 启动时会派生子进程并立即以
      // 非零退出码返回，导致浏览器已正常打开但 execFile 仍报 "Command failed"。
      // 改用 rundll32 的 FileProtocolHandler 交给系统默认程序处理，
      // 不经过 cmd.exe 二次解析，且退出码稳定为 0。
      command = 'rundll32';
      args = ['url.dll,FileProtocolHandler', cleanedUrl];
    } else if (platform === 'darwin') {
      command = 'open';
      args = [cleanedUrl];
    } else {
      command = 'xdg-open';
      args = [cleanedUrl];
    }

    execFile(command, args, (error) => {
      if (error) {
        resolve({ success: false, error: `打开链接失败: ${error.message}` });
      } else {
        resolve({ success: true, data: `已在浏览器中打开: ${cleanedUrl}` });
      }
    });
  });
}

/**
 * 抓取网页内容并提取正文
 */
async function fetchPage(
  url: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  // 超时控制 + 响应体大小上限（避免恶意服务端无限拖慢/撑爆内存）
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const MAX_BODY_BYTES = 1024 * 1024; // 1MB
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return { success: false, error: '页面过大，已跳过抓取' };
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > MAX_BODY_BYTES) {
      return { success: false, error: '页面过大，已跳过抓取' };
    }
    const html = buf.toString('utf8');
    const $ = cheerio.load(html);

    // 提取页面标题
    const title = $('title').text().trim() || $('h1').first().text().trim() || '无标题';

    // 移除无关标签
    $('script, style, nav, header, footer, aside, .ad, .sidebar, .menu, .nav, .comment').remove();

    // 提取正文：优先找 article 或 main
    let content = '';
    const article = $('article').first();
    const main = $('main').first();
    const body = article.length ? article : main.length ? main : $('body');

    // 提取段落文本
    const paragraphs = body.find('p, h1, h2, h3, h4, h5, h6, li');
    const texts: string[] = [];
    paragraphs.each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10) {
        texts.push(text);
      }
    });
    content = texts.join('\n');

    // 如果提取内容太少，fallback 到全部文本
    if (content.length < 100) {
      content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);
    }

    // 提取链接
    const links: { text: string; url: string }[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && href.startsWith('http')) {
        links.push({ text, url: href });
      }
    });

    const result = `标题: ${title}\n\n`;
    const truncated =
      content.length > 3000 ? content.slice(0, 3000) + '\n\n[内容过长已截断...]' : content;

    let output = result + '正文:\n' + truncated;
    if (links.length > 0) {
      output +=
        '\n\n相关链接:\n' +
        links
          .slice(0, 10)
          .map((l) => `- ${l.text}: ${l.url}`)
          .join('\n');
    }

    return { success: true, data: output };
  } catch (error) {
    const msg =
      (error as Error).name === 'AbortError'
        ? '抓取超时，已中止'
        : `抓取失败: ${(error as Error).message}`;
    return { success: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

export { search, browse, fetchPage };
