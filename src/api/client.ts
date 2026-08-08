/**
 * API 客户端模块
 *
 * 使用原生 fetch 直接调用 API，绕过 OpenAI SDK 的流处理层
 * 避免 SDK 在解析 SSE 流时可能出现的连接提前关闭问题
 */

import { loadConfig } from '../config.ts';
import { safeParseJSON } from '../utils/llm-validator.ts';
import { estimateTokens } from '../utils/token.ts';

// 重试配置
const MAX_RETRIES = 5; // 最大重试次数
const RETRY_DELAY_BASE = 2000; // 基础重试延迟（毫秒）
const REQUEST_TIMEOUT_MS = 120000; // 单次请求超时 120 秒（流式响应整体上限）

// 支持 top_k 参数的供应商 host（Moark/DeepSeek 系）。OpenAI 官方 API 会拒绝未知参数。
const TOP_K_PROVIDER_HINTS = ['moark', 'deepseek'];

/**
 * 判断当前供应商是否支持 top_k 参数。
 * 通过 baseURL 域名猜测；若用户显式配置了 topK（非默认值），说明其供应商明确支持，也照发。
 */
function supportsTopK(cfg: { api?: { baseURL?: string }; chat?: { topK?: number } }): boolean {
  const baseURL = cfg.api?.baseURL || '';
  const explicitTopK = cfg.chat?.topK !== undefined && cfg.chat?.topK !== 50;
  if (explicitTopK) return true;
  return TOP_K_PROVIDER_HINTS.some((hint) => baseURL.toLowerCase().includes(hint));
}

/**
 * 等待指定时间
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as {
    code?: string;
    message?: string;
    name?: string;
    cause?: unknown;
  };
  // undici 把具体错误放在 cause 中（'fetch failed' 时 error.code 为 undefined）
  if (e.cause && isNetworkError(e.cause)) return true;
  // undici 的 'fetch failed' 通常抛 TypeError
  if (e.name === 'TypeError' && /fetch/i.test(e.message || '')) return true;
  const msg = e.message || '';
  return (
    e.code === 'ECONNREFUSED' ||
    e.code === 'ENOTFOUND' ||
    e.code === 'ETIMEDOUT' ||
    e.code === 'ECONNRESET' ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Premature close') ||
    msg.includes('premature_close')
  );
}

/**
 * 发送消息并流式获取响应（带重试机制）
 * 使用原生 fetch，不依赖 OpenAI SDK
 *
 * yield 的 chunk 类型：
 *   { content, reasoning }         - 内容增量
 *   { usage: { input, output } }   - 流结束时返回 token 用量（若 API 支持）
 *
 * 流结束后，generator 的 return value 为 { usage } 或 null
 */
