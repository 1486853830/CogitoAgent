import { z } from 'zod';

export const LLMResponseSchema = z.object({
  action: z.enum(['tool_call', 'answer', 'thought']),
  payload: z.record(z.string(), z.unknown()).optional(),
  reasoning: z.string().optional(),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export function safeParseJSON<T = unknown>(
  raw: string,
): { success: boolean; data: T | null; error?: Error } {
  try {
    const parsed = JSON.parse(raw) as T;
    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, data: null, error: e as Error };
  }
}

export function safeParseLLM(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return LLMResponseSchema.safeParse(parsed);
  } catch {
    return { success: false, error: new Error('Invalid JSON format'), data: undefined };
  }
}

export function parseLLMResponse(raw: string): LLMResponse {
  const result = safeParseLLM(raw);
  if (!result.success) {
    return {
      action: 'answer',
      payload: { text: '抱歉，当前响应格式异常，已自动重试。' },
    };
  }
  return result.data as LLMResponse;
}
