/**
 * 日志模块
 * 支持分级输出：DEBUG、INFO、WARN、ERROR
 * 替换 console.log，提供统一的日志管理
 *
 * 文件 transport：通过环境变量启用
 *   - COGITO_LOG_FILE=/path/to/app.log  指定日志文件（启用文件落盘）
 *   - COGITO_LOG_MAX_BYTES=10485760     单文件最大字节数（默认 10MB）
 *   - COGITO_LOG_MAX_FILES=5            保留的轮转文件数量（默认 5）
 * 文件超过 maxBytes 时自动轮转：app.log -> app.log.1 -> app.log.2 ...
 */

import { appendFileSync, statSync, renameSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const LOG_LEVELS: Record<string, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const envLogLevel = process.env.LOG_LEVEL;
let currentLevel: number =
  process.env.DEBUG === 'true'
    ? LOG_LEVELS.DEBUG
    : envLogLevel
      ? LOG_LEVELS[envLogLevel.toUpperCase()] || LOG_LEVELS.INFO
      : LOG_LEVELS.INFO;

// 日志前缀
const PREFIX: Record<string, string> = {
  DEBUG: '[DEBUG]',
  INFO: '[INFO]',
  WARN: '[WARN]',
  ERROR: '[ERROR]',
  TOOL: '[工具]',
  AGENT: '[AGENT]',
  SYSTEM: '[SYSTEM]',
};

// ===== 文件 transport 配置 =====
const LOG_FILE = process.env.COGITO_LOG_FILE || '';
const LOG_MAX_BYTES = parseInt(process.env.COGITO_LOG_MAX_BYTES || '10485760', 10); // 10MB
const LOG_MAX_FILES = parseInt(process.env.COGITO_LOG_MAX_FILES || '5', 10);
const fileTransportEnabled = LOG_FILE.length > 0 && LOG_MAX_BYTES > 0 && LOG_MAX_FILES > 0;

/**
 * 轮转日志文件：当当前文件超过 maxBytes 时，依次重命名 .1 -> .2, .0 -> .1，并清空主文件。
 * 失败时静默处理，避免日志写入失败影响主流程。
 */
function rotateIfNeeded(): void {
  if (!LOG_FILE) return;
  try {
    if (!existsSync(LOG_FILE)) return;
    const stats = statSync(LOG_FILE);
    if (stats.size < LOG_MAX_BYTES) return;

    // 从最旧的开始重命名：app.log.(N-1) -> app.log.N（删除最旧的）
    for (let i = LOG_MAX_FILES - 1; i > 0; i--) {
      const src = `${LOG_FILE}.${i}`;
      const dst = `${LOG_FILE}.${i + 1}`;
      if (existsSync(src)) {
        if (i + 1 > LOG_MAX_FILES) {
          // 超出保留数量，覆盖即删除：直接重命名到 dst（若 dst 存在会被覆盖）
        }
        try {
          renameSync(src, dst);
        } catch {
          // 忽略单个文件轮转失败
        }
      }
    }
    // 主文件 -> app.log.1
    try {
      renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch {
      // 轮转失败：清空主文件避免无限增长
      try {
        writeFileSync(LOG_FILE, '', 'utf-8');
      } catch {
        // 清空失败也忽略
      }
    }
  } catch {
    // 轮转整体失败：忽略
  }
}

/**
 * 将日志追加写入文件。失败时静默处理。
 */
function writeToFile(message: string): void {
  if (!fileTransportEnabled) return;
  try {
    // 确保目录存在
    const dir = path.dirname(LOG_FILE);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    rotateIfNeeded();
    appendFileSync(LOG_FILE, message + '\n', 'utf-8');
  } catch {
    // 文件写入失败不影响 console 输出
  }
}

/**
 * 格式化日志消息
 */
function formatMessage(prefix: string, level: number, ...args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  return `[${timestamp}] ${prefix} ${message}`;
}

/**
 * 打印日志
 */
function log(level: number, prefix: string, ...args: unknown[]): void {
  if (level < currentLevel) {
    return;
  }

  const formattedMessage = formatMessage(prefix, level, ...args);

  // 同步写入文件（若启用）
  writeToFile(formattedMessage);

  switch (level) {
    case LOG_LEVELS.DEBUG:
      console.log(formattedMessage);
      break;
    case LOG_LEVELS.INFO:
      console.log(formattedMessage);
      break;
    case LOG_LEVELS.WARN:
      console.warn(formattedMessage);
      break;
    case LOG_LEVELS.ERROR:
      console.error(formattedMessage);
      break;
  }
}

// 日志输出函数
const debug = (...args: unknown[]): void => log(LOG_LEVELS.DEBUG, PREFIX.DEBUG, ...args);
const info = (...args: unknown[]): void => log(LOG_LEVELS.INFO, PREFIX.INFO, ...args);
const warn = (...args: unknown[]): void => log(LOG_LEVELS.WARN, PREFIX.WARN, ...args);
const error = (...args: unknown[]): void => log(LOG_LEVELS.ERROR, PREFIX.ERROR, ...args);

// 带模块前缀的日志函数
const agent = (...args: unknown[]): void => log(LOG_LEVELS.INFO, PREFIX.AGENT, ...args);
const system = (...args: unknown[]): void => log(LOG_LEVELS.INFO, PREFIX.SYSTEM, ...args);
const tool = (...args: unknown[]): void => log(LOG_LEVELS.INFO, PREFIX.TOOL, ...args);

// Agent 调试日志（仅 DEBUG 模式显示）
const agentDebug = (...args: unknown[]): void => log(LOG_LEVELS.DEBUG, PREFIX.AGENT, ...args);

// 工具调试日志（仅 DEBUG 模式显示）
const toolDebug = (...args: unknown[]): void => log(LOG_LEVELS.DEBUG, PREFIX.TOOL, ...args);

/**
 * 设置日志级别
 */
function setLevel(level: string | number): void {
  if (typeof level === 'string') {
    currentLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  } else {
    currentLevel = level;
  }
}

/**
 * 获取当前日志级别
 */
function getLevel(): string {
  return Object.keys(LOG_LEVELS).find((key) => LOG_LEVELS[key] === currentLevel) || 'INFO';
}

/**
 * 查询文件 transport 是否启用
 */
function isFileTransportEnabled(): boolean {
  return fileTransportEnabled;
}

export {
  debug,
  info,
  warn,
  error,
  agent,
  agentDebug,
  system,
  tool,
  toolDebug,
  setLevel,
  getLevel,
  isFileTransportEnabled,
  LOG_LEVELS,
};
