import { execFile, execFileSync, exec } from 'child_process';
import vm from 'vm';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { loadConfig } from '../../config.ts';
import { resolveInWorkspace } from './path.ts';

function getCodeLimits(): { maxExecutionTime: number; maxOutputSize: number } {
  const cfg: any = loadConfig();
  return {
    maxExecutionTime: cfg.code?.maxExecutionTime ?? 30000,
    maxOutputSize: cfg.code?.maxOutputSize ?? 100000
  };
}

function generateSecureTmpPath(ext: string): string {
  const tmpDir = os.tmpdir();
  const randomName = `cogito_${crypto.randomUUID()}_${Date.now()}`;
  return path.join(tmpDir, `${randomName}.${ext}`);
}

function findPythonExecutable(): string {
  const candidates = ['python', 'python3', 'python.exe', 'python3.exe'];

  for (const candidate of candidates) {
    try {
      const env = Object.create(process.env) as Record<string, string | undefined>;
      delete env.PYTHONPATH;
      delete env.PYTHONHOME;

      const result = execFileSync(candidate, ['--version'], {
        env,
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: 5000
      });

      if (result) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return 'python';
}

async function writeSecureTmpFile(filePath: string, content: string): Promise<boolean | string> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const fd = await fs.open(filePath, 'wx');
    try {
      await fd.writeFile(content, 'utf8');
    } finally {
      await fd.close();
    }
    return true;
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      const newPath = generateSecureTmpPath(path.extname(filePath).slice(1) || 'tmp');
      await fs.writeFile(newPath, content, 'utf8');
      return newPath;
    }
    throw error;
  }
}

