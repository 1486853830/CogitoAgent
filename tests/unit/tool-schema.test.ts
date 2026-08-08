import {
  paramsToSchema,
  getToolSchema,
  getToolParamDocs,
  getToolDescription,
  getToolAnnotations,
  validateArgsAgainstSchema,
  validateToolArgs,
  isKnownTool,
  objectArgsToPositional,
  buildOpenAITools,
  toRichError,
} from '../../src/agent/tool-schema.ts';
import { TOOL_REGISTRY } from '../../src/agent/registry.ts';
import type { ToolParamDoc } from '../../src/types/index.ts';

describe('tool-schema.ts', () => {
  // ============================================
  // paramsToSchema
  // ============================================
  describe('paramsToSchema', () => {
    it('should build object schema from param docs', () => {
      const params: ToolParamDoc[] = [
        { name: 'path', type: 'string', description: '目标路径', required: true },
        { name: 'limit', type: 'number', required: false },
      ];
      const schema = paramsToSchema(params);
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties).toBeDefined();
      expect(schema.properties.path.type).toBe('string');
      expect(schema.properties.path.description).toBe('目标路径');
      expect(schema.properties.limit.type).toBe('number');
      expect(schema.required).toEqual(['path']);
    });

    it('should not require optional params', () => {
      const params: ToolParamDoc[] = [{ name: 'a', type: 'string', required: false }];
      const schema = paramsToSchema(params);
      expect(schema.required).toEqual([]);
    });

    it('should map any type to schema without a type field', () => {
      const schema = paramsToSchema([{ name: 'data', type: 'any' }]);
      expect(schema.properties.data.type).toBeUndefined();
    });
  });

  // ---------- getToolSchema ----------
  describe('getToolSchema', () => {
    it('should prefer registry schema when present', () => {
      // 'read' not in registry schema -> falls to curated docs
      const schema = getToolSchema('read');
      expect(schema.type).toBe('object');
      expect(schema.properties.path).toBeDefined();
    });

    it('should return generic positional schema derived from registry', () => {
      TOOL_REGISTRY.__genSchemaTool__ = {
        fn: () => 'ok',
        argCount: 1,
        category: 'test',
      };
      try {
        const schema = getToolSchema('__genSchemaTool__');
        expect(schema.type).toBe('object');
        expect(Object.keys(schema.properties || {})).toContain('arg0');
      } finally {
        delete TOOL_REGISTRY.__genSchemaTool__;
      }
    });
  });

  // ---------- getToolParamDocs / getToolDescription / getToolAnnotations ----------
  describe('docs getters', () => {
    it('should return curated params for known tool', () => {
      const docs = getToolParamDocs('read');
      expect(docs[0].name).toBe('path');
    });

    it('should return generic position docs derived from registry argCount', () => {
      TOOL_REGISTRY.__genTool__ = { fn: () => 'ok', argCount: 2, category: 'test' };
      try {
        const docs = getToolParamDocs('__genTool__');
        expect(docs[0].name).toBe('arg0');
        expect(docs[1].name).toBe('arg1');
      } finally {
        delete TOOL_REGISTRY.__genTool__;
      }
    });

    it('should return generic description for unknown tool', () => {
      expect(getToolDescription('__x__')).toContain('__x__');
    });

    it('should return empty annotations for unknown tool', () => {
      expect(getToolAnnotations('__x__')).toEqual({});
    });
  });

  // ---------- validateArgsAgainstSchema ----------
  describe('validateArgsAgainstSchema', () => {
    const schema = getToolSchema('read');

    it('should accept valid args', () => {
      expect(validateArgsAgainstSchema(schema, { path: 'C:/x' })).toEqual([]);
    });

    it('should report missing required arg', () => {
      const errors = validateArgsAgainstSchema(schema, {});
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('缺');
    });

    it('should report unknown argument', () => {
      const errors = validateArgsAgainstSchema(schema, { path: 'C:/x', nope: 1 });
      expect(errors.some((e) => e.includes('未知参数'))).toBe(true);
    });

    it('should report type mismatch', () => {
      const narrowed: ToolParamDoc = { name: 'x', type: 'number' };
      const numSchema = paramsToSchema([narrowed]);
      const errors = validateArgsAgainstSchema(numSchema, { x: 'not-a-number' });
      expect(errors.some((e) => e.includes('类型不匹配'))).toBe(true);
    });

    it('should allow numeric strings for number params', () => {
      const numSchema = paramsToSchema([{ name: 'x', type: 'number' }]);
      expect(validateArgsAgainstSchema(numSchema, { x: '42' })).toEqual([]);
    });
  });

  // ---------- validateToolArgs / isKnownTool ----------
  describe('validateToolArgs & isKnownTool', () => {
    it('isKnownTool returns true for registered tool', () => {
      expect(isKnownTool('read')).toBe(true);
      expect(isKnownTool('__nope__')).toBe(false);
    });

    it('validateToolArgs passes for valid registered tool call', () => {
      expect(validateToolArgs('ls', { path: 'C:/' })).toEqual([]);
    });
  });

  // ---------- objectArgsToPositional ----------
  describe('objectArgsToPositional', () => {
    it('should map object args to positional order', () => {
      const positional = objectArgsToPositional('copy', { src: 'a.txt', dest: 'b.txt' });
      expect(positional).toEqual(['a.txt', 'b.txt']);
    });

    it('should yield undefined slots for missing keys', () => {
      const positional = objectArgsToPositional('copy', { src: 'a.txt' });
      expect(positional[0]).toBe('a.txt');
      expect(positional[1]).toBeUndefined();
    });

    it('should resolve params from entry.params when present', () => {
      TOOL_REGISTRY.__tmpEntry__ = {
        fn: () => 'ok',
        argCount: 1,
        category: 'test',
        params: [{ name: 'q', type: 'string', required: true }],
      };
      try {
        expect(objectArgsToPositional('__tmpEntry__', { q: 'hello' })).toEqual(['hello']);
        expect(getToolParamDocs('__tmpEntry__')[0].name).toBe('q');
      } finally {
        delete TOOL_REGISTRY.__tmpEntry__;
      }
    });
  });

  // ---------- buildOpenAITools ----------
  describe('buildOpenAITools', () => {
    it('should build function definitions for given names', () => {
      const tools = buildOpenAITools(['read', 'copy'], { strict: false });
      expect(tools).toHaveLength(2);
      expect(tools[0].type).toBe('function');
      expect(tools[0].function.name).toBe('read');
      expect(tools[0].function.parameters.type).toBe('object');
    });

    it('should mark all params required in strict mode', () => {
      const tools = buildOpenAITools(['read'], { strict: true });
      const required = tools[0].function.parameters.required;
      expect(required).toContain('path');
      expect(tools[0].function.parameters.additionalProperties).toBe(false);
    });

    it('should attach annotations when present', () => {
      const tools = buildOpenAITools(['ocrBatch'], { strict: false });
      expect(tools[0].function.annotations).toBeDefined();
    });

    it('should skip empty names', () => {
      const tools = buildOpenAITools(['read', ''], { strict: false });
      expect(tools).toHaveLength(1);
    });
  });

  // ---------- toRichError ----------
  describe('toRichError', () => {
    it('should normalize timeout errors', () => {
      const err = toRichError('', 'request timed out after 30s');
      expect(err.code).toBe('ETIMEOUT');
    });

    it('should honor explicit error code', () => {
      const err = toRichError('EDENIED', 'anything');
      expect(err.code).toBe('EDENIED');
      expect(err.message).toContain('权限不足');
    });

    it('should interpolate message into EEXEC hint', () => {
      const err = toRichError('EEXEC', 'stdout timeout');
      expect(err.message).toContain('stdout timeout');
    });

    it('should NOT classify "networkx" module error as network (regression)', () => {
      // 回归：Python ModuleNotFoundError: No module named 'networkx' 含 "network" 子串，
      // 修复前会命中 /network/ 启发式被误判为 ENETWORK，离线场景得到
      // "网络连接失败，请检查网络后重试" 的荒谬提示。
      const err = toRichError('', "ModuleNotFoundError: No module named 'networkx'");
      expect(err.code).not.toBe('ENETWORK');
      expect(err.message).toContain('networkx');
    });

    it('should still classify real network failures as ENETWORK', () => {
      const err = toRichError('', 'fetch failed: getaddrinfo ENOTFOUND api.example.com');
      expect(err.code).toBe('ENETWORK');
    });

    it('should classify standalone "network error" message as ENETWORK', () => {
      const err = toRichError('', 'network error: connection lost');
      expect(err.code).toBe('ENETWORK');
    });

    it('should map lowercase class names to rich codes', () => {
      // classifyToolError 输出的小写分类应映射到对应富错误码，而不是落入 EUNKNOWN
      expect(toRichError('network', 'x').code).toBe('ENETWORK');
      expect(toRichError('timeout', 'x').code).toBe('ETIMEOUT');
      expect(toRichError('permission', 'x').code).toBe('EDENIED');
      expect(toRichError('filesystem', 'x').code).toBe('ENOTFOUND');
      expect(toRichError('unknown', 'x').code).toBe('EUNKNOWN');
    });
  });
});
