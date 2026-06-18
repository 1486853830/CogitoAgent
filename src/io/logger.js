/**
 * 统一日志模块
 * 提供分级日志支持，替代项目中的 console.error
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

const prefixes = {
  DEBUG: '[调试]',
  INFO: '[信息]',
  WARN: '[警告]',
  ERROR: '[错误]'
};

/**
 * 格式化日志消息
 */
function formatMessage(level, module, message) {
  const timestamp = new Date().toISOString();
  return `${prefixes[level]} [${module}] ${message}`;
}

/**
 * 输出日志
 */
function log(level, module, message, ...args) {
  if (LOG_LEVELS[level] < currentLevel) {
    return;
  }

  const formatted = formatMessage(level, module, message);
  
  switch (level) {
    case 'DEBUG':
    case 'INFO':
      console.error(formatted, ...args);
      break;
    case 'WARN':
      console.warn(formatted, ...args);
      break;
    case 'ERROR':
      console.error(formatted, ...args);
      break;
  }
}

// 模块化日志函数
const logger = {
  // 通用模块
  config: (msg, ...args) => log('INFO', '配置', msg, ...args),
  configError: (msg, ...args) => log('ERROR', '配置', msg, ...args),
  
  // 历史模块
  history: (msg, ...args) => log('INFO', '历史', msg, ...args),
  historyError: (msg, ...args) => log('ERROR', '历史', msg, ...args),
  
  // 任务模块
  task: (msg, ...args) => log('INFO', '任务', msg, ...args),
  taskError: (msg, ...args) => log('ERROR', '任务', msg, ...args),
  
  // 记忆模块
  memory: (msg, ...args) => log('INFO', '记忆', msg, ...args),
  memoryError: (msg, ...args) => log('ERROR', '记忆', msg, ...args),
  
  // 定时任务模块
  scheduler: (msg, ...args) => log('INFO', '定时任务', msg, ...args),
  schedulerError: (msg, ...args) => log('ERROR', '定时任务', msg, ...args),
  
  // 数据库模块
  database: (msg, ...args) => log('INFO', '数据库', msg, ...args),
  databaseError: (msg, ...args) => log('ERROR', '数据库', msg, ...args),
  
  // 系统模块
  system: (msg, ...args) => log('INFO', '系统', msg, ...args),
  systemError: (msg, ...args) => log('ERROR', '系统', msg, ...args),

  // 通用日志
  debug: (module, msg, ...args) => log('DEBUG', module, msg, ...args),
  info: (module, msg, ...args) => log('INFO', module, msg, ...args),
  warn: (module, msg, ...args) => log('WARN', module, msg, ...args),
  error: (module, msg, ...args) => log('ERROR', module, msg, ...args),
};

/**
 * 统一错误处理类
 */
class AppError extends Error {
  constructor(message, code, module = 'APP') {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.module = module;
  }

  toString() {
    return `[${this.code}] [${this.module}] ${this.message}`;
  }
}

/**
 * 创建错误
 */
function createError(message, code, module) {
  return new AppError(message, code, module);
}

/**
 * 错误代码枚举
 */
const ErrorCodes = {
  // 配置错误 (1xxx)
  CONFIG_LOAD_FAILED: { code: 'E1001', message: '配置加载失败' },
  CONFIG_SAVE_FAILED: { code: 'E1002', message: '配置保存失败' },
  CONFIG_INVALID: { code: 'E1003', message: '配置无效' },
  
  // 文件错误 (2xxx)
  FILE_NOT_FOUND: { code: 'E2001', message: '文件不存在' },
  FILE_READ_FAILED: { code: 'E2002', message: '文件读取失败' },
  FILE_WRITE_FAILED: { code: 'E2003', message: '文件写入失败' },
  
  // 工具错误 (3xxx)
  TOOL_NOT_FOUND: { code: 'E3001', message: '工具不存在' },
  TOOL_EXEC_FAILED: { code: 'E3002', message: '工具执行失败' },
  
  // Git 错误 (4xxx)
  GIT_INVALID_ARGS: { code: 'E4001', message: 'Git 命令参数无效' },
  GIT_EXEC_FAILED: { code: 'E4002', message: 'Git 命令执行失败' },
};

export {
  logger,
  AppError,
  createError,
  ErrorCodes,
  LOG_LEVELS
};
