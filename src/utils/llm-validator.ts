// JSON-action schema 遗留（LLMResponseSchema / safeParseLLM / parseLLMResponse）已删除：
// 当前工具调用统一走原生 function calling，不再使用 { action, payload } JSON 协议。
// 仅保留通用的 safeParseJSON，仍被 api/client.ts、registry.ts 使用。

export function safeParseJSON<T = unknown>(
  raw: string,
): { success: boolean; data: T | null; error?: Error } {
  try {
    const parsed = JSON.parse(raw) as T;
    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
