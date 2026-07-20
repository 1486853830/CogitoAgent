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
async function search(query: string): Promise<any> {
  const result: any = await webSearch(query);
  if (!result.success) {
    return result;
  }
  const raw = result.data;
  let summary = `搜索关键词: ${query}\n\n`;
  try {
    if (raw && typeof raw === 'object') {
      const snippets: string[] = [];
      if (raw.snippets || raw.results || raw.organic_results || raw.web) {
        const list = raw.snippets || raw.results || raw.organic_results || raw.web;
        if (Array.isArray(list)) {
          list.forEach((item: any, idx: number) => {
            const title = item.title || item.name || '无标题';
            const url = item.url || item.link || '';
            const content = item.snippet || item.content || item.description || item.text || '';
            snippets.push(`[${idx + 1}] ${title}${url ? ` (${url})` : ''}\n${content}`);
          });
        }
      } else if (raw.answer_text || raw.answer || raw.content) {
        summary += `摘要: ${raw.answer_text || raw.answer || raw.content}`;
      } else if (raw.summary) {
        summary += raw.summary;
      } else {
        summary += JSON.stringify(raw, null, 2).slice(0, 3000);
      }
      if (snippets.length) {
        summary += snippets.join('\n\n');
      }
    }
  } catch (e: any) {
    summary += `原始响应:\n` + JSON.stringify(raw, null, 2).slice(0, 3000);
  }
  return { success: true, data: summary };
}

/**
 * 在浏览器中打开 URL
 */
async function browse(url: string): Promise<any> {
  return new Promise((resolve) => {
    const cleanedUrl = url.trim().replace(/`/g, '');
    if (!isValidUrl(cleanedUrl)) {
      resolve({ success: false, error: `无效的 URL: ${url}` });
      return;
    }
    const platform = os.platform();
    let command: string;
    let args: string[];

    if (platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '', cleanedUrl];
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
async function fetchPage(url: string): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const html = await response.text();
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
    const links: any[] = [];
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
          .map((l: any) => `- ${l.text}: ${l.url}`)
          .join('\n');
    }

    return { success: true, data: output };
  } catch (error: any) {
    return { success: false, error: `抓取失败: ${error.message}` };
  }
}

export { search, browse, fetchPage };
