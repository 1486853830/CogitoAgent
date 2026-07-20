import { streamChat } from '../api/client.ts';
import * as tools from './tools/index.ts';
import { getMessages, addUserMessage, addAssistantMessage, addToolResultMessage, shouldCompress, compressHistory, initializeSession, estimateTokens } from './session.ts';
import { init, println, printBlank, printBanner, printDivider, printTag, printReasoning, resetReasoningTag, closeReasoning, printContent, resetContentTag, printToolBlock, exit } from '../io/terminal.ts';
import { loadConfig } from '../config.ts';
import { startWsServer, broadcast, onMessage, onStatsRequest } from '../io/ws-server.ts';
import { recordToolCall, recordSession, recordMessage, recordTokenUsage, getToolStats, getSessionStats, getToolUsageByCategory, getTopUsedTools } from './stats.ts';
import { STATE, getState, setState, isThinking, isAwaitingInput, isAwaitingConfirmation, getPendingConfirmation, setPendingConfirmation, requestConfirmation, resolveConfirmation, state } from './state.ts';
import { TOOL_REGISTRY, DANGEROUS_OPERATIONS, getToolNames, getToolRegistry, hasTool, isDangerousOperation, isConfirmEnabled, getToolsByCategory } from './registry.ts';
import { handleCommand, printHelp, printStatus, printClearConfirm, switchPersona, listPersonas, listTools, printConfig, toggleDebug, printClusterStatus } from './commands.ts';
import { orchestrator } from './orchestrator.ts';
import { initWechatChannel } from './wechat-manager.ts';
import { parseArgs, parseToolCall, parseAllToolCalls } from './tool-parser.ts';
import { TOOL_OUTPUT_LIMITS, formatToolResult, formatLsResult, classifyToolError, formatToolError } from './tool-utils.ts';
import { traceStep, updateTraceStep, clearThoughtTrace, getThoughtTrace } from './thought-trace.ts';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

let thinkingTimer: ReturnType<typeof setTimeout> | null = null;
let shouldStop = false;
let isProcessing = false;
let consecutiveCycleCount = 0;
let thoughtInterval = 3000;
let _replyCallback: ((reply: string) => void) | null = null;

const MAX_CONSECUTIVE_CYCLES = 8;

function setReplyCallback(cb: (reply: string) => void): void {
  _replyCallback = cb;
}

function extractCleanReply(text: string): string {
  return text
    .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
    .split('\n')
    .filter(line =>
      !line.trim().startsWith('[工具结果]:') &&
      !line.trim().startsWith('[工具错误]:'))
    .join('\n')
    .trim();
}

function parseAndPrintResponse(text: string): void {
  const regex = /\[TOOL\]([\s\S]*?)\[\/TOOL\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      const cleaned = before.split('\n').filter(line =>
        !line.trim().startsWith('[工具结果]:') &&
        !line.trim().startsWith('[工具错误]:')
      ).join('\n');
      if (cleaned.trim()) {
        printContent(cleaned);
      }
    }

    const toolContent = match[1].trim();
    printToolBlock(`[TOOL] ${toolContent} [/TOOL]`);

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    const cleaned = remaining.split('\n').filter(line =>
      !line.trim().startsWith('[工具结果]:') &&
      !line.trim().startsWith('[工具错误]:')
    ).join('\n');
    if (cleaned.trim()) {
      printContent(cleaned);
    }
  }
}

interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
  toolName?: string;
  timestamp?: string;
  errorType?: string;
}

