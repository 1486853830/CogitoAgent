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
    maxOutputSize: cfg.code?.maxOutputSize ?? 100000,
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
async function runJavaScriptIsolated(code: string, timeout: number = 10000): Promise<any> {
  const ivm = await getIvm();
  if (!ivm) {
    throw new Error('isolated-vm 不可用，请降级到原生 vm');
  }

  const { maxExecutionTime, maxOutputSize } = getCodeLimits();

  let isolate: any = null;

  try {
    isolate = new ivm.Isolate({
      memoryLimit: MAX_MEMORY_MB,
      inspector: false,
      cpuTimeout: Math.min(timeout, maxExecutionTime),
    });

    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set('global', jail.derefInto());

    // isolate 自带标准 V8 全局（JSON/Math/Date/parseInt/encodeURIComponent 等），
    // 已作用于该 isolate 的独立堆，无需也无法"逃逸"到宿主。process/require/module
    // 等 Node 全局本就不存在。isolated-vm 的堆隔离才是安全边界，而非属性屏蔽。

    // console 在 isolate 内部实现：收集日志到数组，随结果一起返回。
    // 结果通过 JSON 字符串中转回宿主。
    const wrappedCode = `
      (function() {
        var __logs = [];
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
        console = {
          log: function() { __logs.push(__join(arguments)); },
          info: function() { __logs.push('[INFO] ' + __join(arguments)); },
          warn: function() { __logs.push('[WARN] ' + __join(arguments)); },
          error: function() { __logs.push('[ERROR] ' + __join(arguments)); }
        };
        try {
          var result = (function() { ${code} })();
          return JSON.stringify({ success: true, result: result, logs: __logs });
        } catch (e) {
          return JSON.stringify({ success: false, error: e && e.message ? e.message : String(e), logs: __logs });
        }
      })()
    `;

    const resultStr = await context.eval(wrappedCode, {
      timeout: Math.min(timeout, maxExecutionTime),
      breakOnSigint: true,
    });

    let resultObj: any;
    try {
      resultObj = JSON.parse(resultStr);
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
  } catch (error: any) {
    return {
      success: false,
      error: `沙箱执行失败: ${error.message}`,
    };
  } finally {
    if (isolate) {
      try {
        isolate.dispose();
      } catch {}
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

function createJavaScriptSandbox(): any {
  const sandbox = Object.create(null);

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

async function runJavaScriptFallback(code: string, timeout: number = 10000): Promise<any> {
  return new Promise((resolve) => {
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();
    const timeoutId = setTimeout(
      () => {
        resolve({
          success: false,
          error: '执行超时（超过指定时间）',
        });
      },
      Math.min(timeout, maxExecutionTime),
    );

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
        displayErrors: true,
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
        data: output,
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `沙箱执行失败: ${error.message}`,
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
 */
async function runJavaScriptDirect(code: string): Promise<any> {
  console.warn('[安全警告] 非沙箱模式执行 JavaScript 代码，可能存在安全风险');

  return new Promise((resolve) => {
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`,
      });
    }, maxExecutionTime);

    try {
      const safeGlobals: any = {
        console: {
          log: (...args: any[]) => {
            const output = args
              .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
              .join(' ');
            console.log(output);
          },
          error: (...args: any[]) => {
            const output = args
              .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
              .join(' ');
            console.error(output);
          },
          warn: (...args: any[]) => {
            const output = args
              .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
              .join(' ');
            console.warn(output);
          },
          info: (...args: any[]) => {
            const output = args
              .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
              .join(' ');
            console.info(output);
          },
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
        `,
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
        data: output,
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `执行失败: ${error.message}`,
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
    } catch {}
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
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`,
      });
    }, maxExecutionTime);

    try {
      tmpPath = generateSecureTmpPath('py');
      await writeSecureTmpFile(tmpPath, code);

      // 科学模式：允许使用已安装的 Python 科学库
      const cfg = loadConfig();
      const scientificMode = cfg.code?.scientificMode === true;

      const secureEnv: any = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONHASHSEED: '0',
        PYTHONDONTWRITEBYTECODE: '1',
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

      execFile(
        'python',
        [tmpPath],
        {
          timeout: maxExecutionTime,
          encoding: 'utf8',
          cwd: os.tmpdir(),
          env: secureEnv,
          maxBuffer: maxOutputSize * 2,
        },
        async (error: any, stdout: any, stderr: any) => {
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
    } catch (error: any) {
      clearTimeout(timeoutId);
      await cleanupTmpFile(tmpPath);
      resolve({
        success: false,
        error: `执行失败: ${error.message}`,
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
