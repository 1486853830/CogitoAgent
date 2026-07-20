/**
 * Agent 模块测试
 *
 * 注意：这些测试主要测试纯函数和工具函数。
 * Agent.js 中的状态管理函数需要在完整环境中测试。
 */

import {
  parseArgs,
  parseToolCall,
  parseAllToolCalls,
  formatToolResult,
  TOOL_OUTPUT_LIMITS,
  STATE,
} from '../src/agent/Agent.js';

describe('Agent.js', () => {
  describe('parseArgs', () => {
    test('应该正确解析 JSON 格式参数', () => {
      const result = parseArgs('{"path": "test.txt", "content": "hello"}');
      expect(result.isJson).toBe(true);
      expect(result.data.path).toBe('test.txt');
      expect(result.data.content).toBe('hello');
    });

    test('应该正确解析带引号的参数（内容包含逗号）', () => {
      const result = parseArgs('"test.txt", "hello, world, test"');
      expect(result).toEqual(['test.txt', 'hello, world, test']);
    });

    test('应该正确解析简单逗号分隔参数', () => {
      const result = parseArgs('arg1, arg2, arg3');
      expect(result).toEqual(['arg1', 'arg2', 'arg3']);
    });

    test('应该正确解析带引号的简单参数', () => {
      const result = parseArgs('"path/to/file", "content"');
      expect(result).toEqual(['path/to/file', 'content']);
    });

    test('应该处理空参数', () => {
      const result = parseArgs('');
      expect(result).toEqual([]);
    });

    test('应该处理单个参数', () => {
      const result = parseArgs('singleArg');
      expect(result).toEqual(['singleArg']);
    });

    test('应该处理单引号包裹的参数', () => {
      const result = parseArgs("'path', 'content'");
      expect(result).toEqual(['path', 'content']);
    });

    test('应该处理混合引号的参数', () => {
      const result = parseArgs('"path", \'content\'');
      expect(result).toEqual(['path', 'content']);
    });
  });

  describe('parseToolCall', () => {
    test('应该正确解析工具调用', () => {
      const result = parseToolCall('[TOOL] create("test.txt", "hello") [/TOOL]');
      expect(result.tool).toBe('create');
      expect(result.args).toEqual(['test.txt', 'hello']);
    });

    test('应该正确解析带 JSON 参数的工具调用', () => {
      const result = parseToolCall(
        '[TOOL] create({"path": "test.txt", "content": "hello"}) [/TOOL]',
      );
      expect(result.tool).toBe('create');
      expect(result.args.isJson).toBe(true);
      expect(result.args.data.path).toBe('test.txt');
    });

    test('应该正确解析多行参数', () => {
      const result = parseToolCall('[TOOL] create("test.txt", "line1\nline2\nline3") [/TOOL]');
      expect(result.tool).toBe('create');
      expect(result.args[1]).toBe('line1\nline2\nline3');
    });

    test('应该返回 null 对于无效格式', () => {
      const result = parseToolCall('invalid format');
      expect(result).toBeNull();
    });

    test('应该正确解析无参数的工具调用', () => {
      const result = parseToolCall('[TOOL] ls() [/TOOL]');
      expect(result.tool).toBe('ls');
      expect(result.args).toEqual([]);
    });
  });

  describe('parseAllToolCalls', () => {
    test('应该解析多个工具调用', () => {
      const text = '[TOOL] ls(".") [/TOOL] some text [TOOL] read("file.txt") [/TOOL]';
      const result = parseAllToolCalls(text);
      expect(result.length).toBe(2);
      expect(result[0].tool).toBe('ls');
      expect(result[1].tool).toBe('read');
    });

    test('应该返回空数组对于无工具调用的文本', () => {
      const result = parseAllToolCalls('just some text');
      expect(result).toEqual([]);
    });
  });

  describe('TOOL_OUTPUT_LIMITS', () => {
    test('应该包含所有预期工具的限制', () => {
      expect(TOOL_OUTPUT_LIMITS).toHaveProperty('ls');
      expect(TOOL_OUTPUT_LIMITS).toHaveProperty('gitLog');
      expect(TOOL_OUTPUT_LIMITS).toHaveProperty('executeCode');
      expect(TOOL_OUTPUT_LIMITS).toHaveProperty('read');
      expect(TOOL_OUTPUT_LIMITS).toHaveProperty('search');
    });

    test('应该为不同工具设置合理的限制值', () => {
      // 目录列表应该较短
      expect(TOOL_OUTPUT_LIMITS.ls).toBeLessThan(TOOL_OUTPUT_LIMITS.executeCode);

      // 代码执行可以较长
      expect(TOOL_OUTPUT_LIMITS.executeCode).toBe(50000);

      // 默认限制应该合理
      expect(TOOL_OUTPUT_LIMITS.default).toBe(10000);
    });

    test('ls 限制应该是5000', () => {
      expect(TOOL_OUTPUT_LIMITS.ls).toBe(5000);
    });

    test('executeCode 限制应该是50000', () => {
      expect(TOOL_OUTPUT_LIMITS.executeCode).toBe(50000);
    });

    test('default 限制应该是10000', () => {
      expect(TOOL_OUTPUT_LIMITS.default).toBe(10000);
    });
  });

  describe('formatToolResult', () => {
    test('应该返回字符串类型结果', () => {
      const result = formatToolResult('test', 'simple text');
      expect(typeof result).toBe('string');
    });

    test('应该处理简单文本', () => {
      const result = formatToolResult('test', 'hello world');
      expect(result).toBe('hello world');
    });

    test('应该处理空数组', () => {
      const result = formatToolResult('ls', []);
      // 空数组可能返回空字符串或截断提示
      expect(typeof result).toBe('string');
    });

    test('应该处理null输入', () => {
      const result = formatToolResult('read', null);
      expect(result).toBe('null');
    });

    test('应该处理undefined输入', () => {
      const result = formatToolResult('read', undefined);
      expect(result).toBe('undefined');
    });

    test('应该处理数字输入', () => {
      const result = formatToolResult('test', 42);
      expect(result).toBe('42');
    });

    test('应该返回完整结果不截断', () => {
      const longOutput = 'x'.repeat(15000);
      const result = formatToolResult('test', longOutput);
      expect(result.length).toBe(15000);
      expect(result).not.toContain('... [输出内容过长，已截断]');
    });
  });

  describe('STATE', () => {
    test('应该定义所有必要的状态', () => {
      expect(STATE).toHaveProperty('THINKING');
      expect(STATE).toHaveProperty('AWAITING_INPUT');
      expect(STATE).toHaveProperty('AWAITING_CONFIRMATION');
    });

    test('状态值应该是唯一的', () => {
      const values = Object.values(STATE);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });
});
