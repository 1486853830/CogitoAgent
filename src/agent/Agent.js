/**
 * 核心智能体模块
 * 
 * 重构说明：
 * - 状态管理拆分到 state.js
 * - 工具注册拆分到 registry.js
 * - 命令处理拆分到 commands.js
 * - 日志使用 logger.js
 * - 会话管理拆分到 session.js
 */

import { streamChat } from '../api/client.js';
import * as tools from './tools/index.js';
import { getMessages, addUserMessage, addAssistantMessage, addToolResultMessage, shouldCompress, compressHistory, initializeSession } from './session.js';
import { init, println, printBlank, printBanner, printDivider, printTag, printReasoning, resetReasoningTag, closeReasoning, printContent, resetContentTag, printToolBlock, exit } from '../io/terminal.js';
import { loadConfig } from '../config.js';
import { startWsServer, broadcast, onMessage, onStatsRequest } from '../io/ws-server.js';
import { recordToolCall, recordSession, recordMessage, getToolStats, getSessionStats, getToolUsageByCategory, getTopUsedTools } from './stats.js';

// 导入拆分出去的模块
import { STATE, getState, setState, isThinking, isAwaitingInput, isAwaitingConfirmation, getPendingConfirmation, setPendingConfirmation, requestConfirmation, resolveConfirmation, state } from './state.js';
import { TOOL_REGISTRY, DANGEROUS_OPERATIONS, getToolNames, getToolRegistry, hasTool, isDangerousOperation, isConfirmEnabled, getToolsByCategory } from './registry.js';
import { handleCommand, printHelp, printStatus, printClearConfirm, switchPersona, listPersonas, listTools, printConfig, toggleDebug, printClusterStatus } from './commands.js';
import { orchestrator } from './orchestrator.js';
import { initWechatChannel } from './wechat-manager.js';

// 状态管理委托给 state.js 模块
let thinkingTimer = null;
let shouldStop = false;
let isProcessing = false;  // 并发控制标志，防止多个思考循环同时执行
let consecutiveCycleCount = 0;  // 连续思考循环计数（无用户输入时）
let thoughtInterval = 3000;
let _replyCallback = null;  // 微信回复回调

function setReplyCallback(cb) {
  _replyCallback = cb;
}

function extractCleanReply(text) {
  return text
    .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
    .split('\n')
    .filter(line =>
      !line.trim().startsWith('[工具结果]:') &&
      !line.trim().startsWith('[工具错误]:'))
    .join('\n')
    .trim();
}
const MAX_CONSECUTIVE_CYCLES = 8;  // 最大连续循环次数，超过后强制暂停等待用户

// 思维链追踪器
let thoughtTrace = [];

function traceStep(name, details = {}, status = 'running') {
  const step = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    name,
    details,
    status,
    startTime: new Date().toISOString(),
    duration: 0
  };
  thoughtTrace.push(step);
  broadcast('thought-trace', { action: 'add', step });
  return step;
}

function updateTraceStep(id, updates) {
  const step = thoughtTrace.find(s => s.id === id);
  if (step) {
    const start = new Date(step.startTime).getTime();
    step.duration = Math.round((Date.now() - start) / 1000 * 100) / 100;
    Object.assign(step, updates);
    broadcast('thought-trace', { action: 'update', step });
  }
}

function clearThoughtTrace() {
  thoughtTrace = [];
  broadcast('thought-trace', { action: 'clear' });
}

function getThoughtTrace() {
  return [...thoughtTrace];
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

async function executeTool(toolName, args) {
  const registry = TOOL_REGISTRY[toolName];
  const startTime = Date.now();
  
  if (!registry) {
    const duration = (Date.now() - startTime) / 1000;
    recordToolCall(toolName, 'unknown', false, duration);
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
      const duration = (Date.now() - startTime) / 1000;
      recordToolCall(toolName, registry.category, false, duration);
      return { 
        success: false, 
        error: '用户拒绝执行此危险操作',
        toolName,
        timestamp: new Date().toISOString()
      };
    }
    // 恢复思考状态
    state.current = STATE.THINKING;
  }

  const { fn, customArgs, parseJson, jsonParams, category } = registry;
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
    const duration = (Date.now() - startTime) / 1000;
    
    // 防御性检查：确保 result 是有效对象
    if (result === undefined || result === null) {
      recordToolCall(toolName, category, true, duration);
      return {
        success: true,
        data: '执行完成（无返回值）',
        toolName,
        timestamp: new Date().toISOString()
      };
    }
    
    // 如果工具已经返回了标准格式 { success, data/error }，直接使用
    if (typeof result === 'object' && 'success' in result) {
      recordToolCall(toolName, category, result.success, duration);
      return {
        ...result,
        toolName,
        timestamp: new Date().toISOString()
      };
    }
    
    // 否则包装成标准格式
    recordToolCall(toolName, category, true, duration);
    return {
      success: true,
      data: result,
      toolName,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    recordToolCall(toolName, category, false, duration);
    return {
      success: false,
      error: formatToolError(error, toolName),
      toolName,
      errorType: classifyToolError(error),
      timestamp: new Date().toISOString()
    };
  }
}

