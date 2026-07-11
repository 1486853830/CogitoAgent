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

import { streamChat, estimateTokens } from '../api/client.js';
import * as tools from './tools/index.js';
import { getMessages, addUserMessage, addAssistantMessage, addToolResultMessage, shouldCompress, compressHistory, initializeSession } from './session.js';
import { init, println, printBlank, printBanner, printDivider, printTag, printReasoning, resetReasoningTag, closeReasoning, printContent, resetContentTag, printToolBlock, exit } from '../io/terminal.js';
import { loadConfig } from '../config.js';
import { startWsServer, broadcast, onMessage, onStatsRequest } from '../io/ws-server.js';
import { recordToolCall, recordSession, recordMessage, recordTokenUsage, getToolStats, getSessionStats, getToolUsageByCategory, getTopUsedTools } from './stats.js';

// 导入拆分出去的模块
import { STATE, getState, setState, isThinking, isAwaitingInput, isAwaitingConfirmation, getPendingConfirmation, setPendingConfirmation, requestConfirmation, resolveConfirmation, state } from './state.js';
import { TOOL_REGISTRY, DANGEROUS_OPERATIONS, getToolNames, getToolRegistry, hasTool, isDangerousOperation, isConfirmEnabled, getToolsByCategory } from './registry.js';
import { handleCommand, printHelp, printStatus, printClearConfirm, switchPersona, listPersonas, listTools, printConfig, toggleDebug, printClusterStatus } from './commands.js';
import { orchestrator } from './orchestrator.js';
import { initWechatChannel } from './wechat-manager.js';
import { parseArgs, parseToolCall, parseAllToolCalls } from './tool-parser.js';
import { TOOL_OUTPUT_LIMITS, formatToolResult, formatLsResult, classifyToolError, formatToolError } from './tool-utils.js';
import { traceStep, updateTraceStep, clearThoughtTrace, getThoughtTrace } from './thought-trace.js';

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

// 思维链追踪（traceStep / updateTraceStep / clearThoughtTrace / getThoughtTrace）已移动到 thought-trace.js

// 工具输出格式化与错误分类已移动到 tool-utils.js，此处导入并 re-export

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

// parseArgs / parseToolCall / parseAllToolCalls 已移动到 tool-parser.js，此处导入并 re-export

// formatLsResult 已移动到 tool-utils.js

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
        processedInput = `${input}\n\n[WAIT]你需要学会使用这个标签，如果你说完了，需要等待用户回复就用这个标签`;
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

    // 使用手动迭代器模式以捕获 generator 的 return value（usage）
    const stream = streamChat(messages);
    let usage = null;
    while (true) {
      const iterResult = await stream.next();
      if (iterResult.done) {
        usage = iterResult.value;  // streamChat 返回的 { input, output } 或 null
        break;
      }
      const chunk = iterResult.value;
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

    // 记录 token 用量（API 返回 usage 时直接使用，否则启发式估算兜底）
    try {
      if (!usage) {
        const inputText = messages.map(m => m.content || '').join('');
        usage = {
          input: estimateTokens(inputText),
          output: estimateTokens(fullResponse)
        };
      } else if (!usage.output) {
        // API 未返回 output 时，用 fullResponse 估算
        usage.output = estimateTokens(fullResponse);
      }
      recordTokenUsage(usage.input, usage.output);
      println(`[Token] 输入:${usage.input} 输出:${usage.output} 总计:${usage.input + usage.output}`, 'gray');
      broadcast('token-usage', {
        input: usage.input,
        output: usage.output,
        total: usage.input + usage.output,
        session: getSessionStats()
      });
    } catch (e) {
      console.error('[Token] 统计失败:', e.message);
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
        } else if (payload?.type === 'tokens') {
          const s = getSessionStats();
          return {
            data: {
              totalInputTokens: s.totalInputTokens,
              totalOutputTokens: s.totalOutputTokens,
              totalTokens: s.totalTokens,
              todayInputTokens: s.todayInputTokens,
              todayOutputTokens: s.todayOutputTokens,
              todayTokens: s.todayTokens
            }
          };
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
