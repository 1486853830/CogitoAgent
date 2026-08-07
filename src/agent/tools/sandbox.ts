/**
 * 代码执行沙箱模块
 * 使用 isolated-vm 提供强隔离的代码执行环境
 * 支持 JavaScript 和 Python 代码执行
 */

import { execFile } from 'child_process';
import path from 'path';
import os from 'os';
import vm from 'vm';
import { loadConfig } from '../../config.ts';
import {
  getCodeLimits,
  generateSecureTmpPath,
  writeSecureTmpFile,
  cleanupTmpFile,
} from './code-exec-utils.ts';
import { findPythonExecutable } from './code.ts';

interface SandboxResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** isolated-vm 模块的最小结构（该包无完整 TS 类型，按使用面定义） */
interface IvmModule {
  Isolate: new (options: Record<string, unknown>) => IvmIsolate;
}

/** isolated-vm Context 的最小结构 */
interface IvmContext {
  global: IvmReference;
  eval: (code: string, options?: Record<string, unknown>) => Promise<string>;
}

/** isolated-vm Reference（jail/global 包装）的最小结构 */
interface IvmReference {
  set: (key: string, value: unknown) => Promise<void>;
}

/** isolated-vm Isolate 实例的最小结构 */
interface IvmIsolate {
  createContext: () => Promise<IvmContext>;
  dispose: () => void;
}

/**
 * 动态加载 isolated-vm（原生模块可能在 Electron 等环境中不可用）
 */
let _ivm: IvmModule | null = null;
let _ivmLoadAttempted = false;

async function getIvm(): Promise<IvmModule | null> {
  if (_ivm) return _ivm;
  if (_ivmLoadAttempted) return null;
  _ivmLoadAttempted = true;
  try {
    const mod = await import('isolated-vm');
    _ivm = (mod.default || mod) as IvmModule;
    return _ivm;
  } catch {
    console.warn('[sandbox] isolated-vm 不可用，将使用原生 vm 模块');
    return null;
  }
}

const MAX_MEMORY_MB = 128;

/**
 * 检查是否启用沙箱模式
 * 环境变量值始终是字符串，仅 'false' 表示显式关闭。
 */
function isSandboxEnabled(): boolean {
  return process.env.COGITO_SANDBOX_MODE !== 'false';
}

/**
 * 在 isolated-vm 沙箱中执行 JavaScript 代码
 *
 * 安全模型：isolated-vm 使用独立 V8 堆，与宿主完全隔离，原型链逃逸
 * （如 [].constructor.constructor 拿到宿主 Function）在此机制下无效。
 *
 * 实现要点：
 *  - console 在 isolate 内部实现（把输出收集到数组，随结果 JSON 一起传回），
 *    避免使用 ivm.Callback/Reference 跨堆暴露（v6 下嵌套属性回调不可靠，
 *    且 Reference 包装的对象在 isolate 内不可直接调用）。
 *  - 结果通过 JSON 字符串中转：context.eval 仅能直接传回可转移原始值，
 *    对象默认返回 undefined，故用 JSON.stringify 包成字符串再在宿主解析。
 */
