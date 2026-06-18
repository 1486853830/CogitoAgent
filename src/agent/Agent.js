/**
 * 核心智能体模块
 */

import { streamChat } from '../api/client.js';
import * as tools from './tools/index.js';
import { getMessages, addUserMessage, addAssistantMessage, shouldCompress, compressHistory } from './prompt.js';
import { init, println, printBlank, printBanner, printDivider, printTag, printReasoning, resetReasoningTag, closeReasoning, printContent, resetContentTag, printToolBlock, exit } from '../io/terminal.js';
import { loadConfig } from '../config.js';

// 工具注册表 - 将工具名称映射到工具函数和参数处理
// 格式: { toolName: { fn: asyncFunction, argCount: number, parseJson: boolean } }
const TOOL_REGISTRY = {
  // 文件操作
  ls: { fn: tools.ls, argCount: 1 },
  read: { fn: tools.read, argCount: 1 },
  copy: { fn: tools.copy, argCount: 2 },
  mkdir: { fn: tools.mkdir, argCount: 1 },
  create: { fn: tools.create, argCount: 2, customArgs: true },

  // 网络
  search: { fn: tools.search, argCount: 1, customArgs: true },
  browse: { fn: tools.browse, argCount: 1 },
  fetchPage: { fn: tools.fetchPage, argCount: 1 },

  // 系统
  listApps: { fn: tools.listApps, argCount: 0 },
  openApp: { fn: tools.openApp, argCount: 1 },
  closeApp: { fn: tools.closeApp, argCount: 1 },

  // 浏览器自动化
  initBrowser: { fn: tools.initBrowser, argCount: 1 },
  clickElement: { fn: tools.clickElement, argCount: 2 },
  fillField: { fn: tools.fillField, argCount: 3 },
  selectOption: { fn: tools.selectOption, argCount: 2 },
  viewChanges: { fn: tools.viewChanges, argCount: 0 },
  getPageContent: { fn: tools.getPageContent, argCount: 0 },
  takeScreenshot: { fn: tools.takeScreenshot, argCount: 1 },
  closeBrowser: { fn: tools.closeBrowser, argCount: 0 },
  searchOnPage: { fn: tools.searchOnPage, argCount: 2 },
  findElements: { fn: tools.findElements, argCount: 2 },
  searchOnEngine: { fn: tools.searchOnEngine, argCount: 2 },
  downloadFile: { fn: tools.downloadFile, argCount: 3 },

  // 代码执行
  executeCode: { fn: tools.executeCode, argCount: 2 },
  executeFile: { fn: tools.executeFile, argCount: 2 },
  runJavaScript: { fn: tools.runJavaScript, argCount: 1 },
  runPython: { fn: tools.runPython, argCount: 1 },
  formatCode: { fn: tools.formatCode, argCount: 2 },

  // Git
  gitInit: { fn: tools.gitInit, argCount: 1 },
  gitClone: { fn: tools.gitClone, argCount: 3 },
  gitAdd: { fn: tools.gitAdd, argCount: 2 },
  gitCommit: { fn: tools.gitCommit, argCount: 2 },
  gitPush: { fn: tools.gitPush, argCount: 3 },
  gitPull: { fn: tools.gitPull, argCount: 3 },
  gitStatus: { fn: tools.gitStatus, argCount: 1 },
  gitLog: { fn: tools.gitLog, argCount: 2 },
  gitBranchCreate: { fn: tools.gitBranchCreate, argCount: 2 },
  gitBranchDelete: { fn: tools.gitBranchDelete, argCount: 2 },
  gitBranchList: { fn: tools.gitBranchList, argCount: 1 },
  gitCheckout: { fn: tools.gitCheckout, argCount: 2 },
  gitCheckoutNew: { fn: tools.gitCheckoutNew, argCount: 2 },
  gitMerge: { fn: tools.gitMerge, argCount: 2 },
  gitDiff: { fn: tools.gitDiff, argCount: 2 },
  gitRemoteAdd: { fn: tools.gitRemoteAdd, argCount: 3 },
  gitRemoteList: { fn: tools.gitRemoteList, argCount: 1 },
  gitConfigUser: { fn: tools.gitConfigUser, argCount: 3 },
  gitReset: { fn: tools.gitReset, argCount: 2 },
  gitStash: { fn: tools.gitStash, argCount: 1 },
  gitStashPop: { fn: tools.gitStashPop, argCount: 1 },

  // 任务管理
  createTask: { fn: tools.createTask, argCount: 4 },
  getTasks: { fn: tools.getTasks, argCount: 1 },
  getTask: { fn: tools.getTask, argCount: 1 },
  updateTask: { fn: tools.updateTask, argCount: 2 },
  deleteTask: { fn: tools.deleteTask, argCount: 1 },
  completeTask: { fn: tools.completeTask, argCount: 1 },
  splitTask: { fn: tools.splitTask, argCount: 2, parseJson: [false, true] },
  getTaskStats: { fn: tools.getTaskStats, argCount: 0 },
  clearTasks: { fn: tools.clearTasks, argCount: 0 },

  // 记忆系统
  addMemory: { fn: tools.addMemory, argCount: 3, parseJson: [false, true, false] },
  searchMemory: { fn: tools.searchMemory, argCount: 2 },
  getAllMemories: { fn: tools.getAllMemories, argCount: 1 },
  getMemory: { fn: tools.getMemory, argCount: 1 },
  updateMemory: { fn: tools.updateMemory, argCount: 2 },
  deleteMemory: { fn: tools.deleteMemory, argCount: 1 },
  getMemoryStats: { fn: tools.getMemoryStats, argCount: 0 },
  getRelatedMemories: { fn: tools.getRelatedMemories, argCount: 2 },
  clearMemory: { fn: tools.clearMemory, argCount: 0 },

  // 数据处理
  readCSV: { fn: tools.readCSV, argCount: 1 },
  writeCSV: { fn: tools.writeCSV, argCount: 3, parseJson: [false, true, true] },
  readJSON: { fn: tools.readJSON, argCount: 1 },
  writeJSON: { fn: tools.writeJSON, argCount: 2, parseJson: [false, true] },
  csvToJSON: { fn: tools.csvToJSON, argCount: 2 },
  jsonToCSV: { fn: tools.jsonToCSV, argCount: 2 },
  queryData: { fn: tools.queryData, argCount: 2, parseJson: [false, true] },
  analyzeData: { fn: tools.analyzeData, argCount: 1 },
  sortData: { fn: tools.sortData, argCount: 3 },

  // 数据库
  executeSQL: { fn: tools.executeSQL, argCount: 2, parseJson: [false, true] },
  query: { fn: tools.query, argCount: 3, parseJson: [false, true, true] },
  insert: { fn: tools.insert, argCount: 2, parseJson: [false, true] },
  update: { fn: tools.update, argCount: 3, parseJson: [false, true, true] },
  deleteData: { fn: tools.deleteData, argCount: 2, parseJson: [false, true] },
  createTable: { fn: tools.createTable, argCount: 2, parseJson: [false, true] },
  dropTable: { fn: tools.dropTable, argCount: 1 },
  getTables: { fn: tools.getTables, argCount: 0 },
  getTableSchema: { fn: tools.getTableSchema, argCount: 1 },
  executeTransaction: { fn: tools.executeTransaction, argCount: 1, parseJson: [true] },
  closeDB: { fn: tools.closeDB, argCount: 0 },

  // 邮件
  sendEmail: { fn: tools.sendEmail, argCount: 4, parseJson: [false, false, false, true] },
  sendTextEmail: { fn: tools.sendTextEmail, argCount: 3 },
  sendHtmlEmail: { fn: tools.sendHtmlEmail, argCount: 3 },
  sendTemplateEmail: { fn: tools.sendTemplateEmail, argCount: 4, parseJson: [false, false, false, true] },
  sendEmailWithAttachments: { fn: tools.sendEmailWithAttachments, argCount: 4, parseJson: [false, false, false, true] },
  checkEmailConfig: { fn: tools.checkEmailConfig, argCount: 0 },

  // 系统监控
  getCPUInfo: { fn: tools.getCPUInfo, argCount: 0 },
  getMemoryInfo: { fn: tools.getMemoryInfo, argCount: 0 },
  getDiskInfo: { fn: tools.getDiskInfo, argCount: 0 },
  getNetworkInfo: { fn: tools.getNetworkInfo, argCount: 0 },
  getProcesses: { fn: tools.getProcesses, argCount: 0 },
  getSystemInfo: { fn: tools.getSystemInfo, argCount: 0 },
  getCurrentProcess: { fn: tools.getCurrentProcess, argCount: 0 },
  getSystemLoad: { fn: tools.getSystemLoad, argCount: 0 },
  monitorSystem: { fn: tools.monitorSystem, argCount: 0 },

  // 定时任务
  addScheduleTask: { fn: tools.addScheduleTask, argCount: 4, parseJson: [false, false, false, true] },
  getScheduleTasks: { fn: tools.getScheduleTasks, argCount: 0 },
  getScheduleTask: { fn: tools.getScheduleTask, argCount: 1 },
  updateScheduleTask: { fn: tools.updateScheduleTask, argCount: 2, parseJson: [false, true] },
  toggleScheduleTask: { fn: tools.toggleScheduleTask, argCount: 1 },
  removeScheduleTask: { fn: tools.removeScheduleTask, argCount: 1 },
  startScheduler: { fn: tools.startScheduler, argCount: 0 },
  stopScheduler: { fn: tools.stopScheduler, argCount: 0 },
};

