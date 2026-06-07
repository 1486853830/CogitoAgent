/**
 * 联网搜索模块
 */

import { loadConfig } from '../config.js';

/**
 * 调用联网搜索
 * @param {string} content - 搜索关键词
 */
async function search(content) {
  const cfg = loadConfig();

  // 如果搜索未启用，直接返回
  if (!cfg.search || cfg.search.enabled === false) {
    return { success: false, error: '搜索功能未启用' };
  }

  // 构建搜索 URL：优先用 search.baseURL，否则用 api.baseURL + /web-search-v2
  let searchURL = cfg.search.baseURL || (cfg.api.baseURL ? `${cfg.api.baseURL.replace('/v1', '/v1')}/web-search-v2` : '');
  // 如果 api.baseURL 是空的，使用默认的 moark URL
  if (!searchURL) {
    searchURL = 'https://api.moark.com/v1/web-search-v2';
  }

  const body = {
    content,
    model: 'search'
  };

  // 只在有值时才加这两个字段
  if (cfg.search.recencyFilter) {
    body.search_recency_filter = cfg.search.recencyFilter;
  }
  if (cfg.search.siteFilter) {
    body.search_site_filter = cfg.search.siteFilter;
  }

  try {
    const response = await fetch(searchURL, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.api.apiKey}`
      },
      method: "POST",
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `搜索请求失败 (${response.status}): ${response.statusText}\n响应: ${text.slice(0, 200)}`
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export { search };
