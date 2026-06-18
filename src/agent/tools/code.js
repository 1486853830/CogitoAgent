import { execFile, exec } from 'child_process';
import vm from 'vm';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const MAX_EXECUTION_TIME = 30000;
const MAX_OUTPUT_SIZE = 100000;

/**
 * 执行 JavaScript 代码
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
      let output = '';
      let errors = '';

      const context = {
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
        setTimeout: (fn, delay) => {
          if (delay > 5000) return;
          return setTimeout(fn, delay);
        },
        __result: null
      };

      const wrappedCode = `
        try {
          __result = (() => {
            ${code}
          })();
        } catch (e) {
          console.error(\`Error: \${e.message}\`);
        }
      `;

      const script = new vm.Script(wrappedCode, { timeout: MAX_EXECUTION_TIME });
      script.runInNewContext(context);

      clearTimeout(timeout);

      let result = output;
      if (context.__result !== null) {
        result += '\n[返回值]: ' + 
          (typeof context.__result === 'object' 
            ? JSON.stringify(context.__result, null, 2) 
            : String(context.__result));
      }

      if (errors) {
        result += '\n[错误输出]: ' + errors;
      }

      if (result.length > MAX_OUTPUT_SIZE) {
        result = result.slice(0, MAX_OUTPUT_SIZE) + '\n\n[输出内容过长，已截断]';
      }

      resolve({
        success: true,
        data: result || '执行完成，无输出'
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
 * 执行 Python 代码
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
      tmpPath = path.join(os.tmpdir(), `temp_${Date.now()}.py`);
      await fs.writeFile(tmpPath, code);

      execFile('python', [tmpPath], {
        timeout: MAX_EXECUTION_TIME,
        encoding: 'utf8'
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