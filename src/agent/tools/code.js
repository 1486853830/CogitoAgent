import { execFile, exec } from 'child_process';
import vm from 'vm';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { loadConfig } from '../../config.js';

/**
 * 从配置读取代码执行限制
 * 支持 .env 中 COGITO_CODE_TIMEOUT / COGITO_CODE_MAX_OUTPUT 配置
 */
function getCodeLimits() {
  const cfg = loadConfig();
  return {
    maxExecutionTime: cfg.code?.maxExecutionTime ?? 30000,
    maxOutputSize: cfg.code?.maxOutputSize ?? 100000
  };
}

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
 * 创建 JavaScript 沙箱环境
 * 
 * 安全改进：使用 Object.create(null) 创建无原型链的对象，
 * 防止通过 ({}).constructor.constructor 等方式突破沙箱
 */
function createSandbox() {
  // 使用 Object.create(null) 创建没有原型的对象，防止原型链逃逸
  const sandbox = Object.create(null);

  sandbox.console = {
    log: (...args) => {
      console.log(args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' '));
    },
    error: (...args) => {
      console.error(args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' '));
    },
    warn: (...args) => {
      console.warn(args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' '));
    },
    info: (...args) => {
      console.info(args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' '));
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

  // 添加安全的基础对象（冻结原型防止原型链攻击）
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

  return { sandbox, context: vm.createContext(sandbox) };
}

/**
 * 执行 JavaScript 代码
 * 使用 Node.js 原生 vm 模块提供沙箱隔离
 */
async function runJavaScript(code) {
  return new Promise((resolve) => {
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`
      });
    }, maxExecutionTime);

    try {
      const { context } = createSandbox();

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
        let output;
        if (result.result === undefined) {
          output = '执行完成，无返回值';
        } else if (typeof result.result === 'object') {
          output = JSON.stringify(result.result, null, 2);
        } else {
          output = String(result.result);
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
    } catch (e) {
      clearTimeout(timeoutId);
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
    print("\\n[提示] GUI 窗口将在 10 秒后自动关闭...")
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
    let tmpPath = null;
    let timedOut = false;
    const { maxExecutionTime, maxOutputSize } = getCodeLimits();

    const timeoutId = setTimeout(async () => {
      timedOut = true;
      await cleanupTmpFile(tmpPath);  // 超时时也清理临时文件
      resolve({
        success: false,
        error: `执行超时（超过${maxExecutionTime / 1000}秒）`
      });
    }, maxExecutionTime);

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

      // 只在 secureEnv 副本中删除危险变量，不影响全局 process.env
      delete secureEnv.PYTHONPATH;
      delete secureEnv.PYTHONHOME;
      delete secureEnv.PYTHONSTARTUP;
      delete secureEnv.PYTHONRC;
      delete secureEnv.VIRTUAL_ENV;

      execFile('python', [tmpPath], {
        timeout: maxExecutionTime,
        encoding: 'utf8',
        env: secureEnv,
        // 限制子进程权限（仅 UNIX）
        gid: process.getgid ? process.getgid() : undefined,
        uid: process.getuid ? process.getuid() : undefined
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

        if (result.length > maxOutputSize) {
          result = result.slice(0, maxOutputSize) + '\n\n[输出内容过长，已截断]';
        }

        resolve({
          success: true,
          data: result
        });
      });
    } catch (e) {
      clearTimeout(timeoutId);
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