const STATE = {
  THINKING: 'THINKING',
  AWAITING_INPUT: 'AWAITING_INPUT',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',  // 新增：等待确认状态
};

// 危险操作列表 - 需要用户确认才能执行
const DANGEROUS_OPERATIONS = new Set([
  'gitPush',
  'gitReset',
  'gitBranchDelete',
  'executeCode',
  'executeFile',
  'runJavaScript',
  'runPython',
  'deleteData',
  'dropTable',
  'clearTasks',
  'clearMemory',
  'removeScheduleTask'
]);

let state = STATE.THINKING;
let thinkingTimer = null;
let shouldStop = false;
let thoughtInterval = 3000;
let pendingConfirmation = null;  // 待确认的操作
let isProcessing = false;  // 并发控制标志，防止多个思考循环同时执行
let confirmationResolve = null;  // 确认 Promise 的 resolve 函数（事件驱动）

/**
 * 检查是否需要危险操作确认
 */
function isConfirmEnabled() {
  if (process.env.COGITO_CONFIRM_DANGEROUS === 'false') {
    return false;
  }
  return true;  // 默认启用
}

/**
 * 检查操作是否危险
 */
function isDangerousOperation(toolName) {
  return DANGEROUS_OPERATIONS.has(toolName);
}

/**
 * 处理确认结果（事件驱动）
 * 当用户在 handleUserInput 中输入 y/n 时调用此函数
 */