async function executeTool(toolName: string, args: unknown): Promise<ToolExecutionResult> {
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

  if (isConfirmEnabled() && isDangerousOperation(toolName)) {
    const confirmed = await requestConfirmation(toolName, args as unknown[]);
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
    state.current = STATE.THINKING;
  }

  const { fn, customArgs, parseJson, jsonParams, category } = registry;
  let processedArgs = args;

  if (args && typeof args === 'object' && 'isJson' in args && (args as { isJson: boolean }).isJson === true) {
    const jsonData = (args as unknown as { data: Record<string, unknown> }).data;
    if (jsonParams) {
      processedArgs = jsonParams.map((paramName: string) => jsonData[paramName]);
    } else {
      processedArgs = [jsonData];
    }
  } else if (Array.isArray(args)) {
    if (toolName === 'create') {
      processedArgs = [args[0], args.slice(1).join(',')];
    } else if (toolName === 'search') {
      processedArgs = [args.join(',').trim()];
    } else if (parseJson) {
      processedArgs = args.map((arg, i) => {
        if (Array.isArray(parseJson) && parseJson[i] && typeof arg === 'string') {
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
    const result = await fn(...(processedArgs as unknown[]));
    const duration = (Date.now() - startTime) / 1000;
    
    if (result === undefined || result === null) {
      recordToolCall(toolName, category, true, duration);
      return {
        success: true,
        data: '执行完成（无返回值）',
        toolName,
        timestamp: new Date().toISOString()
      };
    }
    
    if (typeof result === 'object' && 'success' in result) {
      recordToolCall(toolName, category, (result as { success: boolean }).success, duration);
      return {
        ...result,
        toolName,
        timestamp: new Date().toISOString()
      };
    }
    
    recordToolCall(toolName, category, true, duration);
    return {
      success: true,
      data: String(result),
      toolName,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    recordToolCall(toolName, category, false, duration);
    return {
      success: false,
      error: formatToolError(error as Error, toolName),
      toolName,
      errorType: classifyToolError(error as Error),
      timestamp: new Date().toISOString()
    };
  }
}

function handleUserInput(input: string): void {
  consecutiveCycleCount = 0;

  if (_replyCallback && !input.startsWith('[微信消息')) {
    _replyCallback = null;
  }

  if (input.toLowerCase() === 'exit') {
    exit();
    return;
  }
  
  if (input.startsWith('/')) {
    if (input === '/stop') {
      shouldStop = true;
      if (thinkingTimer) clearTimeout(thinkingTimer);
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

  if (state.current === STATE.AWAITING_CONFIRMATION) {
    const response = input.toLowerCase().trim();
    
    const pendingConf = getPendingConfirmation();
    if (pendingConf?.type === 'clearHistory') {
      if (response === 'y' || response === 'yes' || response === '确认') {
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
    
    if (response === 'y' || response === 'yes' || response === '确认') {
      println('[确认] 用户同意执行危险操作', 'green');
      resolveConfirmation(true);
    } else if (response === 'n' || response === 'no' || response === '拒绝') {
      println('[拒绝] 用户拒绝执行危险操作', 'red');
      resolveConfirmation(false);
    } else {
      println(`[提示] 请输入 ${printTag('y', 'bgGreen')} 确认或 ${printTag('n', 'bgRed')} 拒绝`, 'yellow');
    }
    return;
  }

  if (state.current === STATE.THINKING) {
    shouldStop = true;
    if (thinkingTimer) clearTimeout(thinkingTimer);
    isProcessing = false;
    println('\n[中断] 思考已停止，请输入消息...', 'yellow');
    state.current = STATE.AWAITING_INPUT;
    broadcast('agent-state', { state: 'idle' });
    return;
  }

  if (state.current === STATE.AWAITING_INPUT) {
    if (input) {
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
      broadcast('agent-state', { state: 'thinking' });
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

interface StreamChunk {
  reasoning?: string;
  content?: string;
}

async function thinkCycle(): Promise<void> {
  if (isProcessing) {
    return;
  }
  
  if (state.current !== STATE.THINKING) return;

  isProcessing = true;

  broadcast('agent-state', { state: 'thinking' });

  clearThoughtTrace();
  const cycleStep = traceStep('思考周期开始', { messageCount: getMessages().length }, 'running');

  try {
    const messages = getMessages();
    let fullResponse = '';
    let cleanFullResponse = '';
    let wantsToWait = false;

    resetReasoningTag();
    resetContentTag();

    const requestStep = traceStep('发送请求到 AI', { messageCount: messages.length }, 'running');

    const stream = streamChat(messages);
    let usage: { input: number; output: number } | null = null;
    while (true) {
      const iterResult = await stream.next();
      if (iterResult.done) {
        usage = iterResult.value;
        break;
      }
      const chunk = iterResult.value as StreamChunk;
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

    try {
      if (!usage) {
        const inputText = messages.map(m => m.content || '').join('');
        usage = {
          input: estimateTokens(inputText),
          output: estimateTokens(fullResponse)
        };
      } else if (!usage.output) {
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
      console.error('[Token] 统计失败:', (e as Error).message);
    }

    updateTraceStep(requestStep.id, { status: 'completed', details: { responseLength: fullResponse.length } });

    closeReasoning();
    resetContentTag();

    if (shouldStop) {
      shouldStop = false;
      printBlank();
      return;
    }

    parseAndPrintResponse(fullResponse);

    printBlank();

    if (fullResponse.includes('[WAIT]')) {
      wantsToWait = true;
      println('[等待] 我先不说了，等你说～', 'gray');
    }

    const parseStep = traceStep('解析工具调用', {}, 'running');
    const toolCalls = parseAllToolCalls(fullResponse);
    updateTraceStep(parseStep.id, { status: 'completed', details: { toolCallCount: toolCalls.length } });

    let finalResponse = fullResponse.split('\n').filter(line =>
      !line.trim().startsWith('[工具结果]:') &&
      !line.trim().startsWith('[工具错误]:')
    ).join('\n');

    const toolResults: string[] = [];

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        if (shouldStop) {
          println('[中断] 工具执行已停止', 'yellow');
          break;
        }

        broadcast('agent-reply', { type: 'tool-start', tool: toolCall.tool, args: toolCall.args });

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

    const integrateStep = traceStep('整合结果', { toolResultCount: toolResults.length }, 'running');

    addAssistantMessage(finalResponse);

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
      // AI 回复没有 [WAIT] 也没有工具调用
      // 如果回复有实质内容，自动视为等待用户（兜底 [WAIT] 遗漏）
      const cleanReply = extractCleanReply(finalResponse);
      if (cleanReply && cleanReply.length > 0) {
        consecutiveCycleCount = 0;
        state.current = STATE.AWAITING_INPUT;
        if (_replyCallback) {
          _replyCallback(cleanReply);
          _replyCallback = null;
        }
        broadcast('agent-reply', { type: 'end', nextAction: 'wait' });
        broadcast('agent-state', { state: 'idle' });
      } else {
        consecutiveCycleCount++;
        if (consecutiveCycleCount >= MAX_CONSECUTIVE_CYCLES) {
          consecutiveCycleCount = 0;
          state.current = STATE.AWAITING_INPUT;
          if (_replyCallback) {
            const reply = extractCleanReply(finalResponse);
            if (reply) _replyCallback(reply);
            _replyCallback = null;
          }
          broadcast('agent-reply', { type: 'end', nextAction: 'wait' });
          broadcast('agent-state', { state: 'idle' });
          println('[系统] 已连续思考多轮，先听你说～', 'gray');
        } else {
          scheduleNextCycle();
        }
      }
    }

  } catch (error) {
    updateTraceStep(cycleStep.id, { status: 'failed', details: { error: (error as Error).message } });
    _replyCallback = null;
    if (shouldStop) {
      shouldStop = false;
      return;
    }
    println(`[错误] ${(error as Error).message}`, 'red');
  } finally {
    isProcessing = false;
  }
}

function scheduleNextCycle(): void {
  if (thinkingTimer) clearTimeout(thinkingTimer);
  thinkingTimer = setTimeout(async () => {
    if (state.current === STATE.THINKING) {
      await thinkCycle();
      scheduleNextCycle();
    }
  }, thoughtInterval);
}

async function start(): Promise<void> {
  const cfg = loadConfig();
  thoughtInterval = cfg.chat?.thinkingInterval || 3000;

  initializeSession();

  const envPersona = process.env.COGITO_PERSONA;
  if (envPersona) {
    // 仅复制 persona 文件，不重置对话（避免清空已有会话历史）
    const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
    const personaPath = path.resolve(process.cwd(), 'personas', envPersona, 'persona.md');
    const targetPath = path.resolve(DATA_DIR, 'persona.md');
    try {
      if (existsSync(personaPath)) {
        const content = readFileSync(personaPath, 'utf-8');
        writeFileSync(targetPath, content, 'utf-8');
        console.log(`[Agent] Persona 文件已复制: ${envPersona}`);
      }
    } catch (err) {
      console.error(`[Agent] Persona 文件复制失败:`, err);
    }
  }

  if (process.env.DISABLE_WS !== 'true') {
    try {
      await startWsServer(9527);
      onMessage((msg: { type: string; text?: string }) => {
        if (msg.type === 'user-message' && msg.text) {
          recordMessage();
          handleUserInput(msg.text);
        }
      });
      onStatsRequest((payload: { type?: string; limit?: number } | null) => {
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
  executeTool,
  TOOL_OUTPUT_LIMITS,
  STATE,
  traceStep,
  updateTraceStep,
  clearThoughtTrace,
  getThoughtTrace
};