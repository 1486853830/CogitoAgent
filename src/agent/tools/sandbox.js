/**
 * 代码执行沙箱模块
 * 使用 VM2 提供安全的代码执行环境
 */

import { NodeVM } from 'vm2';
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
 */
function createJavaScriptSandbox(timeout = 10000) {
  return new NodeVM({
    timeout,
    sandbox: {},
    require: {
      external: true,
      builtin: ['fs', 'path', 'os', 'crypto', 'util'],
      root: './',
      mock: {}
    },
    wrapper: 'none',
    compiler: 'javascript'
  });
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
    try {
      const vm = createJavaScriptSandbox(timeout);
      const result = vm.run(code);
      
      let output;
      if (result === undefined) {
        output = '执行完成，无返回值';
      } else if (typeof result === 'object') {
        output = JSON.stringify(result, null, 2);
      } else {
        output = String(result);
      }

      if (output.length > MAX_OUTPUT_SIZE) {
        output = output.slice(0, MAX_OUTPUT_SIZE) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: output
      });
    } catch (error) {
      resolve({
        success: false,
        error: `沙箱执行失败: ${error.message}`
      });
    }
  });
}

/**
 * 直接执行 JavaScript 代码（非沙箱模式）
 */
async function runJavaScriptDirect(code) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: '执行超时（超过30秒）'
      });
    }, MAX_EXECUTION_TIME);

    try {
      // 使用 Function 构造器执行
      const fn = new Function(code);
      const result = fn();
      
      clearTimeout(timeoutId);
      
      let output;
      if (result === undefined) {
        output = '执行完成，无返回值';
      } else if (typeof result === 'object') {
        output = JSON.stringify(result, null, 2);
      } else {
        output = String(result);
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
 */
async function runPythonSandbox(code) {
  return new Promise(async (resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: '执行超时（超过30秒）'
      });
    }, MAX_EXECUTION_TIME);

    let tmpPath = null;
    try {
      tmpPath = generateSecureTmpPath('py');
      await writeSecureTmpFile(tmpPath, code);

      execFile('python', [tmpPath], {
        timeout: MAX_EXECUTION_TIME,
        encoding: 'utf8',
        cwd: os.tmpdir()  // 在临时目录执行，限制访问范围
      }, async (error, stdout, stderr) => {
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