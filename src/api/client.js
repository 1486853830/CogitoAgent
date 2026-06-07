/**
 * API 客户端模块
 */

import OpenAI from 'openai';
import { loadConfig } from '../config.js';

let client = null;
let model = null;

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
 * 发送消息并流式获取响应
 */
async function* streamChat(messages) {
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
}

export { streamChat };
