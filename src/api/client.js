/**
 * API 客户端模块
 * 
 * 使用原生 fetch 直接调用 API，绕过 OpenAI SDK 的流处理层
 * 避免 SDK 在解析 SSE 流时可能出现的连接提前关闭问题
 */

import { loadConfig } from '../config.js';

// 重试配置
const MAX_RETRIES = 5;  // 最大重试次数
const RETRY_DELAY_BASE = 2000;  // 基础重试延迟（毫秒）

/**
 * 等待指定时间
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(error) {
  return (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNRESET' ||
    error.message?.includes('network') ||
    error.message?.includes('timeout') ||
    error.message?.includes('ECONNREFUSED') ||
    error.message?.includes('Premature close') ||
    error.message?.includes('premature_close')
  );
}

/**
 * 发送消息并流式获取响应（带重试机制）
 * 使用原生 fetch，不依赖 OpenAI SDK
 */
async function* streamChat(messages) {
  let retryCount = 0;
  
  while (retryCount < MAX_RETRIES) {
    try {
      const cfg = loadConfig();

      const response = await fetch(`${cfg.api.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.api.apiKey}`,
        },
        body: JSON.stringify({
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          model: cfg.api.model,
          stream: true,
          max_tokens: cfg.chat?.maxTokens ?? 384000,
          temperature: cfg.chat?.temperature ?? 0.7,
          top_p: cfg.chat?.topP ?? 0.7,
          top_k: cfg.chat?.topK ?? 50,
          frequency_penalty: cfg.chat?.frequencyPenalty ?? 1,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`API ${response.status}: ${text.slice(0, 200)}`);
      }

      // 直接读取 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const choices = parsed.choices;
            if (!choices || choices.length === 0) continue;
            
            const delta = choices[0].delta;
            if (!delta) continue;

            yield {
              content: delta.content || null,
              reasoning: delta.reasoning_content || null
            };
          } catch {
            // 跳过单个 SSE 事件的解析错误
          }
        }
      }
      
      // 成功完成
      return;
      
    } catch (error) {
      retryCount++;
      
      // 如果是网络错误且未达到最大重试次数，进行重试
      if (isNetworkError(error) && retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount - 1) * RETRY_DELAY_BASE;
        console.error(`[API] 网络错误，${delay / 1000}秒后重试（第${retryCount}次）`);
        await sleep(delay);
        continue;
      }
      
      // 其他错误或达到最大重试次数，抛出异常
      throw error;
    }
  }
}

export { streamChat };