// 注意：handleCommand, printHelp, printStatus, printClearConfirm, switchPersona, listPersonas, listTools, printConfig, toggleDebug 
// 已移动到 commands.js 模块中，此处导入使用

/**
 * 解析单个工具调用
 * 支持更复杂的参数格式（包含括号、引号等）
 */
function parseToolCall(text) {
  // 改进的正则：匹配工具名和括号内的所有内容（包括嵌套括号）
  const fullMatch = text.match(/\[TOOL\]\s*(\w+)\s*\(([\s\S]*?)\)\s*\[\/TOOL\]/);
  if (fullMatch) {
    const tool = fullMatch[1];
    const argsStr = fullMatch[2];
    const args = parseArgs(argsStr);
    return { tool, args };
  }
  return null;
}

/**
 * 解析所有工具调用
 * 支持多行参数和复杂格式
 */
function parseAllToolCalls(text) {
  const results = [];
  // 使用更宽松的正则，支持多行参数
  const regex = /\[TOOL\]\s*(\w+)\s*\(([\s\S]*?)\)\s*\[\/TOOL\]/g;
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
 * 解析工具参数（改进版）
 * 支持多种格式：
 * 1. JSON 格式：{"path": "file.txt", "content": "hello"}
 * 2. 逗号分隔的简单参数：arg1, arg2, arg3
 * 3. 多行内容（使用特殊分隔符）
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
      return { isJson: true, data: jsonObj };
    } catch (e) {
      // JSON 解析失败，继续用其他方式
    }
  }

  // 尝试解析带引号的参数（支持内容中包含逗号）
  // 格式："path", "content with commas, etc"
  if (trimmed.includes('"') || trimmed.includes("'")) {
    try {
      // 使用更智能的分割方式：只在引号外的逗号处分割
      const args = [];
      let current = '';
      let inQuote = false;
      let quoteChar = '';
      
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        
        if ((char === '"' || char === "'") && !inQuote) {
          inQuote = true;
          quoteChar = char;
          current += char;
        } else if (char === quoteChar && inQuote) {
          inQuote = false;
          quoteChar = '';
          current += char;
        } else if (char === ',' && !inQuote) {
          // 引号外的逗号是分隔符
          args.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      // 添加最后一个参数
      if (current.trim()) {
        args.push(current.trim());
      }
      
      // 处理引号包裹的参数
      return args.map(arg => {
        const p = arg.trim();
        if ((p.startsWith('"') && p.endsWith('"')) ||
            (p.startsWith("'") && p.endsWith("'"))) {
          return p.slice(1, -1);
        }
        return p;
      });
    } catch (e) {
      // 智能分割失败，回退到简单分割
    }
  }

  // 简单逗号分隔（向后兼容）
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

/**
 * 处理用户输入
 */
function handleUserInput(input) {
  consecutiveCycleCount = 0;  // 用户输入时重置连续循环计数

  // 非微信消息时清除微信回复回调
  if (_replyCallback && !input.startsWith('[微信消息')) {
    _replyCallback = null;
  }

  // 检查是否为退出命令
  if (input.toLowerCase() === 'exit') {
    exit();
    return;
  }
  
  // 处理特殊命令
  if (input.startsWith('/')) {
    if (input === '/stop') {
      shouldStop = true;
      clearTimeout(thinkingTimer);
      isProcessing = false;
      println('[中断] 思考已停止', 'yellow');
      state.current = STATE.AWAITING_INPUT;
      broadcast('agent-state', { state: 'idle' });
      return;
    }
    if (handleCommand(input)) {
      return;
    }
  }

  // 处理危险操作确认（事件驱动）
  if (state.current === STATE.AWAITING_CONFIRMATION) {
    const response = input.toLowerCase().trim();
    
    // 处理清空历史确认
    const pendingConf = getPendingConfirmation();
    if (pendingConf?.type === 'clearHistory') {
      if (response === 'y' || response === 'yes' || response === '确认') {
        // TODO: 实现清空历史逻辑
        println('[成功] 对话历史已清空', 'green');
        setPendingConfirmation(null);
        state.current = STATE.THINKING;
      } else if (response === 'n' || response === 'no' || response === '拒绝') {
        println('[取消] 操作已取消', 'gray');
        setPendingConfirmation(null);
        state.current = STATE.THINKING;
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

  if (state.current === STATE.THINKING) {
    shouldStop = true;
    clearTimeout(thinkingTimer);
    isProcessing = false;  // 重置处理标志，允许后续思考循环
    println('\n[中断] 思考已停止，请输入消息...', 'yellow');
    state.current = STATE.AWAITING_INPUT;
    broadcast('agent-state', { state: 'idle' });  // 通知前端状态变化
    return;
  }

  if (state.current === STATE.AWAITING_INPUT) {
    if (input) {
      // 首次消息自动添加 [WAIT] 提示，让 AI 给对话打标签
      const messages = getMessages();
      const hasUserMessage = messages.some(m => m.role === 'user');
      let processedInput = input;
      if (!hasUserMessage) {
        processedInput = `${input}\n\n[WAIT]你需要学会使用这个标签，使用不当会卡入死循环`;
        println(`[消息] ${input}`, 'yellow');
        println('[系统] 已自动添加标签提示（首次消息）', 'gray');
      } else {
        println(`[消息] ${input}`, 'yellow');
      }
      addUserMessage(processedInput);
      state.current = STATE.THINKING;
      broadcast('agent-state', { state: 'thinking' });  // 通知前端开始思考
      scheduleNextCycle();
    } else {
      println('[取消] 没有消息，继续思考', 'gray');
      state.current = STATE.THINKING;
      broadcast('agent-state', { state: 'thinking' });
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
  if (state.current !== STATE.THINKING) return;

  // 设置处理标志
  isProcessing = true;

  // WebSocket 广播思考状态
  broadcast('agent-state', { state: 'thinking' });

  // 开始新的思维链追踪
  clearThoughtTrace();
  const cycleStep = traceStep('思考周期开始', { messageCount: getMessages().length }, 'running');

  try {
    const messages = getMessages();
    let fullResponse = '';
    let cleanFullResponse = '';
    let wantsToWait = false;

    // 重置标签状态
    resetReasoningTag();
    resetContentTag();

    // 追踪：发送请求到 AI
    const requestStep = traceStep('发送请求到 AI', { messageCount: messages.length }, 'running');

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
        let cleanChunk = chunk.content;
        cleanChunk = cleanChunk.split('\n').filter(line => 
          !line.trim().startsWith('[工具结果]:') && 
          !line.trim().startsWith('[工具错误]:')
        ).join('\n');
        
        fullResponse += chunk.content;
        cleanFullResponse += cleanChunk;
        
        if (cleanChunk.trim()) {
          broadcast('agent-reply', { type: 'chunk', content: cleanChunk, full: cleanFullResponse });
        }
      }
    }

    // 追踪：AI 响应完成
    updateTraceStep(requestStep.id, { status: 'completed', details: { responseLength: fullResponse.length } });

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

    // 追踪：解析工具调用
    const parseStep = traceStep('解析工具调用', {}, 'running');
    const toolCalls = parseAllToolCalls(fullResponse);
    updateTraceStep(parseStep.id, { status: 'completed', details: { toolCallCount: toolCalls.length } });

    // AI 回复只保留纯文本和 [TOOL] 调用，不含工具结果
    // 先清理 AI 可能生成的虚假工具结果标记
    let finalResponse = fullResponse.split('\n').filter(line =>
      !line.trim().startsWith('[工具结果]:') &&
      !line.trim().startsWith('[工具错误]:')
    ).join('\n');

    // 工具结果收集到独立数组，作为 user 消息注入（而非拼接到 assistant 消息）
    // 这样 AI 能明确区分"自己说的"和"系统返回的"，避免编造工具结果
    const toolResults = [];

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        if (shouldStop) {
          println('[中断] 工具执行已停止', 'yellow');
          break;
        }

        broadcast('agent-reply', { type: 'tool-start', tool: toolCall.tool, args: toolCall.args });

        // 追踪：执行工具
        const toolStep = traceStep(`执行工具: ${toolCall.tool}`, { args: toolCall.args }, 'running');
        
        const result = await executeTool(toolCall.tool, toolCall.args);
        
        if (result.success) {
          const isEmpty = !result.data ||
            (typeof result.data === 'string' && result.data.trim() === '') ||
            (Array.isArray(result.data) && result.data.length === 0) ||
            (typeof result.data === 'object' && Object.keys(result.data).length === 0);

          if (isEmpty) {
            println(`[空结果] ${toolCall.tool} 返回空结果`, 'yellow');
            toolResults.push(`[工具结果]: [空结果] ${toolCall.tool} 返回空结果，未找到相关信息。`);
            broadcast('agent-reply', { type: 'tool-result', tool: toolCall.tool, success: true, data: '[空结果] 未找到相关信息', isEmpty: true });
            updateTraceStep(toolStep.id, { status: 'completed', details: { success: true, isEmpty: true } });
          } else {
            const resultText = formatToolResult(toolCall.tool, result.data);
            printToolBlock(resultText, '工具结果');
            toolResults.push(`[工具结果]: ${resultText}`);
            broadcast('agent-reply', { type: 'tool-result', tool: toolCall.tool, success: true, data: resultText });
            updateTraceStep(toolStep.id, { status: 'completed', details: { success: true, resultLength: resultText.length } });
          }
        } else {
          println(`[失败] ${result.error}`, 'red');
          toolResults.push(`[工具错误]: ${result.error}`);
          broadcast('agent-reply', { type: 'tool-result', tool: toolCall.tool, success: false, data: result.error });
          updateTraceStep(toolStep.id, { status: 'failed', details: { success: false, error: result.errorType } });
        }

        if (shouldStop) {
          println('[中断] 工具执行已停止', 'yellow');
          break;
        }
      }
    }

    // 追踪：整合结果
    const integrateStep = traceStep('整合结果', { toolResultCount: toolResults.length }, 'running');

    // 1. 只把 AI 的纯回复作为 assistant 消息（不含工具结果）
    addAssistantMessage(finalResponse);

    // 2. 工具结果作为独立的 user 消息注入，让 AI 下一轮明确这是系统返回的真实结果
    if (toolResults.length > 0) {
      const toolResultMessage = `[系统返回的工具执行结果]\n${toolResults.join('\n\n')}\n[系统] 请基于以上工具执行结果继续回复，不要编造或猜测结果。`;
      addToolResultMessage(toolResultMessage);
    }

    updateTraceStep(integrateStep.id, { status: 'completed' });

    if (shouldCompress()) {
      const compressStep = traceStep('压缩对话历史', {}, 'running');
      println('[系统] 正在压缩对话历史...', 'gray');
      compressHistory();
      println('[系统] 压缩完成', 'gray');
      updateTraceStep(compressStep.id, { status: 'completed' });
    }

    // 追踪：思考周期结束
    updateTraceStep(cycleStep.id, { status: 'completed', details: { 
      nextAction: wantsToWait ? 'wait' : (toolCalls.length > 0 ? 'tools' : 'continue') 
    }});

    if (wantsToWait || state.current !== STATE.THINKING) {
      state.current = STATE.AWAITING_INPUT;
      const nextAction = wantsToWait ? 'wait' : 'continue';
      if (_replyCallback) {
        const cleanReply = extractCleanReply(finalResponse);
        if (cleanReply) _replyCallback(cleanReply);
        _replyCallback = null;
      }
      broadcast('agent-reply', { type: 'end', nextAction });
      broadcast('agent-state', { state: 'idle' });
      consecutiveCycleCount = 0;
    } else if (toolCalls.length > 0) {
      broadcast('agent-reply', { type: 'end', nextAction: 'tools' });
      consecutiveCycleCount = 0;
      scheduleNextCycle();
    } else {
      // 没有 [WAIT] 也没有工具调用，检查是否需要继续思考
      consecutiveCycleCount++;
      if (consecutiveCycleCount >= MAX_CONSECUTIVE_CYCLES) {
        // 连续循环次数过多，强制暂停等待用户
        consecutiveCycleCount = 0;
        state.current = STATE.AWAITING_INPUT;
        if (_replyCallback) {
          const cleanReply = extractCleanReply(finalResponse);
          if (cleanReply) _replyCallback(cleanReply);
          _replyCallback = null;
        }
        broadcast('agent-reply', { type: 'end', nextAction: 'wait' });
        broadcast('agent-state', { state: 'idle' });
        println('[系统] 已连续思考多轮，先听你说～', 'gray');
      } else {
        // 继续思考，让 AI 有机会输出更多内容
        scheduleNextCycle();
      }
    }

  } catch (error) {
    updateTraceStep(cycleStep.id, { status: 'failed', details: { error: error.message } });
    _replyCallback = null;
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
    if (state.current === STATE.THINKING) {
      await thinkCycle();
      scheduleNextCycle();
    }
  }, thoughtInterval);
}

async function start() {
  // 从配置加载思考间隔
  const cfg = loadConfig();
  thoughtInterval = cfg.chat?.thinkingInterval || 3000;

  // 初始化会话
  initializeSession();

  // 从环境变量加载 persona
  const envPersona = process.env.COGITO_PERSONA;
  if (envPersona) {
    switchPersona(envPersona);
  }

  // 启动 WebSocket 服务（供 Electron 桌面端连接，可通过 DISABLE_WS 环境变量禁用）
  if (process.env.DISABLE_WS !== 'true') {
    try {
      await startWsServer(9527);
      // 处理来自桌面端的消息
      onMessage((msg) => {
        if (msg.type === 'user-message' && msg.text) {
          recordMessage();
          handleUserInput(msg.text);
        }
      });
      // 处理统计数据请求
      onStatsRequest((payload) => {
        if (payload?.type === 'toolUsage') {
          return { data: getToolUsageByCategory() };
        } else if (payload?.type === 'topTools') {
          return { data: getTopUsedTools(payload?.limit || 10) };
        } else if (payload?.type === 'session') {
          return { data: getSessionStats() };
        } else if (payload?.type === 'toolStats') {
          return { data: getToolStats() };
        } else if (payload?.type === 'thoughtTrace') {
          return { data: getThoughtTrace() };
        } else if (payload?.type === 'cluster') {
          return { data: orchestrator.getClusterStatus() };
        }
        return {
          toolUsage: getToolUsageByCategory(),
          topTools: getTopUsedTools(10),
          session: getSessionStats(),
          thoughtTrace: getThoughtTrace(),
          cluster: orchestrator.getClusterStatus()
        };
      });
    } catch (e) {
      console.log('[WS] WebSocket 启动失败，跳过（桌面端不可用）');
    }
  } else {
    console.log('[WS] WebSocket 服务已禁用（CLI 模式）');
  }

  printBanner();
  printDivider('─', 'cyan');
  println('  活动范围: ' + printTag(tools.getBasePath(), 'bgBlue') + '  思考间隔: ' + printTag(`${thoughtInterval / 1000}秒`, 'bgCyan'));
  println('  输入 ' + printTag('/sessions', 'bgBlue') + ' 管理多会话，输入 ' + printTag('/help', 'bgBlue') + ' 查看所有命令\n', 'gray');
  printDivider('─', 'cyan');
  println('  按 ' + printTag('Enter', 'bgBlue') + ' 打断思考，输入 ' + printTag('exit', 'bgBlue') + ' 退出\n', 'gray');

  init(handleUserInput);

  await tools.startScheduler();

  await initWechatChannel();

  // 启动后等待用户输入，不立即开始自主探索
  println('\n  准备就绪，等待您的指令...', 'green');
  state.current = STATE.AWAITING_INPUT;
  broadcast('agent-state', { state: 'idle' });
}

export { 
  start,
  parseArgs,
  parseToolCall,
  parseAllToolCalls,
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
  setReplyCallback,
  TOOL_OUTPUT_LIMITS,
  STATE,
  traceStep,
  updateTraceStep,
  clearThoughtTrace,
  getThoughtTrace
};
