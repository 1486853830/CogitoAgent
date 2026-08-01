import {
  safeParseJSON,
  safeParseLLM,
  parseLLMResponse,
  LLMResponseSchema,
} from '../../src/utils/llm-validator';

describe('llm-validator.ts', () => {
  describe('safeParseJSON', () => {
    it('should parse valid JSON', () => {
      const result = safeParseJSON('{"key": "value"}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should parse empty object', () => {
      const result = safeParseJSON('{}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should parse array', () => {
      const result = safeParseJSON('[1, 2, 3]');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('should parse string', () => {
      const result = safeParseJSON('"hello"');
      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('should parse number', () => {
      const result = safeParseJSON('42');
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should parse null', () => {
      const result = safeParseJSON('null');
      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
    });

    it('should parse with generic type', () => {
      interface TestData {
        name: string;
        age: number;
      }
      const result = safeParseJSON<TestData>('{"name": "John", "age": 30}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
    });

    it('should return error for invalid JSON', () => {
      const result = safeParseJSON('invalid json');
      expect(result.success).toBe(false);
      expect(result.data).toBe(null);
      expect(result.error).toBeDefined();
    });

    it('should return error for incomplete JSON', () => {
      const result = safeParseJSON('{"key": "value"');
      expect(result.success).toBe(false);
      expect(result.data).toBe(null);
      expect(result.error).toBeDefined();
    });

    it('should handle empty string', () => {
      const result = safeParseJSON('');
      expect(result.success).toBe(false);
      expect(result.data).toBe(null);
    });

    it('should handle undefined input', () => {
      const result = safeParseJSON(undefined as any);
      expect(result.success).toBe(false);
      expect(result.data).toBe(null);
    });
  });

  describe('safeParseLLM', () => {
    it('should validate valid tool_call response', () => {
      const result = safeParseLLM(
        '{"action": "tool_call", "payload": {"tool": "read"}, "reasoning": "testing"}',
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        action: 'tool_call',
        payload: { tool: 'read' },
        reasoning: 'testing',
      });
    });

    it('should validate valid answer response', () => {
      const result = safeParseLLM('{"action": "answer", "payload": {"text": "hello"}}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ action: 'answer', payload: { text: 'hello' } });
    });

    it('should validate valid thought response', () => {
      const result = safeParseLLM('{"action": "thought", "reasoning": "thinking..."}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ action: 'thought', reasoning: 'thinking...' });
    });

    it('should reject invalid action type', () => {
      const result = safeParseLLM('{"action": "invalid"}');
      expect(result.success).toBe(false);
    });

    it('should reject missing action field', () => {
      const result = safeParseLLM('{"payload": {"text": "hello"}}');
      expect(result.success).toBe(false);
    });

    it('should return error for invalid JSON', () => {
      const result = safeParseLLM('invalid json');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty payload', () => {
      const result = safeParseLLM('{"action": "answer"}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ action: 'answer' });
    });
  });

  describe('parseLLMResponse', () => {
    it('should return parsed response for valid JSON', () => {
      const response = parseLLMResponse('{"action": "tool_call", "payload": {"tool": "read"}}');
      expect(response.action).toBe('tool_call');
      expect(response.payload).toEqual({ tool: 'read' });
    });

    it('should return default answer for invalid JSON', () => {
      const response = parseLLMResponse('invalid json');
      expect(response.action).toBe('answer');
      expect(response.payload).toEqual({ text: '抱歉，当前响应格式异常，请重试。' });
    });

    it('should return default answer for invalid action type', () => {
      const response = parseLLMResponse('{"action": "invalid"}');
      expect(response.action).toBe('answer');
      expect(response.payload).toEqual({ text: '抱歉，当前响应格式异常，请重试。' });
    });

    it('should return default answer for missing action', () => {
      const response = parseLLMResponse('{"payload": {"text": "hello"}}');
      expect(response.action).toBe('answer');
      expect(response.payload).toEqual({ text: '抱歉，当前响应格式异常，请重试。' });
    });

    it('should return default answer for empty string', () => {
      const response = parseLLMResponse('');
      expect(response.action).toBe('answer');
      expect(response.payload).toEqual({ text: '抱歉，当前响应格式异常，请重试。' });
    });

    it('should return default answer for undefined input', () => {
      const response = parseLLMResponse(undefined as any);
      expect(response.action).toBe('answer');
      expect(response.payload).toEqual({ text: '抱歉，当前响应格式异常，请重试。' });
    });
  });

  describe('LLMResponseSchema', () => {
    it('should define correct schema', () => {
      expect(LLMResponseSchema).toBeDefined();
    });

    it('should validate schema structure', () => {
      const validData = { action: 'answer', payload: { text: 'test' }, reasoning: 'test' };
      const result = LLMResponseSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});
