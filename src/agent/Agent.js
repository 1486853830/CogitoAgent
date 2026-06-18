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

  // 等待用户输入（带超时机制）
  const CONFIRM_TIMEOUT = 5 * 60 * 1000; // 5分钟超时
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkConfirm = () => {
      // 检查超时
      if (Date.now() - startTime > CONFIRM_TIMEOUT) {
        pendingConfirmation = false;
        state = STATE.THINKING;
        println('');
        println('⏱️  等待超时，危险操作已自动拒绝', 'yellow');
        println('');
        resolve(false);
        return;
      }
      
      if (pendingConfirmation === null) {
        // 用户已确认
        resolve(true);
      } else if (pendingConfirmation === false) {
        // 用户拒绝
        resolve(false);
      } else {
        // 继续等待（每100ms检查一次）
        setTimeout(checkConfirm, 100);
      }
    };
    checkConfirm();
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

// 工具输出最大长度限制（防止大文件导致内存膨胀）
const MAX_TOOL_OUTPUT = 10000;  // 10000 字符

function formatToolResult(tool, data) {
  let result;
  
  if (tool === 'ls' && Array.isArray(data)) {
    result = formatLsResult(data);
  } else {
    result = String(data);
  }
  
  // 截断过长的输出
  if (result.length > MAX_TOOL_OUTPUT) {
    return result.slice(0, MAX_TOOL_OUTPUT) + '\n\n... [输出内容过长，已截断]';
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
async function executeTool(toolName, args) {
  const registry = TOOL_REGISTRY[toolName];
  
  if (!registry) {
    return { success: false, error: `未知工具：${toolName}` };
  }

  // 危险操作确认
  if (isConfirmEnabled() && isDangerousOperation(toolName)) {
    const confirmed = await requestConfirmation(toolName, args);
    if (!confirmed) {
      return { success: false, error: '用户拒绝执行此危险操作' };
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
    return await fn(...processedArgs);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function handleUserInput(input) {
  if (input.toLowerCase() === 'exit') {
    exit();
    return;
  }

  // 处理危险操作确认
  if (state === STATE.AWAITING_CONFIRMATION) {
    const response = input.toLowerCase().trim();
    if (response === 'y' || response === 'yes' || response === '确认') {
      println('[确认] 用户同意执行危险操作', 'green');
      pendingConfirmation = null;  // 标记为已确认
      state = STATE.THINKING;
    } else if (response === 'n' || response === 'no' || response === '拒绝') {
      println('[拒绝] 用户拒绝执行危险操作', 'red');
      pendingConfirmation = false;  // 标记为拒绝
      state = STATE.THINKING;
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

export { start };
