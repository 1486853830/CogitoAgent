/**
 * 联网搜索模块
 */

import { loadConfig } from '../config.ts';

/**
 * 调用联网搜索
 * @param content - 搜索关键词
 */
async function search(content: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const cfg = loadConfig();

  // 如果搜索未启用，直接返回
  if (!cfg.search || cfg.search.enabled === false) {
    return { success: false, error: '搜索功能未启用' };
  }

  // 构建搜索 URL：优先用 search.baseURL，否则用 api.baseURL + /web-search-v2
  let searchURL = cfg.search.baseURL || (cfg.api.baseURL ? `${cfg.api.baseURL}/web-search-v2` : '');
  // 如果 api.baseURL 是空的，使用默认的 moark URL
  if (!searchURL) {
    searchURL = 'https://api.moark.com/v1/web-search-v2';
  }

  const body: Record<string, any> = {
    content,
    model: 'search',
  };

  // 只在有值时才加这两个字段
  if (cfg.search.recencyFilter) {
    body.search_recency_filter = cfg.search.recencyFilter;
  }
  if (cfg.search.siteFilter) {
    body.search_site_filter = cfg.search.siteFilter;
  }

  try {
    // fetch 默认无超时，服务端不响应时会永久挂起；用 AbortController 限制 30s。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(searchURL, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.api.apiKey}`,
        },
        method: 'POST',
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          error: `搜索请求失败 (${response.status}): ${response.statusText}\n响应: ${text.slice(0, 200)}`,
        };
      }

      const data = await response.json();
      return { success: true, data };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export { search };
