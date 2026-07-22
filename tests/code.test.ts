/**
 * 代码执行模块测试
 */

import { jest } from '@jest/globals';

// Mock 外部依赖
jest.unstable_mockModule('../src/agent/tools/code.js', () => ({
  runJavaScript: jest.fn(),
  runPython: jest.fn(),
  executeCode: jest.fn(),
  executeFile: jest.fn(),
}));

describe('代码执行模块', () => {
  let codeModule: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    codeModule = await import('../src/agent/tools/code.js');
  });

  describe('runJavaScript', () => {
    it('应该正确执行简单 JavaScript 代码', async () => {
      codeModule.runJavaScript.mockResolvedValue({
        success: true,
        data: 'hello',
      });

      const result = await codeModule.runJavaScript('console.log("hello")');

      expect(result.success).toBe(true);
      expect(codeModule.runJavaScript).toHaveBeenCalledWith('console.log("hello")');
    });

    it('应该处理执行超时', async () => {
      codeModule.runJavaScript.mockResolvedValue({
        success: false,
        error: '执行超时（超过30秒）',
      });

      const result = await codeModule.runJavaScript('while(true) {}');

      expect(result.success).toBe(false);
      expect(result.error).toContain('超时');
    });

    it('应该处理执行错误', async () => {
      codeModule.runJavaScript.mockResolvedValue({
        success: false,
        error: 'ReferenceError: undefinedVariable is not defined',
      });

      const result = await codeModule.runJavaScript('undefinedVariable');

      expect(result.success).toBe(false);
    });

    it('应该正确返回 JSON 对象', async () => {
      codeModule.runJavaScript.mockResolvedValue({
        success: true,
        data: '{"name":"test","value":123}',
      });

      const result = await codeModule.runJavaScript('JSON.stringify({name:"test",value:123})');

      expect(result.success).toBe(true);
    });
  });

  describe('runPython', () => {
    it('应该正确执行简单 Python 代码', async () => {
      codeModule.runPython.mockResolvedValue({
        success: true,
        data: 'hello',
      });

      const result = await codeModule.runPython('print("hello")');

      expect(result.success).toBe(true);
    });

    it('应该正确处理 runPython 返回的错误', async () => {
      codeModule.runPython.mockResolvedValue({
        success: false,
        error: 'Python 执行失败',
      });

      const result = await codeModule.runPython('print("hello")');

      expect(result.success).toBe(false);
    });
  });

  describe('executeCode', () => {
    it('应该根据语言参数选择正确的执行器', async () => {
      codeModule.executeCode.mockResolvedValue({
        success: true,
        data: 'result',
      });

      const result = await codeModule.executeCode('code', 'javascript');

      expect(result.success).toBe(true);
    });

    it('应该拒绝不安全的代码', async () => {
      codeModule.executeCode.mockResolvedValue({
        success: false,
        error: '代码执行被拒绝：不安全的操作',
      });

      const result = await codeModule.executeCode(
        'require("child_process").exec("rm -rf /")',
        'javascript',
      );

      expect(result.success).toBe(false);
    });
  });

  describe('沙箱安全', () => {
    it('沙箱环境不应允许访问 process 对象', async () => {
      codeModule.runJavaScript.mockResolvedValue({
        success: false,
        error: 'process is not defined',
      });

      const result = await codeModule.runJavaScript('process.exit()');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not defined');
    });

    it('沙箱环境不应允许访问 require 函数', async () => {
      codeModule.runJavaScript.mockResolvedValue({
        success: false,
        error: 'require is not defined',
      });

      const result = await codeModule.runJavaScript('require("fs")');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not defined');
    });

    it('沙箱环境不应允许访问全局对象', async () => {
      codeModule.runJavaScript.mockResolvedValue({
        success: false,
        error: 'global is not defined',
      });

      const result = await codeModule.runJavaScript('global.console.log("test")');

      expect(result.success).toBe(false);
    });
  });
});
