/**
 * sandbox.ts 单元测试
 *
 * 覆盖 src/agent/tools/sandbox.ts 中导出的函数：
 *  - isSandboxEnabled
 *  - runJavaScriptSandbox / runJavaScriptIsolated
 *  - runPythonSandbox
 *  - executeCodeSandbox
 *  - generateSecureTmpPath / writeSecureTmpFile / cleanupTmpFile
 *  - createJavaScriptSandbox
 *
 * 说明：
 *  - isolated-vm 为强安全依赖。runJavaScriptSandbox 在 isolated-vm 不可用时
 *    会直接拒绝执行（不再静默降级到不安全的 vm 模块）。本测试使用真实的
 *    isolated-vm 原生绑定执行 runJavaScriptSandbox / runJavaScriptIsolated。
 *  - createJavaScriptSandbox 仍作为工具函数保留并单独覆盖，
 *    它不再被 runJavaScriptSandbox 调用（已删除 vm 降级路径 runJavaScriptFallback）。
 *  - runPythonSandbox 会把 PATH 截断为前 3 项，因此在 beforeAll 中把 python
 *    所在目录前置到 PATH，保证真实执行可用。
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

// 在导入被测模块前，将数据目录指向独立临时目录。
const TMP_DIR = path.join(
  os.tmpdir(),
  `cogito-sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;

// 探测 python 是否可用及其所在目录（runPythonSandbox 依赖外部 python）。
let pythonAvailable = false;
let pythonDir = '';
try {
  const out = execFileSync(
    'python',
    ['-c', 'import sys,os;print(os.path.dirname(sys.executable))'],
    { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  pythonDir = out.trim();
  pythonAvailable = !!pythonDir;
} catch {
  pythonAvailable = false;
}

// runJavaScriptSandbox 现在要求 isolated-vm 可用（拒绝降级到 vm），故不再 mock。
// 真实 isolated-vm 绑定在本环境下可用。

const {
  isSandboxEnabled,
  runJavaScriptSandbox,
  runJavaScriptIsolated,
  runPythonSandbox,
  executeCodeSandbox,
  generateSecureTmpPath,
  writeSecureTmpFile,
  cleanupTmpFile,
  createJavaScriptSandbox,
}: any = await import('../../src/agent/tools/sandbox.ts');

const pyIt = pythonAvailable ? it : it.skip;

describe('sandbox tools', () => {
  let originalPath: string | undefined;

  beforeAll(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
    originalPath = process.env.PATH;
    // runPythonSandbox 仅保留 PATH 的前 3 项，把 python 目录前置以保证可被找到。
    if (pythonDir) {
      process.env.PATH = pythonDir + path.delimiter + (process.env.PATH || '');
    }
  });

  afterAll(async () => {
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
    }
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('isSandboxEnabled', () => {
    it('should return true by default', () => {
      const prev = process.env.COGITO_SANDBOX_MODE;
      delete process.env.COGITO_SANDBOX_MODE;
      expect(isSandboxEnabled()).toBe(true);
      if (prev !== undefined) process.env.COGITO_SANDBOX_MODE = prev;
    });

    it('should return false when COGITO_SANDBOX_MODE=false', () => {
      const prev = process.env.COGITO_SANDBOX_MODE;
      process.env.COGITO_SANDBOX_MODE = 'false';
      expect(isSandboxEnabled()).toBe(false);
      if (prev !== undefined) process.env.COGITO_SANDBOX_MODE = prev;
      else delete process.env.COGITO_SANDBOX_MODE;
    });

    it('should return true when COGITO_SANDBOX_MODE=true', () => {
      const prev = process.env.COGITO_SANDBOX_MODE;
      process.env.COGITO_SANDBOX_MODE = 'true';
      expect(isSandboxEnabled()).toBe(true);
      if (prev !== undefined) process.env.COGITO_SANDBOX_MODE = prev;
      else delete process.env.COGITO_SANDBOX_MODE;
    });
  });

  describe('generateSecureTmpPath', () => {
    it('should return a path inside tmpdir with the requested extension', () => {
      const p = generateSecureTmpPath('py');
      expect(p).toContain(os.tmpdir());
      expect(p.endsWith('.py')).toBe(true);
    });

    it('should generate unique paths', () => {
      const a = generateSecureTmpPath('js');
      const b = generateSecureTmpPath('js');
      expect(a).not.toBe(b);
    });
  });

  describe('writeSecureTmpFile & cleanupTmpFile', () => {
    it('should write content to a new file and return true', async () => {
      const target = path.join(TMP_DIR, `wtest-${Date.now()}.txt`);
      const result = await writeSecureTmpFile(target, 'hello');
      expect(result).toBe(true);
      expect(await fs.readFile(target, 'utf8')).toBe('hello');
      await cleanupTmpFile(target);
    });

    it('should return a new path when the target already exists (EEXIST)', async () => {
      const target = path.join(TMP_DIR, `eexist-${Date.now()}.txt`);
      await fs.writeFile(target, 'first');
      const result = await writeSecureTmpFile(target, 'second');
      expect(typeof result).toBe('string');
      const newPath = result as string;
      // 原文件内容保持不变
      expect(await fs.readFile(target, 'utf8')).toBe('first');
      // 新路径写入 second
      expect(await fs.readFile(newPath, 'utf8')).toBe('second');
      await cleanupTmpFile(newPath);
      await cleanupTmpFile(target);
    });

    it('cleanupTmpFile should not throw when the file does not exist', async () => {
      await expect(cleanupTmpFile(path.join(TMP_DIR, 'no-such-file'))).resolves.toBeUndefined();
    });

    it('cleanupTmpFile should accept null/undefined', async () => {
      await expect(cleanupTmpFile(null)).resolves.toBeUndefined();
      await expect(cleanupTmpFile(undefined)).resolves.toBeUndefined();
    });
  });

  describe('createJavaScriptSandbox', () => {
    it('should return a sandbox and a vm context', () => {
      const { sandbox, context } = createJavaScriptSandbox();
      expect(sandbox).toBeDefined();
      expect(context).toBeDefined();
      // 危险全局应被禁用（置为 null）
      expect(sandbox.process).toBeNull();
      expect(sandbox.require).toBeNull();
      expect(sandbox.globalThis).toBeNull();
      expect(sandbox.setTimeout).toBeNull();
      expect(sandbox.module).toBeNull();
      // 安全工具函数应可用
      expect(typeof sandbox.parseInt).toBe('function');
      expect(typeof sandbox.JSON).toBe('object');
      expect(typeof sandbox.Math).toBe('object');
    });
  });

  describe('runJavaScriptSandbox', () => {
    it('should execute a simple expression', async () => {
      const result = await runJavaScriptSandbox('return 1 + 1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('2');
    });

    it('should handle code that throws and return a failure result', async () => {
      const result = await runJavaScriptSandbox("throw new Error('oops')");
      expect(result.success).toBe(false);
      expect(result.error).toContain('oops');
    });

    it('should report no-return-value message', async () => {
      const result = await runJavaScriptSandbox('var x = 1;');
      expect(result.success).toBe(true);
      expect(result.data).toContain('无返回值');
    });

    it('should JSON-stringify object results', async () => {
      const result = await runJavaScriptSandbox('return { a: 1, b: "x" }');
      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.data);
      expect(parsed.a).toBe(1);
      expect(parsed.b).toBe('x');
    });
  });

  describe('runJavaScriptIsolated', () => {
    it('should execute code via real isolated-vm when available', async () => {
      const result = await runJavaScriptIsolated('return 1 + 1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('2');
    });

    it('should not expose process / require in the isolate', async () => {
      const r1 = await runJavaScriptIsolated('return typeof process');
      expect(r1.success).toBe(true);
      expect(r1.data).toBe('undefined');
      const r2 = await runJavaScriptIsolated('return typeof require');
      expect(r2.success).toBe(true);
      expect(r2.data).toBe('undefined');
    });
  });

  describe('runPythonSandbox', () => {
    pyIt('should execute a simple print statement', async () => {
      const result = await runPythonSandbox("print('sandbox-py')");
      expect(result.success).toBe(true);
      expect(result.data).toContain('sandbox-py');
    });

    pyIt('should execute code producing numeric output', async () => {
      const result = await runPythonSandbox('print(2 + 3)');
      expect(result.success).toBe(true);
      expect(result.data).toContain('5');
    });

    pyIt('should return an error for invalid python code', async () => {
      const result = await runPythonSandbox('print(');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('executeCodeSandbox', () => {
    it('should run javascript via the "javascript" language name', async () => {
      const result = await executeCodeSandbox('return 11', 'javascript');
      expect(result.success).toBe(true);
      expect(result.data).toBe('11');
    });

    it('should run javascript via the "js" alias', async () => {
      const result = await executeCodeSandbox('return 22', 'js');
      expect(result.success).toBe(true);
      expect(result.data).toBe('22');
    });

    it('should default to javascript when language is omitted', async () => {
      const result = await executeCodeSandbox('return 99');
      expect(result.success).toBe(true);
      expect(result.data).toBe('99');
    });

    pyIt('should run python via the "python" language name', async () => {
      const result = await executeCodeSandbox("print('xs')", 'python');
      expect(result.success).toBe(true);
      expect(result.data).toContain('xs');
    });

    pyIt('should run python via the "py" alias', async () => {
      const result = await executeCodeSandbox('print(8)', 'py');
      expect(result.success).toBe(true);
      expect(result.data).toContain('8');
    });

    it('should reject an unsupported language', async () => {
      const result = await executeCodeSandbox('code', 'cobol');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不支持的语言');
    });
  });
});