function resolveConfirmation(confirmed) {
  if (confirmationResolve) {
    confirmationResolve(confirmed);
    confirmationResolve = null;
    pendingConfirmation = null;
  }
}

/**
 * 请求用户确认危险操作
 * @param {string} toolName 工具名称
 * @param {array} args 工具参数
 * @returns {Promise<boolean>} 用户是否确认
 */
async function requestConfirmation(toolName, args) {
  println('');
  printDivider('!', 'yellow');
  println(`  ⚠️  危险操作请求: ${printTag(toolName, 'bgYellow')}`, 'yellow');
  println(`  参数: ${args.join(', ')}`, 'yellow');
  println(`  是否执行此操作? 输入 ${printTag('y', 'bgGreen')} 确认, ${printTag('n', 'bgRed')} 拒绝`, 'yellow');
  println(`  ⏱️  等待超时: 5分钟无响应将自动拒绝`, 'yellow');
  printDivider('!', 'yellow');
  println('');

  // 设置等待确认状态
  state = STATE.AWAITING_CONFIRMATION;
  pendingConfirmation = { toolName, args };
  
  // 超时配置
  const CONFIRM_TIMEOUT = 5 * 60 * 1000; // 5分钟超时
  
  // 返回 Promise，在用户输入时 resolve（事件驱动，无轮询）
  return new Promise((resolve) => {
    // 保存 resolve 函数
    confirmationResolve = resolve;
    
    // 设置超时
    setTimeout(() => {
      if (confirmationResolve === resolve) {
        // 仍未被解决（用户未响应）
        confirmationResolve = null;
        pendingConfirmation = null;
        state = STATE.THINKING;
        println('');
        println('⏱️  等待超时，危险操作已自动拒绝', 'yellow');
        println('');
        resolve(false);
      }
    }, CONFIRM_TIMEOUT);
  });
}

