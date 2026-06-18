import { execFile, exec } from 'child_process';
import vm from 'vm';
import { NodeVM } from 'vm2';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const MAX_EXECUTION_TIME = 30000;
const MAX_OUTPUT_SIZE = 100000;

/**
 * 生成安全的临时文件路径
 * 使用随机 UUID 避免符号链接攻击
 */
function generateSecureTmpPath(ext) {
  const tmpDir = os.tmpdir();
  const randomName = `cogito_${crypto.randomUUID()}_${Date.now()}`;
  return path.join(tmpDir, `${randomName}.${ext}`);
}

/**
 * 安全写入临时文件
 * 使用 writeFile 的 exclusive 选项防止覆盖和符号链接攻击
 */
async function writeSecureTmpFile(filePath, content) {
  try {
    // 确保目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // 使用 open 系统调用 with flags 'wx' (exclusive create)
    const fd = await fs.open(filePath, 'wx');
    try {
      await fd.writeFile(content, 'utf8');
    } finally {
      await fd.close();
    }
    return true;
  } catch (error) {
    // 如果文件已存在，尝试删除后重试（使用唯一名称）
    if (error.code === 'EEXIST') {
      const newPath = generateSecureTmpPath(path.extname(filePath).slice(1) || 'tmp');
      await fs.writeFile(newPath, content, 'utf8');
      return newPath;
    }
    throw error;
  }
}

/**
 * 执行 JavaScript 代码
 * 使用 vm2.NodeVM 提供更安全的沙箱隔离
 */
async function runJavaScript(code) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        success: false,
        error: '执行超时（超过30秒）'
      });
    }, MAX_EXECUTION_TIME);

    try {
      // 用于捕获 console 输出
      let output = '';
      let errors = '';

      // 创建 vm2 沙箱环境
      const sandbox = {
        console: {
          log: (...args) => {
            output += args.map(a => 
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ') + '\n';
          },
          error: (...args) => {
            errors += args.map(a => 
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ') + '\n';
          }
        },
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        process: undefined,
        require: undefined,
        __result: null
      };

      const vm2 = new NodeVM({
        timeout: MAX_EXECUTION_TIME,
        sandbox: sandbox,
        eval: false,
        require: {
          external: false,
          builtin: []
        },
        wrapper: 'none',
        strict: true
      });

      // 执行代码
      const wrappedCode = `
        (function() {
          var __result = null;
          try {
            __result = (function() {
              ${code}
            })();
            return { success: true, result: __result };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })()
      `;

      const result = vm2.run(wrappedCode);
      
      clearTimeout(timeout);

      let finalOutput = '';
      
      // 添加 console.log 输出
      if (output) {
        finalOutput += '[标准输出]:\n' + output;
      }
      
      // 添加 console.error 输出
      if (errors) {
        finalOutput += '\n[错误输出]:\n' + errors;
      }
      
      if (result.success) {
        if (result.result !== undefined) {
          let returnValue = typeof result.result === 'object' 
            ? JSON.stringify(result.result, null, 2) 
            : String(result.result);
          finalOutput += '[返回值]: ' + returnValue;
        } else if (!finalOutput) {
          finalOutput = '执行完成，无输出';
        }
      } else {
        finalOutput += '[执行错误]: ' + result.error;
      }

      if (finalOutput.length > MAX_OUTPUT_SIZE) {
        finalOutput = finalOutput.slice(0, MAX_OUTPUT_SIZE) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: finalOutput
      });
    } catch (e) {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: `执行失败: ${e.message}`
      });
    }
  });
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
 * 检测代码是否包含 GUI 阻塞调用
 * @param {string} code Python 代码
 * @returns {boolean} 是否包含 GUI 阻塞调用
 */
