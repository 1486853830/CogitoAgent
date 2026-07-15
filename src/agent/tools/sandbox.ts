/**
 * 代码执行沙箱模块
 * 使用 isolated-vm 提供强隔离的代码执行环境
 * 支持 JavaScript 和 Python 代码执行
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import vm from 'vm';
import { loadConfig } from '../../config.ts';

/**
 * 动态加载 isolated-vm（原生模块可能在 Electron 等环境中不可用）
 */
let _ivm: any = null;
let _ivmLoadAttempted = false;

async function getIvm(): Promise<any> {
  if (_ivm) return _ivm;
  if (_ivmLoadAttempted) return null;
  _ivmLoadAttempted = true;
  try {
    const mod = await import('isolated-vm');
    _ivm = mod.default || mod;
    return _ivm;
  } catch {
    console.warn('[sandbox] isolated-vm 不可用，将使用原生 vm 模块');
    return null;
  }
}

/**
 * 从配置读取代码执行限制（按需调用，与 code.js 保持一致）
 * 支持 .env 中 COGITO_CODE_TIMEOUT / COGITO_CODE_MAX_OUTPUT 配置
 */
function getCodeLimits(): any {
  const cfg = loadConfig();
  return {
    maxExecutionTime: cfg.code?.maxExecutionTime ?? 30000,
    maxOutputSize: cfg.code?.maxOutputSize ?? 100000
  };
}

const MAX_MEMORY_MB = 128;

/**
 * 检查是否启用沙箱模式
 */
function isSandboxEnabled(): boolean {
  if (process.env.COGITO_SANDBOX_MODE === 'false') {
    return false;
  }
  if (process.env.COGITO_SANDBOX_MODE === 'true') {
    return true;
  }
  return true;
}

/**
 * 在 isolated-vm 沙箱中执行 JavaScript 代码
 * 使用 ivm.Callback 安全包装，避免原型链逃逸风险
 */
