/**
 * 工具输出格式化与错误分类模块
 * 提供：输出截断、格式化、错误类型识别
 */

// 工具输出最大长度限制（根据工具类型智能截断）
const TOOL_OUTPUT_LIMITS = {
  // 目录列表较短
  ls: 5000,

  // Git 日志中等
  gitLog: 10000,
  gitDiff: 10000,

  // 代码执行结果较长
  executeCode: 50000,
  executeFile: 50000,
  runJavaScript: 50000,
  runPython: 50000,

  // 文件内容中等
  read: 20000,
  readCSV: 15000,
  readJSON: 15000,

  // 数据库查询结果
  executeSQL: 20000,
  query: 20000,

  // 搜索结果
  searchMemory: 10000,
  search: 10000,

  // 系统信息中等
  getProcesses: 15000,
  monitorSystem: 15000,

  // 其他默认限制
  default: 10000
};

/**
 * 格式化 ls 工具的目录列表结果
 */
function formatLsResult(data) {
  const dirs = data.filter(i => i.type === 'dir').map(i => `  ${i.name}/`);
  const files = data.filter(i => i.type === 'file').map(i => `  ${i.name}`);
  let lines = [];
  if (dirs.length) lines.push('  [目录]');
  lines = lines.concat(dirs.slice(0, 20));
  if (dirs.length > 20) lines.push(`  ... 还有 ${dirs.length - 20} 个目录`);
  if (files.length) lines.push('  [文件]');
  lines = lines.concat(files.slice(0, 20));
  if (files.length > 20) lines.push(`  ... 还有 ${files.length - 20} 个文件`);
  return lines.join('\n');
}

/**
 * 格式化工具结果为字符串，按工具类型截断
 */
function formatToolResult(tool, data) {
  let result;

  // 处理嵌套的 { success, data } 结构
  if (data && typeof data === 'object' && 'data' in data) {
    data = data.data;
  }

  if (tool === 'ls' && Array.isArray(data)) {
    result = formatLsResult(data);
  } else if (typeof data === 'object') {
    result = JSON.stringify(data, null, 2);
  } else {
    result = String(data);
  }

  const limit = TOOL_OUTPUT_LIMITS[tool] || TOOL_OUTPUT_LIMITS.default;

  if (result.length > limit) {
    return result.slice(0, limit) + '\n\n... [输出内容过长，已截断]';
  }

  return result;
}

/**
 * 工具错误类型识别
 */
function classifyToolError(error) {
  // 网络错误
  if (error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('network')) {
    return 'network';
  }

  // 文件系统错误
  if (error.code === 'ENOENT' ||
      error.code === 'EACCES' ||
      error.code === 'EPERM' ||
      error.code === 'ENOTDIR') {
    return 'filesystem';
  }

  // 权限错误
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return 'permission';
  }

  // 超时错误
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return 'timeout';
  }

  return 'unknown';
}

/**
 * 格式化工具错误信息（含建议）
 */
function formatToolError(error, toolName) {
  const errorType = classifyToolError(error);

  let message = '';
  let suggestion = '';

  switch (errorType) {
    case 'network':
      message = `[${toolName}] 网络错误: ${error.message}`;
      suggestion = '请检查网络连接后重试';
      break;
    case 'filesystem':
      message = `[${toolName}] 文件系统错误: ${error.message}`;
      suggestion = '请检查文件路径是否正确';
      break;
    case 'permission':
      message = `[${toolName}] 权限错误: ${error.message}`;
      suggestion = '请检查权限设置';
      break;
    case 'timeout':
      message = `[${toolName}] 执行超时: ${error.message}`;
      suggestion = '操作耗时过长，请稍后重试';
      break;
    default:
      message = `[${toolName}] 执行失败: ${error.message}`;
      suggestion = '请稍后重试';
  }

  let fullMessage = `${message}\n提示: ${suggestion}`;

  if (process.env.DEBUG === 'true' && error.stack) {
    const stackLines = error.stack.split('\n').slice(1, 4).join('\n');
    fullMessage += '\n堆栈跟踪:\n' + stackLines;
  }

  return fullMessage;
}

export {
  TOOL_OUTPUT_LIMITS,
  formatToolResult,
  formatLsResult,
  classifyToolError,
  formatToolError
};
