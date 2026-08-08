/**
 * 联网搜索模块
 */

import { loadConfig } from '../config.ts';

/**
 * 调用联网搜索
 * @param content - 搜索关键词
 */
async function search(
  content: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const cfg = loadConfig();

  // 如果搜索未启用，直接返回
  if (!cfg.search || cfg.search.enabled === false) {
    return { success: false, error: '搜索功能未启用' };
  }

  // 构建搜索 URL：优先用 search.baseURL。
  // 否则仅当主供应商为 moark（其搜索端点格式已知且主 key 属于该平台）时，
  // 才回退到 api.baseURL + /web-search-v2 或内置默认 Moark URL。
  // 对 OpenAI/Anthropic/Google 等其他供应商，不猜端点、不把主 key 发给第三方。
  const provider = (cfg.api?.provider || '').toLowerCase();
  let searchURL = cfg.search.baseURL;
  if (!searchURL) {
    if (provider.includes('moark')) {
      searchURL = cfg.api.baseURL
        ? `${cfg.api.baseURL}/web-search-v2`
        : 'https://api.moark.com/v1/web-search-v2';
    } else {
      return {
        success: false,
        error:
          '未配置搜索服务地址（search.baseURL / COGITO_SEARCH_BASE_URL），且当前 API 供应商不支持自动推导搜索端点',
      };
    }
  }

  const body: Record<string, unknown> = {
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
