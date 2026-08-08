/**
 * Agent 模块测试
 *
 * 注意：这些测试主要测试纯函数和工具函数。
 * Agent.js 中的状态管理函数需要在完整环境中测试。
 */

import { formatToolResult, TOOL_OUTPUT_LIMITS, STATE } from '../src/agent/Agent.js';

describe('Agent.js', () => {
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

    test('应该按 TOOL_OUTPUT_LIMITS 截断超长输出', () => {
      const longOutput = 'x'.repeat(15000);
      const result = formatToolResult('test', longOutput);
      // 'test' 工具走 default limit=10000，超长输出被强制截断（R10.4）
      expect(result.length).toBeLessThan(longOutput.length);
      expect(result).toContain('输出已截断');
      expect(result).toContain('原始 15000 字符');
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
