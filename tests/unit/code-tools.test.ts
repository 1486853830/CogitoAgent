/**
 * code.ts 单元测试
 *
 * 覆盖 src/agent/tools/code.ts 中导出的函数：
 *  - runJavaScript
 *  - runPython
 *  - executeCode
 *  - executeFile
 *  - formatCode
 *
 * 内部工具函数（getCodeLimits / generateSecureTmpPath / findPythonExecutable /
 * writeSecureTmpFile 等）未导出，通过上述导出函数间接触发其执行路径。
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

// 在导入被测模块前，将数据目录与工作区指向一个独立临时目录，
// 避免污染真实配置 / 工作区。
const TMP_DIR = path.join(
  os.tmpdir(),
  `cogito-code-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;
process.env.COGITO_WORKSPACE = TMP_DIR;

// 运行时探测 Python 是否可用（runPython 依赖外部 python 可执行文件）。
let pythonAvailable = false;
try {
  const out = execFileSync(
    'python',
    ['-c', 'import sys,os;print(os.path.dirname(sys.executable))'],
    {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  pythonAvailable = !!out.trim();
} catch {
  pythonAvailable = false;
}

// 跳过必须是"可见"的：静默 skip 会让 CI 上永远绿灯却什么都没测。
// 设置 COGITO_TEST_REQUIRE_PYTHON=1 可强制要求 python 存在（CI 推荐开启）。
if (!pythonAvailable) {
  const msg = '[WARN] 未检测到可用的 python，依赖 python 的用例将被跳过（跳过 ≠ 通过）';
  if (process.env.COGITO_TEST_REQUIRE_PYTHON === '1') {
    throw new Error(msg.replace('[WARN]', '[FATAL]') + '；已开启 COGITO_TEST_REQUIRE_PYTHON=1');
  }
  console.warn(msg);
}

const pyIt = pythonAvailable ? it : it.skip;

import {
  executeCode,
  executeFile,
  runJavaScript,
  runPython,
  formatCode,
} from '../../src/agent/tools/code.ts';

describe('code tools', () => {
  beforeAll(async () => {
    await fs.mkdir(TMP_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('runJavaScript', () => {
    it('should execute a simple expression and return its value', async () => {
      const result = await runJavaScript('return 1 + 1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('2');
    });

    it('should capture console.log output', async () => {
      const result = await runJavaScript("console.log('hello world')");
      expect(result.success).toBe(true);
      expect(result.data).toContain('hello world');
    });

    it('should capture multiple console.log calls', async () => {
      const result = await runJavaScript("console.log('a'); console.log('b');");
      expect(result.success).toBe(true);
      expect(result.data).toContain('a');
      expect(result.data).toContain('b');
    });

    it('should return an error result when code throws', async () => {
      const result = await runJavaScript("throw new Error('boom')");
      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
    });

    it('should report no-return-value message when nothing is returned or logged', async () => {
      const result = await runJavaScript('var x = 1;');
      expect(result.success).toBe(true);
      expect(result.data).toContain('无返回值');
    });

    it('should JSON-stringify object results', async () => {
      const result = await runJavaScript('return { name: "test", value: 42 }');
      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.data);
      expect(parsed.name).toBe('test');
      expect(parsed.value).toBe(42);
    });

    it('should not expose process in the sandbox', async () => {
      const result = await runJavaScript('return typeof process');
      expect(result.success).toBe(true);
      expect(result.data).toBe('undefined');
    });

    it('should not expose require in the sandbox', async () => {
      const result = await runJavaScript('return typeof require');
      expect(result.success).toBe(true);
      expect(result.data).toBe('undefined');
    });
  });

  describe('runPython', () => {
    pyIt('should execute a simple print statement', async () => {
      const result = await runPython("print('hello')");
      expect(result.success).toBe(true);
      expect(result.data).toContain('hello');
    });

    pyIt('should execute code producing numeric output', async () => {
      const result = await runPython('print(1 + 1)');
      expect(result.success).toBe(true);
      expect(result.data).toContain('2');
    });

    pyIt('should execute multi-line code', async () => {
      const result = await runPython('x = 10\ny = 20\nprint(x + y)');
      expect(result.success).toBe(true);
      expect(result.data).toContain('30');
    });

    pyIt('should return an error for invalid python code', async () => {
      const result = await runPython('print(');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('executeCode', () => {
    it('should run javascript via the "javascript" language name', async () => {
      const result = await executeCode('return 1 + 1', 'javascript');
      expect(result.success).toBe(true);
      expect(result.data).toBe('2');
    });

    it('should run javascript via the "js" alias', async () => {
      const result = await executeCode('return 40 + 2', 'js');
      expect(result.success).toBe(true);
      expect(result.data).toBe('42');
    });

    it('should be case-insensitive for the language name', async () => {
      const result = await executeCode('return 1', 'JAVASCRIPT');
      expect(result.success).toBe(true);
      expect(result.data).toBe('1');
    });

    it('should default to javascript when language is omitted', async () => {
      const result = await executeCode('return 7');
      expect(result.success).toBe(true);
      expect(result.data).toBe('7');
    });

    pyIt('should run python via the "python" language name', async () => {
      const result = await executeCode("print('hi')", 'python');
      expect(result.success).toBe(true);
      expect(result.data).toContain('hi');
    });

    pyIt('should run python via the "py" alias', async () => {
      const result = await executeCode('print(5)', 'py');
      expect(result.success).toBe(true);
      expect(result.data).toContain('5');
    });

    it('should reject an unsupported language', async () => {
      const result = await executeCode('code', 'ruby');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不支持的语言');
    });
  });

  describe('executeFile', () => {
    it('should auto-detect and run a .js file', async () => {
      const filePath = path.join(TMP_DIR, 'sample.js');
      await fs.writeFile(filePath, 'return 100');
      const result = await executeFile(filePath);
      expect(result.success).toBe(true);
      expect(result.data).toBe('100');
    });

    pyIt('should auto-detect and run a .py file', async () => {
      const filePath = path.join(TMP_DIR, 'sample.py');
      await fs.writeFile(filePath, "print('from file')");
      const result = await executeFile(filePath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('from file');
    });

    it('should run a file with an explicit language override', async () => {
      const filePath = path.join(TMP_DIR, 'script.txt');
      await fs.writeFile(filePath, 'return 9');
      const result = await executeFile(filePath, 'javascript');
      expect(result.success).toBe(true);
      expect(result.data).toBe('9');
    });

    it('should reject an unsupported file extension when no language is given', async () => {
      const filePath = path.join(TMP_DIR, 'data.xyz');
      await fs.writeFile(filePath, 'content');
      const result = await executeFile(filePath);
      expect(result.success).toBe(false);
      expect(result.error).toContain('无法自动识别');
    });

    it('should reject a path outside the workspace', async () => {
      const outside = path.join(
        os.tmpdir(),
        `cogito-outside-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
      );
      await fs.writeFile(outside, 'content');
      const result = await executeFile(outside);
      expect(result.success).toBe(false);
      expect(result.error).toContain('工作区范围');
      await fs.unlink(outside);
    });

    it('should return an error for a non-existent file', async () => {
      const result = await executeFile(path.join(TMP_DIR, 'no-such-file.js'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('读取文件失败');
    });
  });

  describe('formatCode', () => {
    it('should return javascript code unchanged', async () => {
      const code = 'const x = 1;';
      const result = await formatCode(code, 'javascript');
      expect(result.success).toBe(true);
      expect(result.data).toBe(code);
    });

    it('should return code unchanged for an unknown language', async () => {
      const code = 'some code';
      const result = await formatCode(code, 'ruby');
      expect(result.success).toBe(true);
      expect(result.data).toBe(code);
    });

    pyIt('should return a string for python code (autopep8 optional)', async () => {
      const code = 'print(1)';
      const result = await formatCode(code, 'python');
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('string');
    });
  });
});