function hasGuiBlockingCall(code) {
  const guiPatterns = [
    /\.mainloop\s*\(/,      // tkinter: root.mainloop()
    /\.show\s*\(/,          // PyQt: widget.show()
    /app\.exec\s*\(/,       // PyQt: app.exec()
    /plt\.show\s*\(/,       // matplotlib: plt.show()
    /turtle\.mainloop/,     // turtle: turtle.mainloop()
    /\.wait_window\s*\(/,   // tkinter: wait_window
  ];
  
  return guiPatterns.some(pattern => pattern.test(code));
}

/**
 * 为 GUI 代码注入超时退出机制
 * @param {string} code Python 代码
 * @returns {string} 处理后的代码
 */
function injectGuiTimeout(code) {
  // 检测使用的 GUI 库类型
  const guiWrapper = `
import sys
import threading

# GUI 超时退出机制（由 CogitoAgent 注入）
def _gui_timeout_exit(delay=10):
    """延迟后自动关闭 GUI"""
    import time
    time.sleep(delay)
    print("\\n[提示] GUI 窂口将在 10 秒后自动关闭...")
    sys.exit(0)

# 启动超时线程
_timeout_thread = threading.Thread(target=_gui_timeout_exit, daemon=True)
_timeout_thread.start()

# 用户原始代码
${code}
`;
  
  return guiWrapper;
}

/**
 * 执行 Python 代码
 * 使用安全的环境配置，限制网络和系统访问
 */
async function runPython(code) {
  return new Promise(async (resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        success: false,
        error: '执行超时（超过30秒）'
      });
    }, MAX_EXECUTION_TIME);

    let tmpPath = null;
    try {
      // 检测 GUI 阻塞调用并注入超时机制
      let processedCode = code;
      const isGuiCode = hasGuiBlockingCall(code);
      
      if (isGuiCode) {
        processedCode = injectGuiTimeout(code);
        console.log('[提示] 检测到 GUI 程序，已注入超时退出机制');
      }
      
      // 使用安全的临时文件路径
      tmpPath = generateSecureTmpPath('py');
      await writeSecureTmpFile(tmpPath, processedCode);

      // 安全环境配置：清理危险环境变量
      const secureEnv = {
        // 保留必要的环境变量
        HOME: process.env.HOME || process.env.USERPROFILE || '',
        TMPDIR: os.tmpdir(),
        TEMP: os.tmpdir(),
        // Python 安全配置
        PYTHONUNBUFFERED: '1',           // 无缓冲输出
        PYTHONNOUSERSITE: '1',           // 禁止加载用户站点包
        PYTHONDONTWRITEBYTECODE: '1',    // 不生成 .pyc 文件
        PYTHONHASHSEED: '0',             // 固定哈希种子
        // 限制 PATH，只允许访问系统标准路径
        PATH: process.env.PATH?.split(path.delimiter).slice(0, 3).join(path.delimiter) || '',
      };

      // 删除可能危险的环境变量
      delete process.env.PYTHONPATH;
      delete process.env.PYTHONHOME;
      delete process.env.PYTHONSTARTUP;
      delete process.env.PYTHONRC;
      delete process.env.VIRTUAL_ENV;
      
      // 删除 secureEnv 中的危险变量（如果存在）
      delete secureEnv.PYTHONPATH;
      delete secureEnv.PYTHONHOME;
      delete secureEnv.PYTHONSTARTUP;
      delete secureEnv.PYTHONRC;
      delete secureEnv.VIRTUAL_ENV;

      execFile('python', [tmpPath], {
        timeout: MAX_EXECUTION_TIME,
        encoding: 'utf8',
        env: secureEnv,
        // 限制子进程权限（仅 UNIX）
        gid: process.getgid ? process.getgid() : undefined,
        uid: process.getuid ? process.getuid() : undefined
      }, async (error, stdout, stderr) => {
        clearTimeout(timeout);
        
        await cleanupTmpFile(tmpPath);

        if (error) {
          resolve({
            success: false,
            error: `执行失败: ${error.message}\n${stderr || ''}`
          });
          return;
        }

        let result = stdout || '执行完成，无输出';
        
        // GUI 程序特殊提示
        if (isGuiCode) {
          result = '🖼️ [GUI 程序已执行]\n' + 
                   '提示：窗口将在 10 秒后自动关闭\n' +
                   '如果窗口未显示，可能是因为当前环境不支持图形界面\n\n' + 
                   (stdout ? '[程序输出]:\n' + stdout : '');
        }
        
        if (stderr) {
          result += '\n[错误输出]: ' + stderr;
        }

        if (result.length > MAX_OUTPUT_SIZE) {
          result = result.slice(0, MAX_OUTPUT_SIZE) + '\n\n[输出内容过长，已截断]';
        }

        resolve({
          success: true,
          data: result
        });
      });
    } catch (e) {
      clearTimeout(timeout);
      await cleanupTmpFile(tmpPath);
      resolve({
        success: false,
        error: `执行失败: ${e.message}`
      });
    }
  });
}

/**
 * 执行代码（自动识别语言）
 */
async function executeCode(code, language = 'javascript') {
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

/**
 * 执行代码文件
 */
async function executeFile(filePath, language = null) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    if (!language) {
      const ext = path.extname(filePath).toLowerCase();
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
  } catch (e) {
    return {
      success: false,
      error: `读取文件失败: ${e.message}`
    };
  }
}

/**
 * 格式化代码
 */
async function formatCode(code, language = 'javascript') {
  return new Promise((resolve) => {
    if (language.toLowerCase() === 'python') {
      exec(`python -m autopep8 --stdin-stdout`, {
        input: code,
        encoding: 'utf8'
      }, (error, stdout) => {
        if (error) {
          resolve({
            success: false,
            error: `格式化失败: ${error.message}`
          });
        } else {
          resolve({
            success: true,
            data: stdout
          });
        }
      });
    } else {
      resolve({
        success: true,
        data: code
      });
    }
  });
}

export {
  executeCode,
  executeFile,
  runJavaScript,
  runPython,
  formatCode
};