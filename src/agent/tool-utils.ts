const TOOL_OUTPUT_LIMITS: Record<string, number> = {
  ls: 5000,
  gitLog: 10000,
  gitDiff: 10000,
  executeCode: 50000,
  executeFile: 50000,
  runJavaScript: 50000,
  runPython: 50000,
  read: 20000,
  readCSV: 15000,
  readJSON: 15000,
  executeSQL: 20000,
  query: 20000,
  searchMemory: 10000,
  search: 10000,
  getProcesses: 15000,
  monitorSystem: 15000,
  initBrowser: -1,
  clickElement: -1,
  fillField: -1,
  getPageContent: -1,
  takeScreenshot: -1,
  closeBrowser: -1,
  searchOnPage: -1,
  findElements: -1,
  viewChanges: -1,
  downloadFile: -1,
  default: 10000,
};

interface LsItem {
  name: string;
  type: 'dir' | 'file';
}

function formatLsResult(data: LsItem[]): string {
  const dirs = data.filter((i) => i.type === 'dir').map((i) => `  ${i.name}/`);
  const files = data.filter((i) => i.type === 'file').map((i) => `  ${i.name}`);
  let lines: string[] = [];
  if (dirs.length) lines.push('  [目录]');
  lines = lines.concat(dirs);
  if (files.length) lines.push('  [文件]');
  lines = lines.concat(files);
  return lines.join('\n');
}

/**
 * 按 TOOL_OUTPUT_LIMITS 强制截断工具输出。
 * limit < 0 表示该工具结果不截断（如浏览器类工具，结果另行处理）；
 * limit === 0 表示禁止任何输出；其余按字符数截断并附加截断提示。
 */
function truncateOutput(tool: string, output: string): string {
  const limit = TOOL_OUTPUT_LIMITS[tool] ?? TOOL_OUTPUT_LIMITS.default;
  if (limit < 0 || output.length <= limit) {
    return output;
  }
  if (limit === 0) {
    return `[输出已屏蔽：原始 ${output.length} 字符]`;
  }
  return `${output.slice(0, limit)}\n...[输出已截断：原始 ${output.length} 字符，显示前 ${limit} 字符]`;
}

function formatToolResult(tool: string, data: unknown): string {
  let result: string;

  if (data && typeof data === 'object' && 'data' in data) {
    data = (data as { data: unknown }).data;
  }

  if (tool === 'ls' && Array.isArray(data)) {
    result = formatLsResult(data);
  } else if (typeof data === 'object') {
    result = JSON.stringify(data, null, 2);
  } else {
    result = String(data);
  }

  return truncateOutput(tool, result);
}

function classifyToolError(error: Error & { code?: string }): string {
  if (error.code === 'EACCES' || error.code === 'EPERM') {
    return 'permission';
  }

  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return 'timeout';
  }

  if (
    error.code === 'ENOTFOUND' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ECONNRESET' ||
    error.code === 'EAI_AGAIN' ||
    error.code === 'ENETUNREACH' ||
    error.code === 'EHOSTUNREACH' ||
    // 词边界限定：'networkx'、'network_utils' 等离线错误消息（如 Python
    // ModuleNotFoundError: No module named 'networkx'）只是包含 network 子串，
    // 不是网络错误，不得误判为 network。
    /\bnetwork\b/i.test(error.message || '')
  ) {
    return 'network';
  }

  if (
    error.code === 'ENOENT' ||
    error.code === 'EACCES' ||
    error.code === 'EPERM' ||
    error.code === 'ENOTDIR'
  ) {
    return 'filesystem';
  }

  return 'unknown';
}

function formatToolError(
  error: Error & { code?: string; stack?: string },
  toolName: string,
): string {
  const errorType = classifyToolError(error);

  let message: string;
  let suggestion: string;

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

export { TOOL_OUTPUT_LIMITS, formatToolResult, formatLsResult, classifyToolError, formatToolError };
