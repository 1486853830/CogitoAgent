import { safeParseJSON } from '../../src/utils/llm-validator';

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
});