function createSandbox(): { sandbox: any; context: vm.Context; consoleOutput: string[] } {
  const sandbox: any = Object.create(null);
  const consoleOutput: string[] = [];

  sandbox.setTimeout = undefined;
  sandbox.setInterval = undefined;
  sandbox.setImmediate = undefined;
  sandbox.process = undefined;
  sandbox.require = undefined;
  sandbox.__dirname = undefined;
  sandbox.__filename = undefined;
  sandbox.exports = undefined;
  sandbox.module = undefined;
  sandbox.global = undefined;
  sandbox.globalThis = undefined;

  sandbox.JSON = Object.freeze(JSON);
  sandbox.Math = Object.freeze(Math);
  sandbox.Date = Object.freeze(Date);
  sandbox.Array = Object.freeze(Array);
  sandbox.Object = Object.freeze(Object);
  sandbox.String = Object.freeze(String);
  sandbox.Number = Object.freeze(Number);
  sandbox.Boolean = Object.freeze(Boolean);
  sandbox.RegExp = Object.freeze(RegExp);
  sandbox.Error = Object.freeze(Error);
  sandbox.Map = Object.freeze(Map);
  sandbox.Set = Object.freeze(Set);
  sandbox.WeakMap = Object.freeze(WeakMap);
  sandbox.WeakSet = Object.freeze(WeakSet);
  sandbox.Promise = Object.freeze(Promise);
  sandbox.parseInt = parseInt;
  sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN;
  sandbox.isFinite = isFinite;
  sandbox.encodeURIComponent = encodeURIComponent;
  sandbox.decodeURIComponent = decodeURIComponent;

  sandbox.console = {
    log: (...args: any[]) => consoleOutput.push(args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')),
    info: (...args: any[]) => consoleOutput.push('[INFO] ' + args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')),
    warn: (...args: any[]) => consoleOutput.push('[WARN] ' + args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')),
    error: (...args: any[]) => consoleOutput.push('[ERROR] ' + args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' '))
  };

  return { sandbox, context: vm.createContext(sandbox), consoleOutput };
}

async function runJavaScript(code: string): Promise<any> {
  return new Promise((resolve) => {
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`
      });
    }, maxExecutionTime);

    try {
      const { context, consoleOutput } = createSandbox();

      const wrappedCode = `
        (function() {
          try {
            return { success: true, result: (function() { ${code} })() };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })()
      `;

      const result = vm.runInContext(wrappedCode, context, {
        timeout: maxExecutionTime,
        displayErrors: true
      });

      clearTimeout(timeoutId);

      if (result.success) {
        let output = '';

        if (consoleOutput.length > 0) {
          output = consoleOutput.join('\n') + '\n';
        }

        if (result.result !== undefined) {
          if (typeof result.result === 'object') {
            output += JSON.stringify(result.result, null, 2);
          } else {
            output += String(result.result);
          }
        } else if (consoleOutput.length === 0) {
          output = '执行完成，无返回值';
        }

        if (output.length > maxOutputSize) {
          output = output.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
        }

        resolve({
          success: true,
          data: output
        });
      } else {
        resolve({
          success: false,
          error: `执行失败: ${result.error}`
        });
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `执行失败: ${e.message}`
      });
    }
  });
}

async function cleanupTmpFile(tmpPath: string | null): Promise<void> {
  if (tmpPath) {
    try {
      await fs.unlink(tmpPath);
    } catch {
    }
  }
}

function hasGuiBlockingCall(code: string): boolean {
  const guiPatterns = [
    /\.mainloop\s*\(/,
    /\.show\s*\(/,
    /app\.exec\s*\(/,
    /plt\.show\s*\(/,
    /turtle\.mainloop/,
    /\.wait_window\s*\(/,
  ];

  return guiPatterns.some(pattern => pattern.test(code));
}

function injectGuiTimeout(code: string): string {
  const guiWrapper = `
import sys
import threading

def _gui_timeout_exit(delay=10):
    import time
    time.sleep(delay)
    print("\\n[提示] GUI 窗口将在 10 秒后自动关闭...")
    sys.exit(0)

_timeout_thread = threading.Thread(target=_gui_timeout_exit, daemon=True)
_timeout_thread.start()

${code}
`;

  return guiWrapper;
}

async function runPython(code: string): Promise<any> {
  return new Promise(async (resolve) => {
    let tmpPath: string | null = null;
    let timedOut = false;
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();

    const timeoutId = setTimeout(async () => {
      timedOut = true;
      await cleanupTmpFile(tmpPath);
      resolve({
        success: false,
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`
      });
    }, maxExecutionTime);

    try {
      let processedCode = code;
      const isGuiCode = hasGuiBlockingCall(code);

      if (isGuiCode) {
        processedCode = injectGuiTimeout(code);
        console.log('[提示] 检测到 GUI 程序，已注入超时退出机制');
      }

      tmpPath = generateSecureTmpPath('py');
      await writeSecureTmpFile(tmpPath, processedCode);

      const secureEnv: Record<string, string | undefined> = {
        HOME: process.env.HOME || process.env.USERPROFILE || '',
        TMPDIR: os.tmpdir(),
        TEMP: os.tmpdir(),
        PYTHONUNBUFFERED: '1',
        PYTHONNOUSERSITE: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHASHSEED: '0',
        PATH: process.env.PATH || '',
      };

      delete secureEnv.PYTHONPATH;
      delete secureEnv.PYTHONHOME;
      delete secureEnv.PYTHONSTARTUP;
      delete secureEnv.PYTHONRC;
      delete secureEnv.VIRTUAL_ENV;

      const pythonExec = findPythonExecutable();

      execFile(pythonExec, [tmpPath], {
        timeout: maxExecutionTime,
        encoding: 'utf8',
        env: secureEnv as any,
        gid: (process as any).getgid ? (process as any).getgid() : undefined,
        uid: (process as any).getuid ? (process as any).getuid() : undefined
      }, async (error, stdout, stderr) => {
        if (timedOut) return;

        clearTimeout(timeoutId);

        await cleanupTmpFile(tmpPath);

        if (error) {
          resolve({
            success: false,
            error: `执行失败: ${error.message}\n${stderr || ''}`
          });
          return;
        }

        let result = stdout || '执行完成，无输出';

        if (isGuiCode) {
          result = '🖼️ [GUI 程序已执行]\n' +
                   '提示：窗口将在 10 秒后自动关闭\n' +
                   '如果窗口未显示，可能是因为当前环境不支持图形界面\n\n' +
                   (stdout ? '[程序输出]:\n' + stdout : '');
        }

        if (stderr) {
          result += '\n[错误输出]: ' + stderr;
        }

        if (result.length > maxOutputSize) {
          result = result.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
        }

        resolve({
          success: true,
          data: result
        });
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      await cleanupTmpFile(tmpPath);
      resolve({
        success: false,
        error: `执行失败: ${e.message}`
      });
    }
  });
}

async function executeCode(code: string, language: string = 'javascript'): Promise<any> {
  const lang = language.toLowerCase();

  if (lang === 'python' || lang === 'py') {
    return await runPython(code);
  } else if (lang === 'javascript' || lang === 'js') {
    return await runJavaScript(code);
  } else {
    return {
      success: false,
      error: `不支持的语言: ${language}`
    };
  }
}

async function executeFile(filePath: string, language: string | null = null): Promise<any> {
  const resolvedPath = resolveInWorkspace(filePath);
  if (!resolvedPath) {
    return {
      success: false,
      error: '文件路径超出工作区范围'
    };
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');

    if (!language) {
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.py') language = 'python';
      else if (ext === '.js') language = 'javascript';
      else {
        return {
          success: false,
          error: '无法自动识别文件语言，请指定 language 参数'
        };
      }
    }

    return await executeCode(content, language);
  } catch (e: any) {
    return {
      success: false,
      error: `读取文件失败: ${e.message}`
    };
  }
}

async function formatCode(code: string, language: string = 'javascript'): Promise<any> {
  if (language.toLowerCase() === 'python') {
    try {
      const pythonExec = findPythonExecutable();
      const result = execFileSync(pythonExec, ['-m', 'autopep8', '--stdin-stdout'], {
        input: code,
        encoding: 'utf8',
        timeout: 30000
      });
      return { success: true, data: result };
    } catch {
      return { success: true, data: code };
    }
  } else {
    return { success: true, data: code };
  }
}

export {
  executeCode,
  executeFile,
  runJavaScript,
  runPython,
  formatCode
};