async function runJavaScriptIsolated(code: string, timeout: number = 10000): Promise<any> {
  const ivm = await getIvm();
  if (!ivm) {
    throw new Error('isolated-vm 不可用，请降级到原生 vm');
  }

  const { maxExecutionTime, maxOutputSize } = getCodeLimits();

  let isolate: any = null;
  let consoleLogCallback: any = null;
  let consoleErrorCallback: any = null;
  let consoleWarnCallback: any = null;
  let consoleInfoCallback: any = null;

  try {
    isolate = new ivm.Isolate({
      memoryLimit: MAX_MEMORY_MB,
      inspector: false,
      cpuTimeout: Math.min(timeout, maxExecutionTime)
    });

    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set('global', jail.derefInto());

    let outputBuffer = '';

    const formatArg = (a: any) => {
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
    };

    consoleLogCallback = new ivm.Callback((...args: any[]) => {
      const line = args.map(formatArg).join(' ');
      outputBuffer += line + '\n';
      if (outputBuffer.length > maxOutputSize) {
        outputBuffer = outputBuffer.slice(0, maxOutputSize) + '\n[输出过长已截断]';
      }
    }, { arguments: { copy: true, maxDepth: 2 } });

    consoleErrorCallback = new ivm.Callback((...args: any[]) => {
      outputBuffer += '[Error] ' + args.map(formatArg).join(' ') + '\n';
    }, { arguments: { copy: true, maxDepth: 2 } });

    consoleWarnCallback = new ivm.Callback((...args: any[]) => {
      outputBuffer += '[Warn] ' + args.map(formatArg).join(' ') + '\n';
    }, { arguments: { copy: true, maxDepth: 2 } });

    consoleInfoCallback = new ivm.Callback((...args: any[]) => {
      outputBuffer += '[Info] ' + args.map(formatArg).join(' ') + '\n';
    }, { arguments: { copy: true, maxDepth: 2 } });

    await jail.set('console', new ivm.Reference({
      log: consoleLogCallback,
      error: consoleErrorCallback,
      warn: consoleWarnCallback,
      info: consoleInfoCallback
    }));

    await jail.set('JSON', context.evalSync('({})'));
    await jail.set('Math', context.evalSync('({})'));
    await jail.set('Date', context.evalSync('({})'));

    const jsonMethods = ['parse', 'stringify'];
    const mathMethods = ['abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2', 'cbrt', 'ceil', 'clz32', 'cos', 'cosh', 'exp', 'floor', 'fround', 'hypot', 'imul', 'log', 'log1p', 'log2', 'log10', 'max', 'min', 'pow', 'random', 'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc', 'E', 'PI', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2'];
    const dateMethods = ['now', 'parse', 'UTC'];

    for (const method of jsonMethods) {
      await jail.set(`JSON.${method}`, new ivm.Callback((...args: any[]) => (JSON as any)[method](...args), { arguments: { copy: true }, result: { copy: true } }));
    }

    for (const method of mathMethods) {
      if (typeof (Math as any)[method] === 'function') {
        await jail.set(`Math.${method}`, new ivm.Callback((...args: any[]) => (Math as any)[method](...args), { arguments: { copy: true }, result: { copy: true } }));
      } else {
        await jail.set(`Math.${method}`, (Math as any)[method]);
      }
    }

    for (const method of dateMethods) {
      await jail.set(`Date.${method}`, new ivm.Callback((...args: any[]) => (Date as any)[method](...args), { arguments: { copy: true }, result: { copy: true } }));
    }

    await jail.set('parseInt', new ivm.Callback((str: any, radix: any) => parseInt(str, radix), { arguments: { copy: true }, result: { copy: true } }));
    await jail.set('parseFloat', new ivm.Callback((str: any) => parseFloat(str), { arguments: { copy: true }, result: { copy: true } }));
    await jail.set('isNaN', new ivm.Callback((val: any) => isNaN(val), { arguments: { copy: true }, result: { copy: true } }));
    await jail.set('isFinite', new ivm.Callback((val: any) => isFinite(val), { arguments: { copy: true }, result: { copy: true } }));
    await jail.set('encodeURIComponent', new ivm.Callback((str: any) => encodeURIComponent(str), { arguments: { copy: true }, result: { copy: true } }));
    await jail.set('decodeURIComponent', new ivm.Callback((str: any) => decodeURIComponent(str), { arguments: { copy: true }, result: { copy: true } }));
    await jail.set('encodeURI', new ivm.Callback((str: any) => encodeURI(str), { arguments: { copy: true }, result: { copy: true } }));
    await jail.set('decodeURI', new ivm.Callback((str: any) => decodeURI(str), { arguments: { copy: true }, result: { copy: true } }));

    await jail.set('globalThis', null);
    await jail.set('process', null);
    await jail.set('require', null);
    await jail.set('module', null);
    await jail.set('exports', null);
    await jail.set('Buffer', null);
    await jail.set('setTimeout', null);
    await jail.set('setInterval', null);
    await jail.set('setImmediate', null);
    await jail.set('clearTimeout', null);
    await jail.set('clearInterval', null);
    await jail.set('clearImmediate', null);
    await jail.set('fetch', null);
    await jail.set('eval', null);
    await jail.set('Function', null);
    await jail.set('Proxy', null);

    const wrappedCode = `
      (function() {
        try {
          const result = (function() { ${code} })();
          return { success: true, result: result };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()
    `;

    const result = await context.eval(wrappedCode, {
      timeout: Math.min(timeout, maxExecutionTime),
      breakOnSigint: true
    });

    const resultObj = await result.copy();

    let output;
    if (resultObj.success) {
      if (resultObj.result === undefined) {
        output = outputBuffer || '执行完成，无返回值';
      } else if (typeof resultObj.result === 'object') {
        output = (outputBuffer || '') + JSON.stringify(resultObj.result, null, 2);
      } else {
        output = (outputBuffer || '') + String(resultObj.result);
      }
    } else {
      output = '[执行错误]: ' + resultObj.error;
    }

    if (output.length > maxOutputSize) {
      output = output.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
    }

    return {
      success: true,
      data: output
    };

  } catch (error: any) {
    return {
      success: false,
      error: `沙箱执行失败: ${error.message}`
    };
  } finally {
    if (consoleLogCallback) {
      try {
        consoleLogCallback.release();
      } catch {
      }
    }
    if (consoleErrorCallback) {
      try {
        consoleErrorCallback.release();
      } catch {
      }
    }
    if (consoleWarnCallback) {
      try {
        consoleWarnCallback.release();
      } catch {
      }
    }
    if (consoleInfoCallback) {
      try {
        consoleInfoCallback.release();
      } catch {
      }
    }
    if (isolate) {
      try {
        isolate.dispose();
      } catch {
      }
    }
  }
}

/**
 * 使用 Node.js 原生 vm 模块执行（降级方案）
 */

function createFrozenObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  const propNames = Object.getOwnPropertyNames(obj);
  const symbolProps = Object.getOwnPropertySymbols(obj);

  for (const name of propNames) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, name);
    if (descriptor && (descriptor.value !== undefined)) {
      if (typeof descriptor.value === 'object' && descriptor.value !== null) {
        createFrozenObject(descriptor.value);
      }
      Object.defineProperty(obj, name, { ...descriptor, writable: false });
    }
  }

  for (const sym of symbolProps) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, sym);
    if (descriptor && (descriptor.value !== undefined)) {
      if (typeof descriptor.value === 'object' && descriptor.value !== null) {
        createFrozenObject(descriptor.value);
      }
      Object.defineProperty(obj, sym, { ...descriptor, writable: false });
    }
  }

  return Object.freeze(obj);
}