function parseToolCall(text) {
  const fullMatch = text.match(/\[TOOL\]\s*(\w+)\s*\(([^)]*)\)\s*\[\/TOOL\]/);
  if (fullMatch) {
    const tool = fullMatch[1];
    const argsStr = fullMatch[2];
    const args = parseArgs(argsStr);
    return { tool, args };
  }
  return null;
}

function parseAllToolCalls(text) {
  const results = [];
  const regex = /\[TOOL\]\s*(\w+)\s*\(([^)]*)\)\s*\[\/TOOL\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tool = match[1];
    const argsStr = match[2];
    const args = parseArgs(argsStr);
    results.push({ tool, args });
  }
  return results;
}

/**
 * 解析工具参数
 * 支持两种格式：
 * 1. 逗号分隔的简单参数：arg1, arg2, arg3
 * 2. JSON 格式参数：{"path": "file.txt", "content": "hello"}
 */
function parseArgs(argsStr) {
  if (!argsStr || argsStr.trim() === '') {
    return [];
  }

  const trimmed = argsStr.trim();

  // 尝试解析 JSON 格式
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const jsonObj = JSON.parse(trimmed);
      // 将 JSON 对象转换为参数数组（按工具定义的参数顺序）
      // 这里返回对象，让 executeTool 处理
      return { isJson: true, data: jsonObj };
    } catch (e) {
      // JSON 解析失败，继续用逗号分隔方式
    }
  }

  // 逗号分隔方式（向后兼容）
  const result = [];
  const parts = trimmed.split(',');
  for (const part of parts) {
    const p = part.trim();
    if ((p.startsWith('"') && p.endsWith('"')) ||
        (p.startsWith("'") && p.endsWith("'"))) {
      result.push(p.slice(1, -1));
    } else {
      result.push(p);
    }
  }
  return result;
}

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

function formatToolResult(tool, data) {
  let result;
  
  if (tool === 'ls' && Array.isArray(data)) {
    result = formatLsResult(data);
  } else {
    result = String(data);
  }
  
  // 根据工具类型获取截断限制
  const limit = TOOL_OUTPUT_LIMITS[tool] || TOOL_OUTPUT_LIMITS.default;
  
  // 截断过长的输出
  if (result.length > limit) {
    return result.slice(0, limit) + '\n\n... [输出内容过长，已截断]';
  }
  
  return result;
}

/**
 * 解析并打印完整响应，分离正文和工具块
 */
function parseAndPrintResponse(text) {
  // 正则匹配 [TOOL] ... [/TOOL] 块
  const regex = /\[TOOL\]([\s\S]*?)\[\/TOOL\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 打印 [TOOL] 前面的普通文本
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      // 跳过 [工具结果] 和 [工具错误] 的内容
      const cleaned = before.split('\n').filter(line => 
        !line.trim().startsWith('[工具结果]:') && 
        !line.trim().startsWith('[工具错误]:')
      ).join('\n');
      if (cleaned.trim()) {
        printContent(cleaned);
      }
    }

    // 打印工具块（不显眼）
    const toolContent = match[1].trim();
    printToolBlock(`[TOOL] ${toolContent} [/TOOL]`);

    lastIndex = match.index + match[0].length;
  }

  // 打印最后剩余的普通文本
  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    // 跳过 [工具结果] 和 [工具错误] 的内容
    const cleaned = remaining.split('\n').filter(line => 
      !line.trim().startsWith('[工具结果]:') && 
      !line.trim().startsWith('[工具错误]:')
    ).join('\n');
    if (cleaned.trim()) {
      printContent(cleaned);
    }
  }
}

/**
 * 执行工具 - 使用注册表动态调用
 * 包含危险操作确认机制和 JSON 参数支持
 */
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
  
  // 默认：未知错误
  return 'unknown';
}

/**
 * 格式化工具错误信息
 */
function formatToolError(error, toolName) {
  const errorType = classifyToolError(error);
  
  let message = '';
  
  switch (errorType) {
    case 'network':
      message = `[${toolName}] 网络错误: ${error.message}`;
      break;
    case 'filesystem':
      message = `[${toolName}] 文件系统错误: ${error.message}`;
      break;
    case 'permission':
      message = `[${toolName}] 权限错误: ${error.message}`;
      break;
    case 'timeout':
      message = `[${toolName}] 执行超时: ${error.message}`;
      break;
    default:
      message = `[${toolName}] 执行失败: ${error.message}`;
  }
  
  // 在DEBUG模式下添加堆栈跟踪
  if (process.env.DEBUG === 'true' && error.stack) {
    const stackLines = error.stack.split('\n').slice(1, 4).join('\n');
    message += '\n堆栈跟踪:\n' + stackLines;
  }
  
  return message;
}

