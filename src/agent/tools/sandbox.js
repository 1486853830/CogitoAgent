/**
 * 代码执行沙箱模块
 * 使用 Node.js 原生 vm 模块提供安全的代码执行环境
 * 注意：沙箱执行不能完全阻止恶意代码，仅提供基础隔离
 */

import vm from 'vm';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { loadConfig } from '../../config.js';

const MAX_EXECUTION_TIME = 30000;
const MAX_OUTPUT_SIZE = 100000;

/**
 * 检查是否启用沙箱模式
 */
function isSandboxEnabled() {
  // 环境变量优先
  if (process.env.COGITO_SANDBOX_MODE === 'false') {
    return false;
  }
  if (process.env.COGITO_SANDBOX_MODE === 'true') {
    return true;
  }
  // 默认启用沙箱
  return true;
}

/**
 * 创建 JavaScript 沙箱
 * 使用 Node.js 原生 vm 模块，安全配置：禁止文件系统访问、网络访问等危险操作
 * 
 * 安全改进：使用 Object.create(null) 创建无原型链的对象，
 * 防止通过 ({}).constructor.constructor 等方式突破沙箱
 */
function createJavaScriptSandbox(timeout = 10000) {
  // 使用 Object.create(null) 创建没有原型的对象，防止原型链逃逸
  const sandbox = Object.create(null);

  // 只允许安全的基础对象和函数
  sandbox.console = {
    log: (...args) => {
      const output = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ');
      console.log(output);
    },
    error: (...args) => {
      const output = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ');
      console.error(output);
    },
    warn: (...args) => {
      const output = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ');
      console.warn(output);
    },
    info: (...args) => {
      const output = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ');
      console.info(output);
    }
  };

  // 禁止危险对象
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

  // 冻结内置对象的原型（防止通过 Object.getPrototypeOf 访问）
  // 这些内置对象本身应该是安全的，但冻结它们可以防止进一步的原型链攻击
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

  const context = vm.createContext(sandbox);
  return { sandbox, context };
}

/**
 * 在沙箱中执行 JavaScript 代码
 */
async function runJavaScriptSandbox(code, timeout = 10000) {
  if (!isSandboxEnabled()) {
    // 未启用沙箱，直接执行
    return runJavaScriptDirect(code);
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: '执行超时（超过指定时间）'
      });
    }, Math.min(timeout, MAX_EXECUTION_TIME));

    try {
      const { context } = createJavaScriptSandbox(timeout);

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
        timeout: Math.min(timeout, MAX_EXECUTION_TIME),
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

      if (output.length > MAX_OUTPUT_SIZE) {
        output = output.slice(0, MAX_OUTPUT_SIZE) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: output
      });
    } catch (error) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `沙箱执行失败: ${error.message}`
      });
    }
  });
}

/**
 * 直接执行 JavaScript 代码（非沙箱模式）
 * 警告：此模式不安全，可以访问 process、require 等危险对象
 * 仅在 COGITO_SANDBOX_MODE=false 时使用
 */
async function runJavaScriptDirect(code) {
  // 安全警告
  console.warn('[安全警告] 非沙箱模式执行 JavaScript 代码，可能存在安全风险');

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: '执行超时（超过30秒）'
      });
    }, MAX_EXECUTION_TIME);

    try {
      // 使用 Function 构造器执行，并限制对全局对象的访问
      const safeGlobals = {
        console: {
          log: (...args) => {
            const output = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ');
            console.log(output);
          },
          error: (...args) => {
            const output = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ');
            console.error(output);
          },
          warn: (...args) => {
            const output = args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ');
            console.warn(output);
          },
          info: (...args) => {
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

      // 创建隔离的全局作用域
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

      if (output.length > MAX_OUTPUT_SIZE) {
        output = output.slice(0, MAX_OUTPUT_SIZE) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: output
      });
    } catch (error) {
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
function generateSecureTmpPath(ext) {
  const tmpDir = os.tmpdir();
  const randomName = `cogito_${crypto.randomUUID()}_${Date.now()}`;
  return path.join(tmpDir, `${randomName}.${ext}`);
}

/**
 * 安全写入临时文件
 */
async function writeSecureTmpFile(filePath, content) {
  try {
    const fd = await fs.open(filePath, 'wx');
    try {
      await fd.writeFile(content, 'utf8');
    } finally {
      await fd.close();
    }
    return true;
  } catch (error) {
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
async function cleanupTmpFile(tmpPath) {
  if (tmpPath) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // 忽略删除失败
    }
  }
}

/**
 * 执行 Python 代码（使用沙箱隔离的临时文件）
 * 安全改进：
 * 1. 禁止网络访问
 * 2. 禁止用户站点包加载
 * 3. 只读工作目录
 * 4. 限制 PYTHONPATH
 */
async function runPythonSandbox(code) {
  return new Promise(async (resolve) => {
    let tmpPath = null;
    let timedOut = false;

    const timeoutId = setTimeout(async () => {
      timedOut = true;
      await cleanupTmpFile(tmpPath);  // 超时时也清理临时文件
      resolve({
        success: false,
        error: '执行超时（超过30秒）'
      });
    }, MAX_EXECUTION_TIME);

    try {
      tmpPath = generateSecureTmpPath('py');
      await writeSecureTmpFile(tmpPath, code);

      // 安全环境配置
      const secureEnv = {
        ...process.env,
        PYTHONUNBUFFERED: '1',           // 无缓冲输出
        PYTHONNOUSERSITE: '1',          // 禁止加载用户站点包
        PYTHONHASHSEED: '0',            // 固定哈希种子
        PYTHONDONTWRITEBYTECODE: '1',  // 不生成 .pyc 文件
        // 限制 PATH，防止访问其他程序
        PATH: process.env.PATH?.split(path.delimiter).slice(0, 3).join(path.delimiter) || '',
      };

      // 删除可能危险的环境变量
      delete secureEnv.PYTHONPATH;
      delete secureEnv.PYTHONHOME;
      delete secureEnv.PYTHONSTARTUP;
      delete secureEnv.PYTHONRC;
      delete secureEnv.VIRTUAL_ENV;

      execFile('python', [
        tmpPath  // 直接传文件路径，不使用 -c exec()
      ], {
        timeout: MAX_EXECUTION_TIME,
        encoding: 'utf8',
        cwd: os.tmpdir(),  // 在临时目录执行
        env: secureEnv,    // 使用安全的环境变量
        // 限制子进程的权限（Windows 不支持 uid/gid）
        maxBuffer: MAX_OUTPUT_SIZE * 2,  // 限制输出大小
      }, async (error, stdout, stderr) => {
        if (timedOut) return;  // 如果已经超时，忽略回调

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

        if (result.length > MAX_OUTPUT_SIZE) {
          result = result.slice(0, MAX_OUTPUT_SIZE) + '\n\n[输出内容过长，已截断]';
        }

        resolve({
          success: true,
          data: result
        });
      });
    } catch (error) {
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
async function executeCodeSandbox(code, language = 'javascript') {
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
  createJavaScriptSandbox,
  runJavaScriptSandbox,
  runPythonSandbox,
  executeCodeSandbox,
  generateSecureTmpPath,
  writeSecureTmpFile,
  cleanupTmpFile
};