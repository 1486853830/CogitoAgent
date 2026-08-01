import { execFile, execFileSync, exec } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig } from '../../config.ts';
import { resolveInWorkspace } from './path.ts';
import { runJavaScriptSandbox } from './sandbox.ts';
import {
  getCodeLimits,
  generateSecureTmpPath,
  writeSecureTmpFile,
  cleanupTmpFile,
} from './code-exec-utils.ts';

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
        timeout: 5000,
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

async function runJavaScript(code: string): Promise<any> {
  // 安全决策：JavaScript 执行统一走 isolated-vm 沙箱（见 sandbox.ts）。
  // 此前基于 Node 原生 vm 模块的实现并非安全沙箱——攻击者可通过原型链
  // （如 [].constructor.constructor）拿到宿主 Function 构造器，逃逸出沙箱
  // 执行任意代码（RCE）。isolated-vm 使用独立 V8 堆，从机制上阻断逃逸。
  const { maxExecutionTime } = getCodeLimits();
  return runJavaScriptSandbox(code, maxExecutionTime);
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

  return guiPatterns.some((pattern) => pattern.test(code));
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
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`,
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

      // 科学模式：允许使用已安装的 Python 科学库
      const cfg: any = loadConfig();
      const scientificMode = cfg.code?.scientificMode === true;

      const secureEnv: Record<string, string | undefined> = {
        HOME: process.env.HOME || process.env.USERPROFILE || '',
        TMPDIR: os.tmpdir(),
        TEMP: os.tmpdir(),
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHASHSEED: '0',
        PATH: process.env.PATH || '',
      };

      if (scientificMode) {
        // 科学模式：保留 PYTHONPATH 和用户 site-packages，允许加载科学库
        if (process.env.PYTHONPATH) {
          secureEnv.PYTHONPATH = process.env.PYTHONPATH;
        }
        if (process.env.PYTHONHOME) {
          secureEnv.PYTHONHOME = process.env.PYTHONHOME;
        }
        console.log('[提示] 科学模式已启用 - 允许加载 Python 科学库');
      } else {
        // 安全模式：阻止加载用户级 site-packages
        secureEnv.PYTHONNOUSERSITE = '1';
        delete secureEnv.PYTHONPATH;
        delete secureEnv.PYTHONHOME;
        delete secureEnv.PYTHONSTARTUP;
        delete secureEnv.PYTHONRC;
        delete secureEnv.VIRTUAL_ENV;
      }

      const pythonExec = findPythonExecutable();

      execFile(
        pythonExec,
        [tmpPath],
        {
          timeout: maxExecutionTime,
          encoding: 'utf8',
          env: secureEnv as any,
          gid: (process as any).getgid ? (process as any).getgid() : undefined,
          uid: (process as any).getuid ? (process as any).getuid() : undefined,
        },
        async (error, stdout, stderr) => {
          if (timedOut) return;

          clearTimeout(timeoutId);

          await cleanupTmpFile(tmpPath);

          if (error) {
            resolve({
              success: false,
              error: `执行失败: ${error.message}\n${stderr || ''}`,
            });
            return;
          }

          let result = stdout || '执行完成，无输出';

          if (isGuiCode) {
            result =
              '🖼️ [GUI 程序已执行]\n' +
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
            data: result,
          });
        },
      );
    } catch (e: any) {
      clearTimeout(timeoutId);
      await cleanupTmpFile(tmpPath);
      resolve({
        success: false,
        error: `执行失败: ${e.message}`,
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
      error: `不支持的语言: ${language}`,
    };
  }
}

async function executeFile(filePath: string, language: string | null = null): Promise<any> {
  const resolvedPath = resolveInWorkspace(filePath);
  if (!resolvedPath) {
    return {
      success: false,
      error: '文件路径超出工作区范围',
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
          error: '无法自动识别文件语言，请指定 language 参数',
        };
      }
    }

    return await executeCode(content, language);
  } catch (e: any) {
    return {
      success: false,
      error: `读取文件失败: ${e.message}`,
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
        timeout: 30000,
      });
      return { success: true, data: result };
    } catch {
      return { success: true, data: code };
    }
  } else {
    return { success: true, data: code };
  }
}

export { executeCode, executeFile, runJavaScript, runPython, formatCode };