async function* streamChat(
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<
  { content: string | null; reasoning: string | null },
  { input: number; output: number } | null,
  unknown
> {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    // AbortController 实现请求级超时：fetch 默认无超时，服务端不响应时会
    // 永久挂起，占满连接池。超时后 abort 触发 AbortError，进入重试。
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    // 流式阶段一旦开始 yield 便不再重试，否则已输出内容会重复
    let streamStarted = false;

    try {
      const cfg = loadConfig();

      const baseURL = (cfg.api.baseURL || '').replace(/\/+$/, '');
      if (!baseURL) {
        throw new Error('API baseURL 未配置，请先运行 setup 或设置 COGITO_API_BASE_URL');
      }
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.api.apiKey}`,
        },
        body: JSON.stringify({
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          model: cfg.api.model,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: cfg.chat?.maxTokens ?? 131072,
          temperature: cfg.chat?.temperature ?? 0.7,
          top_p: cfg.chat?.topP ?? 0.7,
          // top_k 仅对 Moark/DeepSeek 等供应商有效；OpenAI 官方 API 拒绝未知参数（400）。
          // 仅当用户显式配置 topK 且供应商属于支持方时发送，否则省略以保持兼容。
          ...(supportsTopK(cfg) ? { top_k: cfg.chat?.topK ?? 50 } : {}),
          frequency_penalty: cfg.chat?.frequencyPenalty ?? 0,
        }),
        signal: controller.signal,
      });

      let capturedUsage: { input: number; output: number } | null = null;

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const err = new Error(`API ${response.status}: ${text.slice(0, 200)}`) as Error & {
          status?: number;
          retryAfter?: string | null;
        };
        err.status = response.status;
        // Retry-After 头可能不存在（非 429 响应通常没有），需防御性访问
        err.retryAfter = response.headers?.get('Retry-After') ?? null;
        throw err;
      }

      // 直接读取 SSE 流
      reader = response.body!.getReader();
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
            const parsedResult = safeParseJSON<{
              usage?: { prompt_tokens?: number; completion_tokens?: number };
              choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
            }>(data);
            if (!parsedResult.success) continue;
            const parsed = parsedResult.data;
            if (!parsed) continue;

            if (parsed.usage) {
              capturedUsage = {
                input: parsed.usage.prompt_tokens || 0,
                output: parsed.usage.completion_tokens || 0,
              };
            }

            const choices = parsed.choices;
            if (!choices || choices.length === 0) continue;

            const delta = choices[0].delta;
            if (!delta) continue;

            streamStarted = true;
            yield {
              content: delta.content || null,
              reasoning: delta.reasoning_content || null,
            };
          } catch {
            // 跳过单个 SSE 事件的解析错误
          }
        }
      }

      // 成功完成 - 返回 usage（API 未返回时用启发式估算兜底）
      if (!capturedUsage) {
        const inputText = messages.map((m) => m.content || '').join('');
        capturedUsage = {
          input: estimateTokens(inputText),
          output: 0, // output 由调用方通过 fullResponse 长度估算
        };
      }
      return capturedUsage;
    } catch (error: unknown) {
      // 已开始输出后不再重试（避免重复 yield 已输出内容），直接抛错交调用方处理
      if (streamStarted) throw error;
      retryCount++;

      const e = error as {
        status?: number;
        name?: string;
        retryAfter?: unknown;
      };
      const status = e.status;
      const isAbort = e.name === 'AbortError';
      // 429（限流）和 5xx（服务端错误）应当重试；网络错误和超时也重试。
      const isHTTPRetryable =
        status === 429 || (typeof status === 'number' && status >= 500 && status < 600);

      if ((isNetworkError(error) || isHTTPRetryable || isAbort) && retryCount < MAX_RETRIES) {
        let delay: number;
        if (status === 429 && e.retryAfter != null) {
          // 429 优先使用 Retry-After 头（秒）
          const retryAfterSec = parseInt(String(e.retryAfter), 10);
          delay = (isNaN(retryAfterSec) ? 1 : Math.max(retryAfterSec, 1)) * 1000;
        } else {
          delay = Math.pow(2, retryCount - 1) * RETRY_DELAY_BASE;
        }
        const reason = isAbort ? '请求超时' : isHTTPRetryable ? `HTTP ${status}` : '网络错误';
        console.error(`[API] ${reason}，${delay / 1000}秒后重试（第${retryCount}次）`);
        await sleep(delay);
        continue;
      }

      // 其他错误或达到最大重试次数，抛出异常
      throw error;
    } finally {
      // 必须释放 reader：无论成功结束、出错重试、还是生成器被调用方提前
      // 抛弃（break/return），都要 cancel reader，否则底层 TCP 连接不会归还，
      // 长期积累导致连接泄漏。
      if (reader) {
        try {
          await reader.cancel();
        } catch {
          /* 忽略取消失败 */
        }
      }
      clearTimeout(timeoutId);
    }
  }

  // 循环内所有路径均 return/throw/continue，控制流不会到达此处
  throw new Error('unreachable');
}

// =============================================================
// 原生函数调用（R1.2）
// =============================================================

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface NativeStreamOptions {
  tools?: OpenAITool[];
  toolChoice?: string | Record<string, unknown>;
  responseFormat?: { type: string; [key: string]: unknown };
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface NativeToolCallChunk {
  id: string;
  name: string;
  arguments: string;
}

export interface NativeStreamReturn {
  input: number;
  output: number;
  stopReason: string | null;
  toolCalls: NativeToolCallChunk[];
}

export interface NativeStreamChunk {
  content: string | null;
  reasoning: string | null;
}

/**
 * 原生函数调用流式客户端。
 * 与 streamChat 共用同一套重试 / 超时 / 连接释放策略，但：
 * - 请求体支持 tools / tool_choice / response_format / reasoning_effort；
 * - 流式累积 tool_calls delta（id + name + arguments 拼接）；
 * - 结束时返回 stopReason 与完整 toolCalls 列表（原始 arguments JSON 字符串）。
 *
 * yield 的 chunk 为内容增量；generator 的 return value 为 NativeStreamReturn。
 */
async function* streamChatNative(
  messages: Array<Record<string, unknown>>,
  options: NativeStreamOptions = {},
): AsyncGenerator<NativeStreamChunk, NativeStreamReturn, unknown> {
  let retryCount = 0;

  const accumulatedToolCalls = new Map<number, NativeToolCallChunk>();
  let capturedUsage: { input: number; output: number } | null = null;
  let stopReason: string | null = null;

  while (retryCount < MAX_RETRIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let streamStarted = false;

    try {
      const cfg = loadConfig();

      const baseURL = (cfg.api.baseURL || '').replace(/\/+$/, '');
      if (!baseURL) {
        throw new Error('API baseURL 未配置，请先运行 setup 或设置 COGITO_API_BASE_URL');
      }

      const body: Record<string, unknown> = {
        messages,
        model: cfg.api.model,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: cfg.chat?.maxTokens ?? 131072,
        temperature: cfg.chat?.temperature ?? 0.7,
        top_p: cfg.chat?.topP ?? 0.7,
        ...(supportsTopK(cfg) ? { top_k: cfg.chat?.topK ?? 50 } : {}),
        frequency_penalty: cfg.chat?.frequencyPenalty ?? 0,
      };
      if (options.tools && options.tools.length > 0) body.tools = options.tools;
      if (options.toolChoice) body.tool_choice = options.toolChoice;
      if (options.responseFormat) body.response_format = options.responseFormat;
      if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.api.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const err = new Error(`API ${response.status}: ${text.slice(0, 200)}`) as Error & {
          status?: number;
          retryAfter?: string | null;
        };
        err.status = response.status;
        err.retryAfter = response.headers?.get('Retry-After') ?? null;
        throw err;
      }

      reader = response.body!.getReader();
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
            const parsedResult = safeParseJSON<{
              usage?: { prompt_tokens?: number; completion_tokens?: number };
              choices?: Array<{
                delta?: {
                  content?: string;
                  reasoning_content?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
            }>(data);
            if (!parsedResult.success) continue;
            const parsed = parsedResult.data;
            if (!parsed) continue;

            if (parsed.usage) {
              capturedUsage = {
                input: parsed.usage.prompt_tokens || 0,
                output: parsed.usage.completion_tokens || 0,
              };
            }

            const choices = parsed.choices;
            if (!choices || choices.length === 0) continue;

            const choice = choices[0];
            if (choice.finish_reason) stopReason = choice.finish_reason;

            const delta = choice.delta;
            if (!delta) continue;

            streamStarted = true;

            // 累积原生函数调用 delta
            if (Array.isArray(delta.tool_calls)) {
              for (const toolCall of delta.tool_calls) {
                const index = toolCall.index ?? 0;
                const existing = accumulatedToolCalls.get(index) || {
                  id: '',
                  name: '',
                  arguments: '',
                };
                if (toolCall.id) existing.id = toolCall.id;
                if (toolCall.function?.name) existing.name += toolCall.function.name;
                if (toolCall.function?.arguments) existing.arguments += toolCall.function.arguments;
                accumulatedToolCalls.set(index, existing);
              }
            }

            yield {
              content: delta.content || null,
              reasoning: delta.reasoning_content || null,
            };
          } catch {
            // 跳过单个 SSE 事件的解析错误
          }
        }
      }

      // 成功完成 - 返回 usage（API 未返回时用启发式估算兜底）
      if (!capturedUsage) {
        const inputText = messages.map((m) => String(m.content || '')).join('');
        capturedUsage = {
          input: estimateTokens(inputText),
          output: 0,
        };
      }
      return {
        ...capturedUsage,
        stopReason,
        toolCalls: Array.from(accumulatedToolCalls.values()).filter((tc) => tc.name),
      };
    } catch (error: unknown) {
      if (streamStarted) throw error;
      retryCount++;

      const e = error as { status?: number; name?: string; retryAfter?: unknown };
      const status = e.status;
      const isAbort = e.name === 'AbortError';
      const isHTTPRetryable =
        status === 429 || (typeof status === 'number' && status >= 500 && status < 600);

      if ((isNetworkError(error) || isHTTPRetryable || isAbort) && retryCount < MAX_RETRIES) {
        let delay: number;
        if (status === 429 && e.retryAfter != null) {
          const retryAfterSec = parseInt(String(e.retryAfter), 10);
          delay = (isNaN(retryAfterSec) ? 1 : Math.max(retryAfterSec, 1)) * 1000;
        } else {
          delay = Math.pow(2, retryCount - 1) * RETRY_DELAY_BASE;
        }
        const reason = isAbort ? '请求超时' : isHTTPRetryable ? `HTTP ${status}` : '网络错误';
        console.error(`[API] ${reason}，${delay / 1000}秒后重试（第${retryCount}次）`);
        await sleep(delay);
        continue;
      }

      throw error;
    } finally {
      if (reader) {
        try {
          await reader.cancel();
        } catch {
          /* 忽略取消失败 */
        }
      }
      clearTimeout(timeoutId);
    }
  }

  throw new Error('unreachable');
}

export { streamChat, streamChatNative, estimateTokens };