async function runJavaScriptIsolated(
  code: string,
  timeout: number = 10000,
): Promise<SandboxResult> {
  const ivm = await getIvm();
  if (!ivm) {
    throw new Error('isolated-vm 不可用，请降级到原生 vm');
  }

  const { maxExecutionTime, maxOutputSize } = getCodeLimits();

  let isolate: IvmIsolate | null = null;

  try {
    isolate = new ivm.Isolate({
      memoryLimit: MAX_MEMORY_MB,
      inspector: false,
      cpuTimeout: Math.min(timeout, maxExecutionTime),
    });

    const context = await isolate.createContext();
    const jail = context.global;

    // 用户代码以「数据」而非「源码内联」的形式传入 isolate：先 set 到全局变量，
    // 再在 isolate 内用 new Function(__userCode) 构造执行。
    // 这样即使用户代码含 }); 等内容，也不会突破外层包裹结构（修复字符串内联注入）。
    await jail.set('__userCode', code);

    // isolate 自行实现 console：收集日志到 __logs，随结果 JSON 一起返回。
    // context.eval 仅能直接传回可转移原始值，对象默认返回 undefined，故结果同样用
    // JSON.stringify 包成字符串再在宿主解析。
    await context.eval(`
      (function() {
        function __fmt(a) {
          if (a === undefined) return 'undefined';
          if (a === null) return 'null';
          if (typeof a === 'function') return '[Function]';
          if (typeof a === 'object') {
            try { return JSON.stringify(a, null, 2); } catch (e) { return '[Object]'; }
          }
          return String(a);
        }
        function __join(args) {
          var out = [];
          for (var i = 0; i < args.length; i++) out.push(__fmt(args[i]));
          return out.join(' ');
        }
        globalThis.__logs = [];
        globalThis.console = {
          log: function() { globalThis.__logs.push(__join(arguments)); },
          info: function() { globalThis.__logs.push('[INFO] ' + __join(arguments)); },
          warn: function() { globalThis.__logs.push('[WARN] ' + __join(arguments)); },
          error: function() { globalThis.__logs.push('[ERROR] ' + __join(arguments)); }
        };
      })()
    `);

    // 在 isolate 内用 new Function 执行用户代码：无害的变量名/注释无法破坏包裹结构，
    // 且代码作用域是该 isolate 的堆（process/require 等 Node 全局天然不存在）。
    const wrappedExecution = `
      (function() {
        try {
          var result = new Function(globalThis.__userCode).call(globalThis);
          return JSON.stringify({
            success: true,
            result: result === undefined ? null : result,
            logs: Array.isArray(globalThis.__logs) ? globalThis.__logs : []
          });
        } catch (e) {
          return JSON.stringify({
            success: false,
            error: e && e.message ? e.message : String(e),
            logs: Array.isArray(globalThis.__logs) ? globalThis.__logs : []
          });
        }
      })()
    `;

    const resultStr = await context.eval(wrappedExecution, {
      timeout: Math.min(timeout, maxExecutionTime),
      breakOnSigint: true,
    });

    interface IsolateExecResult {
      success?: boolean;
      result?: unknown;
      error?: string;
      logs?: string[];
    }
    let resultObj: IsolateExecResult;
    try {
      resultObj = JSON.parse(resultStr) as IsolateExecResult;
    } catch {
      return {
        success: false,
        error: '沙箱执行失败: 无法解析执行结果',
      };
    }

    // 控制台输出
    let output = '';
    const logs: string[] = Array.isArray(resultObj.logs) ? resultObj.logs : [];
    if (logs.length > 0) {
      output = logs.join('\n') + '\n';
      if (output.length > maxOutputSize) {
        output = output.slice(0, maxOutputSize) + '\n[输出过长已截断]';
      }
    }

    if (!resultObj.success) {
      return { success: false, error: `执行失败: ${resultObj.error}` };
    }

    if (resultObj.result !== undefined && resultObj.result !== null) {
      if (typeof resultObj.result === 'object') {
        output += JSON.stringify(resultObj.result, null, 2);
      } else {
        output += String(resultObj.result);
      }
    } else if (logs.length === 0) {
      output = '执行完成，无返回值';
    }

    if (output.length > maxOutputSize) {
      output = output.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
    }

    return { success: true, data: output };
  } catch (error: unknown) {
    return {
      success: false,
      error: `沙箱执行失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (isolate) {
      try {
        isolate.dispose();
      } catch {
        // dispose 失败时忽略，isolate 最终由 GC 回收
      }
    }
  }
}

/**
 * 基于 Node.js 原生 vm 模块的沙箱上下文工具
 *
 * 说明：runJavaScriptSandbox 已不再降级到 vm（vm 非安全沙箱，可经原型链逃逸）。
 * createJavaScriptSandbox / createFrozenObject 仍作为工具函数导出，供需要
 * 受限 vm 上下文的场景直接使用，但不再参与 runJavaScriptSandbox 的执行路径。
 */

function createFrozenObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  const propNames = Object.getOwnPropertyNames(obj);
  const symbolProps = Object.getOwnPropertySymbols(obj);

  for (const name of propNames) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, name);
    if (descriptor && descriptor.value !== undefined) {
      if (typeof descriptor.value === 'object' && descriptor.value !== null) {
        createFrozenObject(descriptor.value);
      }
      Object.defineProperty(obj, name, { ...descriptor, writable: false });
    }
  }

  for (const sym of symbolProps) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, sym);
    if (descriptor && descriptor.value !== undefined) {
      if (typeof descriptor.value === 'object' && descriptor.value !== null) {
        createFrozenObject(descriptor.value);
      }
      Object.defineProperty(obj, sym, { ...descriptor, writable: false });
    }
  }

  return Object.freeze(obj);
}

interface SandboxContext {
  sandbox: Record<string, unknown>;
  context: vm.Context;
}

function createJavaScriptSandbox(): SandboxContext {
  const sandbox: Record<string, unknown> = Object.create(null);

  sandbox.console = Object.seal(
    Object.assign(Object.create(null), {
      log: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
    }),
  );

  sandbox.global = null;
  sandbox.globalThis = null;
  sandbox.process = null;
  sandbox.require = null;
  sandbox.module = null;
  sandbox.exports = null;
  sandbox.Buffer = null;
  sandbox.setTimeout = null;
  sandbox.setInterval = null;
  sandbox.setImmediate = null;
  sandbox.clearTimeout = null;
  sandbox.clearInterval = null;
  sandbox.clearImmediate = null;
  sandbox.fetch = null;
  sandbox.eval = null;
  sandbox.Function = null;
  sandbox.Proxy = null;

  sandbox.JSON = createFrozenObject(JSON);
  sandbox.Math = createFrozenObject(Math);
  sandbox.Date = createFrozenObject(Date);

  sandbox.parseInt = parseInt;
  sandbox.parseFloat = parseFloat;
  sandbox.isNaN = isNaN;
  sandbox.isFinite = isFinite;
  sandbox.encodeURIComponent = encodeURIComponent;
  sandbox.decodeURIComponent = decodeURIComponent;
  sandbox.encodeURI = encodeURI;
  sandbox.decodeURI = decodeURI;

  const context = vm.createContext(sandbox);
  return { sandbox, context };
}

/**
 * 执行 JavaScript 代码（优先使用 isolated-vm）
 * @param signal - 可选 AbortSignal。isolated-vm 执行本身受 cpuTimeout/timeout 约束，
 *                 当前无法在信号触发时中止同步的 isolate 执行；保留参数供未来接入，
 *                 并保证与 runJavaScript(code, signal) 的调用链一致。
 */
async function runJavaScriptSandbox(
  code: string,
  timeout: number = 10000,
  _signal?: AbortSignal,
): Promise<SandboxResult> {
  // _signal 目前仅用于保持调用链一致；isolated-vm 的同步执行无法在信号触发时中止，
  // 真正的超时由 timeout/cpuTimeout 兜底。此处显式 void，避免未使用告警。
  void _signal;

  if (!isSandboxEnabled()) {
    return runJavaScriptDirect(code);
  }

  const ivm = await getIvm();
  if (!ivm) {
    // 安全决策：isolated-vm 不可用时不再静默降级到 Node 原生 vm。
    // vm 模块并非安全沙箱（可通过原型链逃逸到宿主上下文），继续作为"沙箱"使用
    // 会给调用方造成虚假的安全感。此处直接拒绝执行。
    return {
      success: false,
      error: 'isolated-vm 不可用，已拒绝以不安全的 vm 模块执行代码',
    };
  }

  // runJavaScriptIsolated 内部已用 try/catch 包裹并返回结构化结果，
  // 此处不再兜底降级到 vm，避免把失败的重试导向不安全路径。
  return await runJavaScriptIsolated(code, timeout);
}

/**
 * 直接执行 JavaScript 代码（非沙箱模式）
 *
 * 安全说明：此路径仅为「显式关闭沙箱」的兼容用途，不是安全沙箱。
 * 实现上不再用 new Function 在宿主全局作用域执行（那样代码可直接访问
 * process/require 等 Node 全局），改为在独立的 vm context 内执行——
 * context 只注入白名单工具，process/require/module/Buffer 等全局不可直接访问，
 * 缩小了被恶意代码触达宿主环境的表面积。
 */
async function runJavaScriptDirect(code: string): Promise<SandboxResult> {
  console.warn('[安全警告] 非沙箱模式执行 JavaScript 代码，可能存在安全风险');

  return new Promise((resolve) => {
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`,
      });
    }, maxExecutionTime);

    const logSink: string[] = [];
    const safeGlobals: Record<string, unknown> = {
      console: {
        log: (...args: unknown[]) => logSink.push(args.map(fmtDirectValue).join(' ')),
        error: (...args: unknown[]) =>
          logSink.push('[ERROR] ' + args.map(fmtDirectValue).join(' ')),
        warn: (...args: unknown[]) => logSink.push('[WARN] ' + args.map(fmtDirectValue).join(' ')),
        info: (...args: unknown[]) => logSink.push('[INFO] ' + args.map(fmtDirectValue).join(' ')),
      },
      JSON: JSON,
      Math: Math,
      Date: Date,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Error: Error,
      Map: Map,
      Set: Set,
      Promise: Promise,
      parseInt: parseInt,
      parseFloat: parseFloat,
      isNaN: isNaN,
      isFinite: isFinite,
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent,
    };
    const context = vm.createContext(safeGlobals);

    // 代码在 vm context 内执行：其词法作用域不含宿主全局，process/require 等
    // 不可直接引用（ReferenceError）。结果与日志统一带回宿主。
    const wrapped = `
      'use strict';
      (function() {
        try {
          return { success: true, result: (function() { ${code} })() };
        } catch (e) {
          return { success: false, error: e && e.message ? e.message : String(e) };
        }
      })()
    `;

    try {
      const result = vm.runInContext(wrapped, context, { timeout: maxExecutionTime }) as {
        success?: boolean;
        result?: unknown;
        error?: string;
      };

      clearTimeout(timeoutId);

      let output: string;
      if (result && result.success) {
        if (result.result === undefined) {
          output = '执行完成，无返回值';
        } else if (typeof result.result === 'object') {
          output = JSON.stringify(result.result, null, 2);
        } else {
          output = String(result.result);
        }
      } else {
        output = '[执行错误]: ' + (result && result.error);
      }

      if (logSink.length > 0) {
        output =
          logSink.join('\n') + (output && output !== '执行完成，无返回值' ? '\n' + output : '');
      }

      if (output.length > maxOutputSize) {
        output = output.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: output,
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
}

function fmtDirectValue(a: unknown): string {
  if (a === undefined) return 'undefined';
  if (a === null) return 'null';
  if (typeof a === 'function') return '[Function]';
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a, null, 2);
    } catch {
      return '[Object]';
    }
  }
  return String(a);
}

