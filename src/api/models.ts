// 注意：此文件已废弃，作为历史参考保留（仍被 tests/api-models.test.ts 引用）
// 当前使用 src/api/client.ts 中的原生 fetch 实现
// 如需恢复，请先 npm install openai
// import OpenAI from 'openai';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadConfig } from '../config.ts';

// 文件已废弃：OpenAI SDK 未安装。此前用 `declare const OpenAI: any;` 让 TS 编译通过，
// 但运行时引用 OpenAI 会抛出隐晦的 ReferenceError。这里改为显式获取 + 清晰报错，
// 既保持测试可 mock（globalThis.OpenAI），又让生产环境得到可读的错误信息。
const OpenAI: any = (globalThis as any).OpenAI;

interface ProviderInfo {
  baseURL: string;
  models: string[];
}

const providers: Record<string, ProviderInfo> = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  moark: {
    baseURL: 'https://api.moark.com/v1',
    models: ['DeepSeek-V4-Flash', 'DeepSeek-V4'],
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
  },
  google: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-pro', 'gemini-1.5-pro'],
  },
};

let clients: Record<string, any> = {};

/**
 * 获取指定提供商的客户端
 */
function getClient(provider: string): any {
  if (clients[provider]) {
    return clients[provider];
  }

  if (!OpenAI) {
    throw new Error(
      'api/models.ts 已废弃：未安装 openai 包。请改用 src/api/client.ts 的原生 fetch 实现，或运行 npm install openai 后再启用本模块。',
    );
  }

  const cfg = loadConfig();
  const providerConfig = cfg.models?.[provider];

  if (!providerConfig?.apiKey) {
    throw new Error(`提供商 ${provider} 未配置 API 密钥`);
  }

  const baseURL = providerConfig.baseURL || providers[provider]?.baseURL;

  const client = new OpenAI({
    baseURL: baseURL,
    apiKey: providerConfig.apiKey,
    defaultHeaders: (providerConfig as any).headers || {},
  });

  clients[provider] = client;
  return client;
}

/**
 * 获取当前配置的模型信息
 */
function getCurrentModel(): { provider: string; model: string; baseURL: string } {
  const cfg = loadConfig();
  return {
    provider: cfg.api.provider,
    model: cfg.api.model,
    baseURL: cfg.api.baseURL,
  };
}

/**
 * 列出支持的提供商
 */
function listProviders(): Array<{ name: string; baseURL: string; models: string[] }> {
  return Object.keys(providers).map((provider) => ({
    name: provider,
    baseURL: providers[provider].baseURL,
    models: providers[provider].models,
  }));
}

/**
 * 获取提供商信息
 */
function getProviderInfo(provider: string): ProviderInfo | null {
  return providers[provider] || null;
}

/**
 * 切换模型提供商
 */
function switchProvider(
  provider: string,
  model: string,
): {
  success: boolean;
  error?: string;
  data?: { provider: string; model: string; baseURL: string };
} {
  // 已废弃运行时告警：本模块整体已废弃（见文件顶部），且 switchProvider 不会
  // 持久化配置。请改用配置文件。不在此强制加持久化以避免改动过大。
  console.warn('[models] switchProvider 已废弃，请使用配置文件');
  const cfg = loadConfig();

  if (!providers[provider]) {
    return {
      success: false,
      error: `不支持的提供商: ${provider}`,
    };
  }

  if (!cfg.models?.[provider]?.apiKey) {
    return {
      success: false,
      error: `提供商 ${provider} 未配置，请在 .env 文件中配置 ${provider.toUpperCase()}_API_KEY`,
    };
  }

  cfg.api.provider = provider;
  cfg.api.model = model;
  cfg.api.baseURL = cfg.models[provider].baseURL || providers[provider].baseURL;

  clients = {};

  return {
    success: true,
    data: {
      provider,
      model,
      baseURL: cfg.api.baseURL,
    },
  };
}

/**
 * 发送消息（通用接口）
 */
async function* chat(
  messages: Array<{ role: string; content: string }>,
  options: any = {},
): AsyncGenerator<any, void, unknown> {
  const cfg = loadConfig();
  const provider = options.provider || cfg.api.provider;
  const model = options.model || cfg.api.model;

  let client: any;
  try {
    client = getClient(provider);
  } catch (e) {
    throw new Error(`获取客户端失败: ${(e as Error).message}`, { cause: e });
  }

  const chatOptions: Record<string, any> = {
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    model: model,
    stream: true,
    max_tokens: options.maxTokens ?? cfg.chat.maxTokens,
    temperature: options.temperature ?? cfg.chat.temperature,
    top_p: options.topP ?? cfg.chat.topP,
    frequency_penalty: options.frequencyPenalty ?? cfg.chat.frequencyPenalty,
  };

  if (options.topK !== undefined) {
    chatOptions.top_k = options.topK;
  }

  const response = await client.chat.completions.create(chatOptions);

  for await (const chunk of response) {
    if (chunk.choices.length === 0) {
      continue;
    }
    const delta = chunk.choices[0].delta;
    yield {
      content: delta.content || null,
      reasoning: delta.reasoning_content || null,
      provider,
    };
  }
}

/**
 * 获取模型列表
 */
function getModels(provider: string | null = null): string[] | Record<string, string[]> {
  if (provider) {
    return providers[provider]?.models || [];
  }

  const result: Record<string, string[]> = {};
  for (const [name, info] of Object.entries(providers)) {
    result[name] = info.models;
  }
  return result;
}

export {
  getClient,
  getCurrentModel,
  listProviders,
  getProviderInfo,
  switchProvider,
  chat,
  getModels,
  providers,
};
