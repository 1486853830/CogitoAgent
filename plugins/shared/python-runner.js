/**
 * 共享工具：Python 脚本执行与输出路径校验
 * 供 biopython-bio、rdkit-chem 等插件复用，避免重复实现
 *
 * 安全设计：
 * - 所有用户输入通过 stdin 传递 JSON，不使用字符串拼接，避免命令注入
 * - 使用异步 execFile（非 execFileSync），不阻塞事件循环
 * - 错误信息保留 stderr，便于排查
 * - Python 命令启动时探测一次并缓存（python3 / python / py）
 */

import path from 'path';
import { execFile } from 'child_process';

// 缓存的 Python 命令，首次调用时探测；null 表示尚未探测
let pythonCmd = null;
const PYTHON_CANDIDATES = ['python3', 'python', 'py'];

/**
 * 探测单个候选命令是否可用（能成功返回 --version 即可）
 * 注意：Python 2 把 --version 写到 stderr，Python 3 写到 stdout，两者都要接受
 */
function probe(cmd) {
  return new Promise((resolve) => {
    execFile(cmd, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        resolve(false);
        return;
      }
      const out = (stdout || '') + (stderr || '');
      resolve(out.length > 0);
    });
  });
}

/**
 * 探测可用的 Python 可执行文件并缓存结果
 * 遍历候选列表，返回第一个能成功执行 --version 的命令
 * 若全部失败，回退到 'python'（执行时若失败由调用方处理）
 */
async function detectPython() {
  if (pythonCmd !== null) return pythonCmd;
  for (const cmd of PYTHON_CANDIDATES) {
    if (await probe(cmd)) {
      pythonCmd = cmd;
      return pythonCmd;
    }
  }
  // 没找到任何候选，回退到 python（执行时若失败由调用方处理）
  pythonCmd = 'python';
  return pythonCmd;
}

/**
 * 异步执行 Python 脚本，通过 stdin 传递 JSON 参数
 * @param {string} script - Python 脚本（不含用户输入）
 * @param {object} inputData - 传递给脚本的 JSON 数据
 * @param {number} timeout - 超时毫秒
 * @returns {Promise<string>} - 脚本 stdout 输出
 */
export async function runPython(script, inputData, timeout = 30000) {
  const cmd = await detectPython();
  return new Promise((resolve, reject) => {
    let killed = false;
    const child = execFile(
      cmd,
      ['-c', script],
      {
        timeout,
        maxBuffer: 1024 * 1024 * 10,
        encoding: 'utf8',
        // 强制 UTF-8 模式：Windows 下 Python 默认使用 cp1252 输出，打印中文会抛
        // UnicodeEncodeError；同时保证换行/中文与 Node 侧的 utf8 解码一致。
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      },
      (error, stdout, stderr) => {
        if (error) {
          // 错误信息保留 stderr，便于排查（C5）
          const detail = stderr ? stderr.trim().replace(/\r\n/g, '\n') : error.message;
          reject(new Error(`Failed to run Python: ${detail}`));
        } else {
          // Windows 下 Python 文本模式输出为 CRLF，统一归一化为 \n
          resolve(stdout.replace(/\r\n/g, '\n'));
        }
      },
    );
    // 超时后先 SIGTERM，再强制 SIGKILL（taskkill /F），防止 C 扩展僵尸进程
    child.on('timeout', () => {
      if (killed) return;
      killed = true;
      setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            execFile('taskkill', ['/f', '/t', '/pid', String(child.pid)]);
          } else {
            execFile('kill', ['-9', String(child.pid)]);
          }
        } catch {
          // 进程可能已结束
        }
      }, 1000);
    });
    if (child.stdin) {
      // 避免 EPIPE 等流错误导致进程崩溃
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(inputData || {}));
    }
  });
}

/**
 * 校验输出路径：拒绝绝对路径和 .. 路径遍历，可选校验扩展名
 * @param {string} p - 输出路径
 * @param {string} [allowedExt] - 允许的扩展名（如 '.png'）
 */
export function validateOutputPath(p, allowedExt) {
  if (!p || typeof p !== 'string') throw new Error('输出路径不能为空');
  // 拒绝绝对路径和 .. 遍历
  if (path.isAbsolute(p) || p.includes('..')) {
    throw new Error('输出路径必须为相对路径且不能包含 ..');
  }
  if (allowedExt && !p.toLowerCase().endsWith(allowedExt.toLowerCase())) {
    throw new Error(`输出路径必须以 ${allowedExt} 结尾`);
  }
}

/**
 * 校验输入路径：与 validateOutputPath 策略一致，拒绝绝对路径和 .. 路径遍历。
 * 此前 bioConvert/bioPdbInfo/bioFastaStats/bioMsa 仅校验输出路径，输入路径未校验，
 * LLM 可构造 inputPath="/etc/passwd" 读取任意文件（Python 端 normpath 后直接读取）。
 * @param {string} p - 输入路径
 */
export function validateInputPath(p) {
  if (!p || typeof p !== 'string') throw new Error('输入路径不能为空');
  if (path.isAbsolute(p) || p.includes('..')) {
    throw new Error('输入路径必须为相对路径且不能包含 ..');
  }
}

/**
 * 检查 Python 是否可用（忽略缓存，真实探测所有候选）
 * @returns {Promise<boolean>}
 */
export async function checkPython() {
  for (const cmd of PYTHON_CANDIDATES) {
    if (await probe(cmd)) return true;
  }
  return false;
}
