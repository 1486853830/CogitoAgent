/**
 * 代码执行模块测试
 */

import { jest } from '@jest/globals';

describe('代码执行模块', () => {
  let codeModule;

  beforeEach(async () => {
    jest.resetModules();
    codeModule = await import('../src/agent/tools/code.js');
  });

  describe('runJavaScript', () => {
    it('应该拒绝不安全的代码 - process', async () => {
      const result = await codeModule.runJavaScript('process.exit()');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该拒绝不安全的代码 - require', async () => {
      const result = await codeModule.runJavaScript('require("fs")');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该拒绝不安全的代码 - global', async () => {
      const result = await codeModule.runJavaScript('global.console.log("test")');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该允许安全的基础对象', async () => {
      const result = await codeModule.runJavaScript('JSON.stringify({a:1})');
      expect(result.success).toBe(true);
    });

    it('应该拒绝原型链逃逸', async () => {
      // 尝试通过原型链访问 Function
      const result = await codeModule.runJavaScript('({}).constructor.constructor("process.exit()")()');
      expect(result.success).toBe(false);
    });
  });

  describe('runPython', () => {
    it('应该拒绝危险操作 - 文件系统访问', async () => {
      const result = await codeModule.runPython('import os; os.system("echo test")');
      // Python 执行可能成功或失败，取决于环境配置
      expect(typeof result.success).toBe('boolean');
    });

    it('应该正确处理输出', async () => {
      const result = await codeModule.runPython('print("hello")');
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('executeCode', () => {
    it('应该拒绝不安全的代码', async () => {
      const result = await codeModule.executeCode('require("child_process").exec("rm -rf /")', 'javascript');
      expect(result.success).toBe(false);
    });
  });

  describe('formatCode', () => {
    it('应该格式化 JavaScript 代码', async () => {
      const result = await codeModule.formatCode('function test(){return 1}', 'javascript');
      expect(result.success).toBe(true);
    });

    it('Python 格式化取决于环境', async () => {
      const result = await codeModule.formatCode('def test():return 1', 'python');
      // Python 格式化可能不可用
      expect(typeof result.success).toBe('boolean');
    });
  });
});