function createJavaScriptSandbox(): any {
  const sandbox = Object.create(null);

  sandbox.console = Object.seal(Object.assign(Object.create(null), {
    log: () => {},
    error: () => {},
    warn: () => {},
    info: () => {}
  }));

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

async function runJavaScriptFallback(code: string, timeout: number = 10000): Promise<any> {
  return new Promise((resolve) => {
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: '执行超时（超过指定时间）'
      });
    }, Math.min(timeout, maxExecutionTime));

    try {
      const { context } = createJavaScriptSandbox();

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
        timeout: Math.min(timeout, maxExecutionTime),
        displayErrors: true
      });

      clearTimeout(timeoutId);

      let output;
      if (result.success) {
        if (result.result === undefined) {
          output = '执行完成，无返回值';
        } else if (typeof result.result === 'object') {
          output = JSON.stringify(result.result, null, 2);
        } else {
          output = String(result.result);
        }
      } else {
        output = '[执行错误]: ' + result.error;
      }

      if (output.length > maxOutputSize) {
        output = output.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: output
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `沙箱执行失败: ${error.message}`
      });
    }
  });
}

/**
 * 执行 JavaScript 代码（优先使用 isolated-vm）
 */
async function runJavaScriptSandbox(code: string, timeout: number = 10000): Promise<any> {
  if (!isSandboxEnabled()) {
    return runJavaScriptDirect(code);
  }

  try {
    return await runJavaScriptIsolated(code, timeout);
  } catch (error: any) {
    console.warn(`isolated-vm 执行失败，降级到原生 vm: ${error.message}`);
    return await runJavaScriptFallback(code, timeout);
  }
}

/**
 * 直接执行 JavaScript 代码（非沙箱模式）
 */
