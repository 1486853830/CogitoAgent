/**
 * 配置模块测试
 */

import { deepMerge, isConfigured, DEFAULT_CONFIG } from '../src/config.js';

describe('config.js', () => {
  describe('deepMerge', () => {
    test('应该正确合并简单对象', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('应该正确合并嵌套对象', () => {
      const target = { api: { key: 'old', url: 'http://old' } };
      const source = { api: { key: 'new' } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ api: { key: 'new', url: 'http://old' } });
    });

    test('应该处理空对象', () => {
      const result = deepMerge({}, {});
      expect(result).toEqual({});
    });

    test('应该处理数组', () => {
      const target = { list: [1, 2] };
      const source = { list: [3, 4] };
      const result = deepMerge(target, source);
      expect(result.list).toEqual([3, 4]);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    test('应该包含必要的配置字段', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('api');
      expect(DEFAULT_CONFIG).toHaveProperty('chat');
      expect(DEFAULT_CONFIG).toHaveProperty('workspace');
      expect(DEFAULT_CONFIG.api).toHaveProperty('apiKey');
      expect(DEFAULT_CONFIG.chat).toHaveProperty('thinkingInterval');
    });

    test('thinkingInterval 应该是合理的值', () => {
      expect(DEFAULT_CONFIG.chat.thinkingInterval).toBeGreaterThanOrEqual(1000);
      expect(DEFAULT_CONFIG.chat.thinkingInterval).toBeLessThanOrEqual(10000);
    });
  });
});