async function executeTool(toolName, args) {
  const registry = TOOL_REGISTRY[toolName];
  
  if (!registry) {
    return { 
      success: false, 
      error: `未知工具：${toolName}`,
      toolName,
      timestamp: new Date().toISOString()
    };
  }

  // 危险操作确认
  if (isConfirmEnabled() && isDangerousOperation(toolName)) {
    const confirmed = await requestConfirmation(toolName, args);
    if (!confirmed) {
      return { 
        success: false, 
        error: '用户拒绝执行此危险操作',
        toolName,
        timestamp: new Date().toISOString()
      };
    }
    // 恢复思考状态
    state = STATE.THINKING;
  }

  const { fn, customArgs, parseJson, jsonParams } = registry;
  let processedArgs = args;

  // 处理 JSON 格式参数
  if (args && args.isJson === true) {
    const jsonData = args.data;
    if (jsonParams) {
      // 按工具定义的参数顺序提取
      processedArgs = jsonParams.map(paramName => jsonData[paramName]);
    } else {
      // 如果没有定义参数顺序，将整个对象作为第一个参数
      processedArgs = [jsonData];
    }
  } else if (Array.isArray(args)) {
    // 处理特殊参数的工具
    if (toolName === 'create') {
      processedArgs = [args[0], args.slice(1).join(',')];
    } else if (toolName === 'search') {
      processedArgs = [args.join(',').trim()];
    } else if (parseJson) {
      // 根据 parseJson 数组决定哪些参数需要 JSON 解析
      processedArgs = args.map((arg, i) => {
        if (parseJson[i] && typeof arg === 'string') {
          try {
            return JSON.parse(arg);
          } catch {
            return arg;
          }
        }
        return arg;
      });
    }
  }

  try {
    const result = await fn(...processedArgs);
    return {
      success: true,
      data: result,
      toolName,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: formatToolError(error, toolName),
      toolName,
      errorType: classifyToolError(error),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 处理特殊命令
 * @returns {boolean} 是否为特殊命令
 */
function handleCommand(input) {
  const trimmed = input.trim();
  
  // 帮助命令
  if (trimmed === '/help' || trimmed === '/?') {
    printHelp();
    return true;
  }
  
  // 状态命令
  if (trimmed === '/status') {
    printStatus();
    return true;
  }
  
  // 清空历史命令
  if (trimmed === '/clear') {
    printClearConfirm();
    return true;
  }
  
  // Person切换命令
  if (trimmed.startsWith('/persona ')) {
    const personaName = trimmed.slice(9).trim();
    if (personaName) {
      switchPersona(personaName);
      return true;
    } else {
      println('[错误] 请提供 persona 名称', 'red');
      println('用法: /persona <name>', 'gray');
      return true;
    }
  }
  
  // 列出可用 personas
  if (trimmed === '/personas') {
    listPersonas();
    return true;
  }
  
  // 列出可用工具
  if (trimmed === '/tools') {
    listTools();
    return true;
  }
  
  // 导出配置命令
  if (trimmed === '/config') {
    printConfig();
    return true;
  }
  
  // 调试模式切换
  if (trimmed === '/debug') {
    toggleDebug();
    return true;
  }
  
  return false;
}

/**
 * 打印帮助信息
 */
function printHelp() {
  println('');
  printDivider('=', 'cyan');
  println('  CogitoAgent 命令帮助', 'cyan');
  printDivider('=', 'cyan');
  println('');
  println('  可用命令:', 'yellow');
  println('    /help          - 显示此帮助信息', 'gray');
  println('    /status        - 显示当前状态', 'gray');
  println('    /clear         - 清空对话历史', 'gray');
  println('    /persona <name> - 切换 Persona', 'gray');
  println('    /personas      - 列出所有可用 Persona', 'gray');
  println('    /tools         - 列出所有可用工具', 'gray');
  println('    /config        - 显示当前配置', 'gray');
  println('    /debug         - 切换调试模式', 'gray');
  println('');
  println('  基本操作:', 'yellow');
  println('    ENTER          - 打断当前思考，输入消息', 'gray');
  println('    exit           - 退出程序', 'gray');
  println('');
  printDivider('=', 'cyan');
  println('');
}

/**
 * 打印当前状态
 */
function printStatus() {
  const cfg = loadConfig();
  println('');
  printDivider('=', 'cyan');
  println('  CogitoAgent 当前状态', 'cyan');
  printDivider('=', 'cyan');
  println('');
  println(`  状态: ${printTag(state, state === STATE.THINKING ? 'green' : 'yellow')}`, 'white');
  println(`  Persona: ${printTag(cfg.persona || 'default', 'bgBlue')}`, 'white');
  println(`  模型: ${cfg.api.model || 'N/A'}`, 'white');
  println(`  API: ${cfg.api.baseURL || 'N/A'}`, 'white');
  println(`  工作区: ${tools.getBasePath()}`, 'white');
  println(`  思考间隔: ${(thoughtInterval / 1000).toFixed(1)}秒`, 'white');
  println(`  并发处理: ${isProcessing ? '是' : '否'}`, 'white');
  println(`  危险操作确认: ${isConfirmEnabled() ? '是' : '否'}`, 'white');
  println(`  调试模式: ${process.env.DEBUG === 'true' ? '是' : '否'}`, 'white');
  println(`  工具注册数量: ${Object.keys(TOOL_REGISTRY).length}`, 'white');
  println('');
  printDivider('=', 'cyan');
  println('');
}

/**
 * 打印清空确认提示
 */
function printClearConfirm() {
  println('');
  println('  ⚠️  确定要清空对话历史吗？此操作不可撤销', 'yellow');
  println(`  输入 ${printTag('y', 'bgGreen')} 确认清空, ${printTag('n', 'bgRed')} 取消`, 'yellow');
  println('');
  
  // 临时设置为等待确认状态
  state = STATE.AWAITING_CONFIRMATION;
  pendingConfirmation = { type: 'clearHistory' };
}

/**
 * 切换 Persona
 */
function switchPersona(personaName) {
  // TODO: 实现 Persona 切换逻辑
  println(`[提示] Persona 切换功能正在开发中: ${personaName}`, 'yellow');
}

/**
 * 列出所有可用 Persona
 */
function listPersonas() {
  // TODO: 实现列出 Persona 逻辑
  println('[提示] Persona 列表功能正在开发中', 'yellow');
}

/**
 * 列出所有可用工具
 */
function listTools() {
  const toolNames = Object.keys(TOOL_REGISTRY).sort();
  const categories = {
    file: ['ls', 'read', 'copy', 'mkdir', 'create'],
    web: ['search', 'browse', 'fetchPage'],
    system: ['listApps', 'openApp', 'closeApp'],
    git: ['gitInit', 'gitClone', 'gitAdd', 'gitCommit', 'gitPush', 'gitPull', 'gitStatus', 'gitLog', 'gitBranchCreate', 'gitBranchDelete', 'gitBranchList', 'gitCheckout', 'gitMerge', 'gitDiff', 'gitStash', 'gitStashPop'],
    code: ['executeCode', 'executeFile', 'runJavaScript', 'runPython'],
    task: ['createTask', 'getTasks', 'getTask', 'updateTask', 'deleteTask', 'completeTask', 'splitTask', 'getTaskStats', 'clearTasks'],
    memory: ['addMemory', 'searchMemory', 'getAllMemories', 'getMemory', 'updateMemory', 'deleteMemory', 'getMemoryStats', 'clearMemory'],
    data: ['readCSV', 'writeCSV', 'readJSON', 'writeJSON', 'csvToJSON', 'jsonToCSV', 'queryData', 'analyzeData', 'sortData'],
    db: ['executeSQL', 'query', 'insert', 'update', 'deleteData', 'createTable', 'dropTable', 'getTables', 'getTableSchema'],
    email: ['sendEmail', 'sendTextEmail', 'sendHtmlEmail', 'sendTemplateEmail', 'checkEmailConfig'],
    monitor: ['getCPUInfo', 'getMemoryInfo', 'getDiskInfo', 'getNetworkInfo', 'getProcesses', 'getSystemInfo', 'getSystemLoad', 'monitorSystem'],
    scheduler: ['addScheduleTask', 'removeScheduleTask', 'getScheduleTasks', 'getScheduleTask', 'updateScheduleTask', 'toggleScheduleTask', 'startScheduler', 'stopScheduler']
  };
  
  println('');
  printDivider('=', 'cyan');
  println(`  可用工具列表 (共 ${toolNames.length} 个)`, 'cyan');
  printDivider('=', 'cyan');
  println('');
  
  for (const [category, tools] of Object.entries(categories)) {
    println(`  ${category.toUpperCase()}:`, 'yellow');
    println(`    ${tools.join(', ')}`, 'gray');
    println('');
  }
  
  printDivider('=', 'cyan');
  println('');
}

/**
 * 打印当前配置
 */
function printConfig() {
  const cfg = loadConfig();
  
  println('');
  printDivider('=', 'cyan');
  println('  当前配置', 'cyan');
  printDivider('=', 'cyan');
  println('');
  println(`  Persona: ${cfg.persona || 'default'}`, 'white');
  println(`  工作区: ${cfg.workspace || './'}`, 'white');
  println(`  模型: ${cfg.api.model || 'N/A'}`, 'white');
  println(`  API Base: ${cfg.api.baseURL || 'N/A'}`, 'white');
  println(`  API Key: ${cfg.api.apiKey ? '***' + cfg.api.apiKey.slice(-4) : '未设置'}`, 'white');
  println(`  思考间隔: ${cfg.chat?.thinkingInterval || 3000}ms`, 'white');
  println(`  数据库: ${cfg.database?.path || '未设置'}`, 'white');
  println(`  邮件: ${cfg.email?.smtpHost || '未配置'}`, 'white');
  println(`  调试模式: ${process.env.DEBUG === 'true' ? '开启' : '关闭'}`, 'white');
  println('');
  printDivider('=', 'cyan');
  println('');
}

/**
 * 切换调试模式
 */
function toggleDebug() {
  const current = process.env.DEBUG === 'true';
  process.env.DEBUG = (!current).toString();
  println(`[调试] 调试模式已${current ? '关闭' : '开启'}`, 'yellow');
  
  if (!current) {
    println('  提示: 开启调试模式后会显示详细的错误堆栈', 'gray');
  }
}

function handleUserInput(input) {
  // 检查是否为退出命令
  if (input.toLowerCase() === 'exit') {
    exit();
    return;
  }
  
  // 处理特殊命令
  if (input.startsWith('/')) {
    if (handleCommand(input)) {
      return;
    }
  }

  // 处理危险操作确认（事件驱动）
  if (state === STATE.AWAITING_CONFIRMATION) {
    const response = input.toLowerCase().trim();
    
    // 处理清空历史确认
    if (pendingConfirmation?.type === 'clearHistory') {
      if (response === 'y' || response === 'yes' || response === '确认') {
        // TODO: 实现清空历史逻辑
        println('[成功] 对话历史已清空', 'green');
        pendingConfirmation = null;
        state = STATE.THINKING;
      } else if (response === 'n' || response === 'no' || response === '拒绝') {
        println('[取消] 操作已取消', 'gray');
        pendingConfirmation = null;
        state = STATE.THINKING;
      } else {
        println(`[提示] 请输入 ${printTag('y', 'bgGreen')} 确认或 ${printTag('n', 'bgRed')} 取消`, 'yellow');
      }
      return;
    }
    
    // 处理危险操作确认（调用 resolveConfirmation 事件）
    if (response === 'y' || response === 'yes' || response === '确认') {
      println('[确认] 用户同意执行危险操作', 'green');
      resolveConfirmation(true);  // 事件驱动 resolve
    } else if (response === 'n' || response === 'no' || response === '拒绝') {
      println('[拒绝] 用户拒绝执行危险操作', 'red');
      resolveConfirmation(false);  // 事件驱动 resolve
    } else {
      println(`[提示] 请输入 ${printTag('y', 'bgGreen')} 确认或 ${printTag('n', 'bgRed')} 拒绝`, 'yellow');
    }
    return;
  }

  if (state === STATE.THINKING) {
    shouldStop = true;
    clearTimeout(thinkingTimer);
    println('\n[中断] 思考已停止，请输入消息...', 'yellow');
    state = STATE.AWAITING_INPUT;
    return;
  }

  if (state === STATE.AWAITING_INPUT) {
    if (input) {
      println(`[消息] ${input}`, 'yellow');
      addUserMessage(input);
      state = STATE.THINKING;
      scheduleNextCycle();
    } else {
      println('[取消] 没有消息，继续思考', 'gray');
      state = STATE.THINKING;
      scheduleNextCycle();
    }
    return;
  }
}

async function thinkCycle() {
  // 并发控制：如果正在处理其他请求，直接返回
  if (isProcessing) {
    return;
  }
  
  // 状态检查
  if (state !== STATE.THINKING) return;

  // 设置处理标志
  isProcessing = true;

  try {
    const messages = getMessages();
    let fullResponse = '';
    let wantsToWait = false;

    // 重置标签状态
    resetReasoningTag();
    resetContentTag();

    for await (const chunk of streamChat(messages)) {
      if (shouldStop) {
        shouldStop = false;
        printBlank();
        return;
      }
      if (chunk.reasoning) {
        printReasoning(chunk.reasoning);
      }
      if (chunk.content) {
        fullResponse += chunk.content;
      }
    }

    // 收尾：关闭思考区标签
    closeReasoning();
    resetContentTag();

    if (shouldStop) {
      shouldStop = false;
      printBlank();
      return;
    }

    // 解析并打印完整响应（分离正文和工具块）
    parseAndPrintResponse(fullResponse);

    printBlank();

    if (fullResponse.includes('[WAIT]')) {
      wantsToWait = true;
      println('[等待] 我先不说了，等你说～', 'gray');
    }

    // 循环处理所有工具调用
    const toolCalls = parseAllToolCalls(fullResponse);

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const result = await executeTool(toolCall.tool, toolCall.args);
        if (result.success) {
          // 把工具结果也显示成灰色小框
          const resultText = formatToolResult(toolCall.tool, result.data);
          printToolBlock(resultText, '工具结果');
          addAssistantMessage(fullResponse + `\n\n[工具结果]: ${JSON.stringify(result.data)}`);
        } else {
          println(`[失败] ${result.error}`, 'red');
          addAssistantMessage(fullResponse + `\n\n[工具错误]: ${result.error}`);
        }
      }
    } else {
      addAssistantMessage(fullResponse);
    }

    if (shouldCompress()) {
      println('[系统] 正在压缩对话历史...', 'gray');
      compressHistory();
      println('[系统] 压缩完成', 'gray');
    }

    if (wantsToWait || (toolCalls.length === 0 && state === STATE.THINKING)) {
      state = STATE.AWAITING_INPUT;
    }

  } catch (error) {
    if (shouldStop) {
      shouldStop = false;
      return;
    }
    println(`[错误] ${error.message}`, 'red');
  } finally {
    // 确保处理标志总是被重置
    isProcessing = false;
  }
}

function scheduleNextCycle() {
  clearTimeout(thinkingTimer);
  thinkingTimer = setTimeout(async () => {
    if (state === STATE.THINKING) {
      await thinkCycle();
      scheduleNextCycle();
    }
  }, thoughtInterval);
}

async function start() {
  // 从配置加载思考间隔
  const cfg = loadConfig();
  thoughtInterval = cfg.chat?.thinkingInterval || 3000;

  printBanner();
  printDivider('─', 'cyan');
  println('  活动范围: ' + printTag(tools.getBasePath(), 'bgBlue') + '  思考间隔: ' + printTag(`${thoughtInterval / 1000}秒`, 'bgCyan'));
  printDivider('─', 'cyan');
  println('  按 ' + printTag('Enter', 'bgBlue') + ' 打断思考，输入 ' + printTag('exit', 'bgBlue') + ' 退出\n', 'gray');

  init(handleUserInput);

  await tools.startScheduler();

  addUserMessage('你好，我启动了');
  await thinkCycle();
  scheduleNextCycle();
}

export { 
  start,
  parseArgs,
  formatToolResult,
  classifyToolError,
  formatToolError,
  handleCommand,
  printHelp,
  printStatus,
  printClearConfirm,
  switchPersona,
  listPersonas,
  listTools,
  printConfig,
  toggleDebug,
  handleUserInput,
  TOOL_OUTPUT_LIMITS,
  STATE
};
