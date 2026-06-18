/**
 * 配置模块测试
 */

import { deepMerge, isConfigured, DEFAULT_CONFIG, loadConfig, saveConfig } from '../src/config.js';
import fs from 'fs';
import path from 'path';

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
    
    test('应该正确合并三层嵌套对象', () => {
      const target = { a: { b: { c: 1, d: 2 } } };
      const source = { a: { b: { c: 3 } } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { b: { c: 3, d: 2 } } });
    });
    
    test('应该处理undefined值', () => {
      const target = { a: 1 };
      const source = { a: undefined, b: 2 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: undefined, b: 2 });
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
    
    test('应该包含所有模型的配置', () => {
      expect(DEFAULT_CONFIG.models).toHaveProperty('openai');
      expect(DEFAULT_CONFIG.models).toHaveProperty('moark');
      expect(DEFAULT_CONFIG.models).toHaveProperty('anthropic');
      expect(DEFAULT_CONFIG.models).toHaveProperty('google');
    });
    
    test('应该包含代码执行配置', () => {
      expect(DEFAULT_CONFIG.code).toHaveProperty('maxExecutionTime');
      expect(DEFAULT_CONFIG.code).toHaveProperty('maxOutputSize');
      expect(DEFAULT_CONFIG.code.maxExecutionTime).toBe(30000);
      expect(DEFAULT_CONFIG.code.maxOutputSize).toBe(100000);
    });
  });
  
  describe('loadConfig', () => {
    test('应该返回配置对象', () => {
      const config = loadConfig();
      expect(config).toBeInstanceOf(Object);
      expect(config).toHaveProperty('api');
      expect(config).toHaveProperty('chat');
    });
    
    test('应该包含默认配置的所有字段', () => {
      const config = loadConfig();
      const defaultKeys = Object.keys(DEFAULT_CONFIG);
      const configKeys = Object.keys(config);
      
      defaultKeys.forEach(key => {
        expect(configKeys).toContain(key);
      });
    });
  });
  
  describe('isConfigured', () => {
    test('应该是一个函数', () => {
      expect(typeof isConfigured).toBe('function');
    });
  });
});