/**
 * 执行 Python 代码（使用沙箱隔离的临时文件）
 * @param signal - 可选 AbortSignal，传给 execFile，中断时直接 kill 子进程。
 */
async function runPythonSandbox(code: string, signal?: AbortSignal): Promise<SandboxResult> {
  // eslint-disable-next-line no-async-promise-executor -- executor 内已用 try/catch 完整兜底，且需统一管理超时与 resolve 时机
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
      tmpPath = generateSecureTmpPath('py');
      // writeSecureTmpFile 在发生路径碰撞(EEXIST)时会回退到新路径并以 string 返回，
      // 必须据此更新 tmpPath，否则后续 execFile 仍指向旧路径，可能执行他人代码或空文件。
      const writeResult = await writeSecureTmpFile(tmpPath, code);
      if (typeof writeResult === 'string') {
        tmpPath = writeResult;
      }

      // 科学模式：允许使用已安装的 Python 科学库
      const cfg = loadConfig();
      const scientificMode = cfg.code?.scientificMode === true;

      const secureEnv: Record<string, string | undefined> = {
        HOME: process.env.HOME || process.env.USERPROFILE || '',
        TMPDIR: os.tmpdir(),
        TEMP: os.tmpdir(),
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHASHSEED: '0',
        PATH: process.env.PATH || '',
      };

      if (scientificMode) {
        // 科学模式：保留完整 PATH 和 PYTHONPATH，允许加载科学库
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

        // 限制 PATH 范围
        secureEnv.PATH =
          process.env.PATH?.split(path.delimiter).slice(0, 3).join(path.delimiter) || '';
      }

      const pythonExec = findPythonExecutable();

      execFile(
        pythonExec,
        [tmpPath],
        {
          timeout: maxExecutionTime,
          encoding: 'utf8',
          cwd: os.tmpdir(),
          env: secureEnv,
          maxBuffer: maxOutputSize * 2,
          signal,
        },
        async (error: Error | null, stdout: string, stderr: string) => {
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

          // Windows 下 Python 文本模式输出为 CRLF，统一归一化为 \n，避免前端换行识别异常
          stdout = stdout.replace(/\r\n/g, '\n');
          if (stderr) {
            stderr = stderr.replace(/\r\n/g, '\n');
          }

          let result = stdout || '执行完成，无输出';
          if (stderr) {
            result += '\n[警告]: ' + stderr;
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
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      await cleanupTmpFile(tmpPath);
      resolve({
        success: false,
        error: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
}

/**
 * 执行通用代码（根据语言选择执行方式）
 */
async function executeCodeSandbox(
  code: string,
  language: string = 'javascript',
  signal?: AbortSignal,
): Promise<SandboxResult> {
  const lang = language.toLowerCase();

  switch (lang) {
    case 'javascript':
    case 'js':
      return runJavaScriptSandbox(code, 10000, signal);
    case 'python':
    case 'py':
      return runPythonSandbox(code, signal);
    default:
      return {
        success: false,
        error: `不支持的语言: ${language}`,
      };
  }
}

export {
  isSandboxEnabled,
  runJavaScriptIsolated,
  runJavaScriptSandbox,
  runPythonSandbox,
  executeCodeSandbox,
  generateSecureTmpPath,
  writeSecureTmpFile,
  cleanupTmpFile,
  createJavaScriptSandbox,
};
export type { SandboxResult };
