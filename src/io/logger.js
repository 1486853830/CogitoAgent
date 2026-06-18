/**
 * 日志模块
 * 支持分级输出：DEBUG、INFO、WARN、ERROR
 * 替换 console.log，提供统一的日志管理
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLevel = process.env.DEBUG === 'true' 
  ? LOG_LEVELS.DEBUG 
  : process.env.LOG_LEVEL 
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
    : LOG_LEVELS.INFO;

// 日志前缀
const PREFIX = {
  DEBUG: '[DEBUG]',
  INFO: '[INFO]',
  WARN: '[WARN]',
  ERROR: '[ERROR]',
  TOOL: '[TOOL]',
  AGENT: '[AGENT]',
  SYSTEM: '[SYSTEM]'
};

/**
 * 格式化日志消息
 */
function formatMessage(prefix, level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  return `${prefix} ${message}`;
}

/**
 * 打印日志
 */
function log(level, prefix, ...args) {
  if (level < currentLevel) {
    return;
  }
  
  const formattedMessage = formatMessage(prefix, level, ...args);
  
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
const debug = (...args) => log(LOG_LEVELS.DEBUG, PREFIX.DEBUG, ...args);
const info = (...args) => log(LOG_LEVELS.INFO, PREFIX.INFO, ...args);
const warn = (...args) => log(LOG_LEVELS.WARN, PREFIX.WARN, ...args);
const error = (...args) => log(LOG_LEVELS.ERROR, PREFIX.ERROR, ...args);

// 带模块前缀的日志函数
const agent = (...args) => log(LOG_LEVELS.INFO, PREFIX.AGENT, ...args);
const system = (...args) => log(LOG_LEVELS.INFO, PREFIX.SYSTEM, ...args);
const tool = (...args) => log(LOG_LEVELS.INFO, PREFIX.TOOL, ...args);

// Agent 调试日志（仅 DEBUG 模式显示）
const agentDebug = (...args) => log(LOG_LEVELS.DEBUG, PREFIX.AGENT, ...args);

// 工具调试日志（仅 DEBUG 模式显示）
const toolDebug = (...args) => log(LOG_LEVELS.DEBUG, PREFIX.TOOL, ...args);

/**
 * 设置日志级别
 */
function setLevel(level) {
  if (typeof level === 'string') {
    currentLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  } else {
    currentLevel = level;
  }
}

/**
 * 获取当前日志级别
 */
function getLevel() {
  return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLevel) || 'INFO';
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
  LOG_LEVELS
};