async function runJavaScriptDirect(code: string): Promise<any> {
  console.warn('[安全警告] 非沙箱模式执行 JavaScript 代码，可能存在安全风险');

  return new Promise((resolve) => {
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`
      });
    }, maxExecutionTime);

    try {
      const safeGlobals: any = {
        console: {
          log: (...args: any[]) => {
            const output = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ');
            console.log(output);
          },
          error: (...args: any[]) => {
            const output = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ');
            console.error(output);
          },
          warn: (...args: any[]) => {
            const output = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ');
            console.warn(output);
          },
          info: (...args: any[]) => {
            const output = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ');
            console.info(output);
          }
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
        decodeURIComponent: decodeURIComponent
      };

      const fn = new Function(
        'global',
        `
        'use strict';
        with (global) {
          return (function() {
            try {
              return { success: true, result: (function() { ${code} })() };
            } catch (e) {
              return { success: false, error: e.message };
            }
          })();
        }
        `
      );

      const result = fn(safeGlobals);

      clearTimeout(timeoutId);

      let output;
      if (result.success) {
        if (result.result === undefined) {
          output = '执行完成，无返回值';
        } else if (typeof result.result === 'object') {
          output = JSON.stringify(result.result, null, 2);
        } else {
          output = String(result.result);
        }
      } else {
        output = '[执行错误]: ' + result.error;
      }

      if (output.length > maxOutputSize) {
        output = output.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: output
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `执行失败: ${error.message}`
      });
    }
  });
}

/**
 * 生成安全的临时文件路径
 */
function generateSecureTmpPath(ext: string): string {
  const tmpDir = os.tmpdir();
  const randomName = `cogito_${crypto.randomUUID()}_${Date.now()}`;
  return path.join(tmpDir, `${randomName}.${ext}`);
}

/**
 * 安全写入临时文件
 */
async function writeSecureTmpFile(filePath: string, content: string): Promise<any> {
  try {
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

/**
 * 清理临时文件
 */
async function cleanupTmpFile(tmpPath: any): Promise<void> {
  if (tmpPath) {
    try {
      await fs.unlink(tmpPath);
    } catch {
    }
  }
}

/**
 * 执行 Python 代码（使用沙箱隔离的临时文件）
 */
async function runPythonSandbox(code: string): Promise<any> {
  return new Promise(async (resolve) => {
    let tmpPath: any = null;
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
      tmpPath = generateSecureTmpPath('py');
      await writeSecureTmpFile(tmpPath, code);

      const secureEnv: any = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONNOUSERSITE: '1',
        PYTHONHASHSEED: '0',
        PYTHONDONTWRITEBYTECODE: '1',
        PATH: process.env.PATH?.split(path.delimiter).slice(0, 3).join(path.delimiter) || '',
      };

      delete secureEnv.PYTHONPATH;
      delete secureEnv.PYTHONHOME;
      delete secureEnv.PYTHONSTARTUP;
      delete secureEnv.PYTHONRC;
      delete secureEnv.VIRTUAL_ENV;

      execFile('python', [tmpPath], {
        timeout: maxExecutionTime,
        encoding: 'utf8',
        cwd: os.tmpdir(),
        env: secureEnv,
        maxBuffer: maxOutputSize * 2,
      }, async (error: any, stdout: any, stderr: any) => {
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
        if (stderr) {
          result += '\n[警告]: ' + stderr;
        }

        if (result.length > maxOutputSize) {
          result = result.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
        }

        resolve({
          success: true,
          data: result
        });
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      await cleanupTmpFile(tmpPath);
      resolve({
        success: false,
        error: `执行失败: ${error.message}`
      });
    }
  });
}

/**
 * 执行通用代码（根据语言选择执行方式）
 */
async function executeCodeSandbox(code: string, language: string = 'javascript'): Promise<any> {
  const lang = language.toLowerCase();

  switch (lang) {
    case 'javascript':
    case 'js':
      return runJavaScriptSandbox(code);
    case 'python':
    case 'py':
      return runPythonSandbox(code);
    default:
      return {
        success: false,
        error: `不支持的语言: ${language}`
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
