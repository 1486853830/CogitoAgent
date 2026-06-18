/**
 * API 客户端模块
 */

import OpenAI from 'openai';
import { loadConfig } from '../config.js';

let client = null;
let model = null;

// 重试配置
const MAX_RETRIES = 3;  // 最大重试次数
const RETRY_DELAY_BASE = 1000;  // 基础重试延迟（毫秒）

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
    error.message?.includes('ECONNREFUSED')
  );
}

function getClient() {
  if (!client) {
    const cfg = loadConfig();
    client = new OpenAI({
      baseURL: cfg.api.baseURL,
      apiKey: cfg.api.apiKey,
    });
    model = cfg.api.model;
  }
  return { client, model };
}

/**
 * 发送消息并流式获取响应（带重试机制）
 */
async function* streamChat(messages) {
  let retryCount = 0;
  
  while (retryCount < MAX_RETRIES) {
    try {
      const { client: c, model: m } = getClient();
      const cfg = loadConfig();

      const response = await c.chat.completions.create({
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        model: m,
        stream: true,
        max_tokens: cfg.chat.maxTokens,
        temperature: cfg.chat.temperature,
        top_p: cfg.chat.topP,
        top_k: cfg.chat.topK,
        frequency_penalty: cfg.chat.frequencyPenalty,
      });

      for await (const chunk of response) {
        if (chunk.choices.length === 0) {
          continue;
        }
        const delta = chunk.choices[0].delta;
        yield {
          content: delta.content || null,
          reasoning: delta.reasoning_content || null
        };
      }
      
      // 成功完成，退出重试循环
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
