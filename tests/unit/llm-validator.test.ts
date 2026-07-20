import {
  safeParseJSON,
  safeParseLLM,
  parseLLMResponse,
  LLMResponseSchema,
} from '../../src/utils/llm-validator.ts';

describe('LLM Validator', () => {
  describe('safeParseJSON', () => {
    it('should parse valid JSON', () => {
      const result = safeParseJSON('{"key": "value"}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should handle invalid JSON', () => {
      const result = safeParseJSON('{invalid json}');
      expect(result.success).toBe(false);
      expect(result.data).toBe(null);
      expect(result.error).toBeDefined();
    });

    it('should handle empty string', () => {
      const result = safeParseJSON('');
      expect(result.success).toBe(false);
      expect(result.data).toBe(null);
    });

    it('should handle null', () => {
      const result = safeParseJSON('null');
      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
    });

    it('should handle numbers', () => {
      const result = safeParseJSON('42');
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should handle arrays', () => {
      const result = safeParseJSON('[1, 2, 3]');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });
  });

  describe('safeParseLLM', () => {
    it('should validate valid tool_call response', () => {
      const result = safeParseLLM(
        '{"action": "tool_call", "payload": {"tool": "search", "args": ["test"]}, "reasoning": "需要搜索"}',
      );
      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('tool_call');
      expect(result.data?.payload).toEqual({ tool: 'search', args: ['test'] });
      expect(result.data?.reasoning).toBe('需要搜索');
    });

    it('should validate valid answer response', () => {
      const result = safeParseLLM('{"action": "answer", "payload": {"text": "Hello"}}');
      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('answer');
    });

    it('should validate valid thought response', () => {
      const result = safeParseLLM('{"action": "thought"}');
      expect(result.success).toBe(true);
      expect(result.data?.action).toBe('thought');
    });

    it('should reject invalid action type', () => {
      const result = safeParseLLM('{"action": "invalid"}');
      expect(result.success).toBe(false);
    });

    it('should reject missing action', () => {
      const result = safeParseLLM('{"payload": {"text": "Hello"}}');
      expect(result.success).toBe(false);
    });

    it('should handle malformed JSON', () => {
      const result = safeParseLLM('{"action": "answer"');
      expect(result.success).toBe(false);
    });
  });

  describe('parseLLMResponse', () => {
    it('should return valid response when input is valid', () => {
      const result = parseLLMResponse('{"action": "answer", "payload": {"text": "Hello"}}');
      expect(result.action).toBe('answer');
      expect(result.payload).toEqual({ text: 'Hello' });
    });

    it('should return fallback response when input is invalid', () => {
      const result = parseLLMResponse('invalid json');
      expect(result.action).toBe('answer');
      expect(result.payload).toEqual({ text: '抱歉，当前响应格式异常，已自动重试。' });
    });

    it('should return fallback response when action is invalid', () => {
      const result = parseLLMResponse('{"action": "invalid"}');
      expect(result.action).toBe('answer');
      expect(result.payload).toEqual({ text: '抱歉，当前响应格式异常，已自动重试。' });
    });
  });
});
