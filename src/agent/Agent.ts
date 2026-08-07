import { streamChat } from '../api/client.ts';
import { createRequire } from 'module';
import * as tools from './tools/index.ts';

// 从 package.json 读取应用版本，避免在多个位置硬编码导致版本号漂移。
// Electron 运行时可改用 app.getVersion()，CLI/测试环境下回退到包内版本。
const APP_VERSION: string = (() => {
  try {
    if (process.env.npm_package_version) return process.env.npm_package_version;
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as { version?: string };
    return pkg.version || '2.3.2';
  } catch {
    return '2.3.2';
  }
})();
import {
  getMessages,
  addUserMessage,
  addAssistantMessage,
  addToolResultMessage,
  shouldCompress,
  compressHistory,
  initializeSession,
  estimateTokens,
  resetConversation,
  updateSystemPrompt,
  listSessions,
} from './session.ts';
import { reloadConfig } from '../config.ts';
import {
  init,
  showPrompt,
  println,
  printBlank,
  printBanner,
  printDivider,
  printTag,
  printReasoning,
  resetReasoningTag,
  closeReasoning,
  resetContentTag,
  printToolBlock,
  exit,
} from '../io/terminal.ts';
import {
  setReplyCallback,
  deliverReply,
  extractCleanReply,
  parseAndPrintResponse,
  setCurrentReplyKey,
  getCurrentReplyKey,
} from './reply.ts';
import { loadConfig } from '../config.ts';
import {
  startWsServer,
  broadcast,
  onMessage,
  onStatsRequest,
  onToolsRequest,
} from '../io/ws-server.ts';
import {
  recordToolCall,
  recordMessage,
  recordTokenUsage,
  getToolStats,
  getSessionStats,
  getToolUsageByCategory,
  getTopUsedTools,
  getMergedDailyHistory,
} from './stats.ts';
import {
  STATE,
  isAwaitingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
  requestConfirmation,
  resolveConfirmation,
  cancelConfirmation,
  state,
} from './state.ts';
import {
  TOOL_REGISTRY,
  isDangerousOperation,
  isConfirmEnabled,
  getDangerousOperationHint,
  getToolsOverview,
  preprocessToolArgs,
} from './registry.ts';
import {
  handleCommand,
  printHelp,
  printStatus,
  printClearConfirm,
  switchPersona,
  listPersonas,
  listTools,
  printConfig,
  toggleDebug,
} from './commands.ts';
import { orchestrator } from './orchestrator.ts';
import { initWechatChannel } from './wechat-manager.ts';
import { parseArgs, parseToolCall, parseAllToolCalls } from './tool-parser.ts';
import {
  TOOL_OUTPUT_LIMITS,
  formatToolResult,
  classifyToolError,
  formatToolError,
} from './tool-utils.ts';
import { traceStep, updateTraceStep, clearThoughtTrace, getThoughtTrace } from './thought-trace.ts';
import { applyPersona, getCurrentPersonaTitle } from './persona.ts';
import { loadPlugins } from './plugin.ts';
import type { Message } from '../types/index.ts';

let thinkingTimer: ReturnType<typeof setTimeout> | null = null;
let shouldStop = false;
let isProcessing = false;
// 当前工具执行的 AbortController：/stop 时 abort，让 executeTool 通过 Promise.race
// 立即返回中断结果，而不必等待单个工具（如 executeCode 跑 30s）执行完毕。
let toolAbortController: AbortController | null = null;
let consecutiveCycleCount = 0;
let thoughtInterval = 3000;

const MAX_CONSECUTIVE_CYCLES = 8;

interface ToolExecutionResult {
  success: boolean;
  data?: string;
  error?: string;
  toolName?: string;
  timestamp?: string;
  errorType?: string;
}

async function executeTool(
  toolName: string,
  args: unknown,
  signal?: AbortSignal,
): Promise<ToolExecutionResult> {
  const registry = TOOL_REGISTRY[toolName];
  const startTime = Date.now();

  if (!registry) {
    const duration = (Date.now() - startTime) / 1000;
    recordToolCall(toolName, 'unknown', false, duration);
    return {
      success: false,
      error: `未知工具：${toolName}`,
      toolName,
      timestamp: new Date().toISOString(),
    };
  }

  if (isConfirmEnabled() && isDangerousOperation(toolName)) {
    const confirmed = await requestConfirmation(
      toolName,
      args as unknown[],
      getDangerousOperationHint(toolName),
    );
    if (!confirmed) {
      const duration = (Date.now() - startTime) / 1000;
      recordToolCall(toolName, registry.category, false, duration);
      return {
        success: false,
        error: '用户拒绝执行此危险操作',
        toolName,
        timestamp: new Date().toISOString(),
      };
    }
    state.current = STATE.THINKING;
  }

  const { fn, category } = registry;
  // 参数预处理（customArgs/parseJson/jsonParams）已提取到 registry.preprocessToolArgs，
  // 与 orchestrator.ts 共用同一份逻辑，避免子智能体场景跳过预处理导致工具异常。
  const processedArgs = preprocessToolArgs(toolName, args);

  try {
    // 把 signal 作为额外尾参传给工具函数，让支持中断的工具（如 runPython/executeCode）
    // 在 /stop 时真正终止底层进程，而不只是被 Promise.race 忽略结果。
    const toolPromise = signal
      ? fn(...(processedArgs as unknown[]), signal)
      : fn(...(processedArgs as unknown[]));
    // /stop 触发 signal.abort 时立即返回中断结果，不再等待单个工具执行完毕。
    // 注意：race 不会取消不支持 signal 的工具进程，但会解除 thinkCycle 的阻塞；长时工具
    // 自身仍有 maxExecutionTime 超时兜底。
    const result = signal
      ? await Promise.race([
          toolPromise,
          new Promise<never>((_, reject) => {
            if (signal.aborted) {
              reject(new Error('工具执行被用户中断'));
            } else {
              signal.addEventListener('abort', () => reject(new Error('工具执行被用户中断')), {
                once: true,
              });
            }
          }),
        ])
      : await toolPromise;
    const duration = (Date.now() - startTime) / 1000;

    if (result === undefined || result === null) {
      recordToolCall(toolName, category, true, duration);
      return {
        success: true,
        data: '执行完成（无返回值）',
        toolName,
        timestamp: new Date().toISOString(),
      };
    }

    if (typeof result === 'object' && 'success' in result) {
      const toolResult = result as ToolExecutionResult & Record<string, unknown>;
      recordToolCall(toolName, category, toolResult.success, duration);
      return {
        ...toolResult,
        toolName,
        timestamp: new Date().toISOString(),
      };
    }

    recordToolCall(toolName, category, true, duration);
    return {
      success: true,
      // 裸对象返回值（如 getSystemInfo 返回 SystemInfo）直接 String() 会变成
      // "[object Object]"，需与 formatToolResult 一致地序列化为可读 JSON。
      data: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result),
      toolName,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    recordToolCall(toolName, category, false, duration);
    return {
      success: false,
      error: formatToolError(error as Error, toolName),
      toolName,
      errorType: classifyToolError(error as Error),
      timestamp: new Date().toISOString(),
    };
  }
}

function handleUserInput(input: string, replyKey?: string): void {
  consecutiveCycleCount = 0;

  // 记录本轮回复目标：调用方传入 replyKey 时按来源隔离回调（微信通道）；
  // 未传入时一律清空，回复走终端而非微信通道——不依赖输入格式判断，
  // 避免微信格式消息漏传 replyKey 时 _currentReplyKey 保留旧值导致回复错发。
  if (replyKey !== undefined) {
    setCurrentReplyKey(replyKey);
  } else {
    setCurrentReplyKey(null);
  }

  if (input.toLowerCase() === 'exit') {
    exit();
    return;
  }

  if (input.startsWith('/')) {
    if (input === '/stop') {
      shouldStop = true;
      if (thinkingTimer) clearTimeout(thinkingTimer);
      // 中断正在执行的单个工具：abort 后 executeTool 的 Promise.race 立即返回
      if (toolAbortController) {
        toolAbortController.abort();
        toolAbortController = null;
      }
      // 若正在等待危险操作确认，必须 resolve 挂起的 Promise：否则 thinkCycle
      // 会卡在 await requestConfirmation 直到 5 分钟超时，期间 isProcessing 被置
      // false 后新的 thinkCycle 可能被调起，导致两个循环并发、状态机破裂。
      if (isAwaitingConfirmation()) {
        cancelConfirmation(); // resolve(false)，解除 thinkCycle 阻塞
        // 不在此处置 isProcessing=false：被解除阻塞的 thinkCycle 会经 shouldStop
        // 检查快速退出，其 finally 块会复位 isProcessing，避免与新周期并发。
      } else {
        isProcessing = false;
      }
      println('[中断] 思考已停止', 'yellow');
      state.current = STATE.AWAITING_INPUT;
      broadcast('agent-state', { state: 'idle' });
      showPrompt();
      return;
    }
    if (handleCommand(input)) {
      showPrompt();
      return;
    }
  }

  if (state.current === STATE.AWAITING_CONFIRMATION) {
    const response = input.toLowerCase().trim();

    const pendingConf = getPendingConfirmation();
    if (pendingConf?.type === 'clearHistory') {
      if (response === 'y' || response === 'yes' || response === '确认') {
        resetConversation();
        println('[成功] 对话历史已清空', 'green');
        setPendingConfirmation(null);
        state.current = STATE.THINKING;
        scheduleNextCycle();
      } else if (response === 'n' || response === 'no' || response === '拒绝') {
        println('[取消] 操作已取消', 'gray');
        setPendingConfirmation(null);
        state.current = STATE.THINKING;
        scheduleNextCycle();
      } else {
        println(
          `[提示] 请输入 ${printTag('y', 'bgGreen')} 确认或 ${printTag('n', 'bgRed')} 取消`,
          'yellow',
        );
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
      println(
        `[提示] 请输入 ${printTag('y', 'bgGreen')} 确认或 ${printTag('n', 'bgRed')} 拒绝`,
        'yellow',
      );
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
    showPrompt();
    return;
  }

  if (state.current === STATE.AWAITING_INPUT) {
    if (input) {
      const messages = getMessages();
      const hasUserMessage = messages.some((m) => m.role === 'user');
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
      println('[取消] 没有消息，返回等待输入', 'gray');
      return;
    }
    return;
  }
}

interface StreamChunk {
  reasoning?: string;
  content?: string;
}

// ---- thinkCycle 子函数（按职责拆分，避免 300 行 god function 难以维护）----

interface StreamResult {
  fullResponse: string;
  usage: { input: number; output: number } | null;
  stopped: boolean;
}

/**
 * 流式获取 AI 回复并累积内容。
 * 处理 streaming chunk 的 reasoning/content，过滤工具结果行，广播 chunk。
 * 若 /stop 在流式过程中触发，返回 stopped=true 让调用方提前退出。
 */
async function streamAndAccumulateResponse(messages: Message[]): Promise<StreamResult> {
  let fullResponse = '';
  let cleanFullResponse = '';
  let usage: { input: number; output: number } | null = null;

  resetReasoningTag();
  resetContentTag();

  const requestStep = traceStep('发送请求到 AI', { messageCount: messages.length }, 'running');
  const stream = streamChat(messages);

  while (true) {
    const iterResult = await stream.next();
    if (iterResult.done) {
      usage = iterResult.value;
      break;
    }
    const chunk = iterResult.value as StreamChunk;
    if (shouldStop) {
      // /stop 中断：复位 shouldStop，避免下次思考周期仍被标记为"应停止"，
      // 否则 AI 被打断后将永远无法再次回复（streamAndAccumulateResponse 一进入就 stopped）。
      shouldStop = false;
      printBlank();
      return { fullResponse, usage, stopped: true };
    }
    if (chunk.reasoning) {
      printReasoning(chunk.reasoning);
    }
    if (chunk.content) {
      const cleanChunk = chunk.content
        .split('\n')
        .filter(
          (line) =>
            !line.trim().startsWith('[工具结果]:') && !line.trim().startsWith('[工具错误]:'),
        )
        .join('\n');

      fullResponse += chunk.content;
      cleanFullResponse += cleanChunk;

      if (cleanChunk.trim()) {
        broadcast('agent-reply', { type: 'chunk', content: cleanChunk, full: cleanFullResponse });
      }
    }
  }

  updateTraceStep(requestStep.id, {
    status: 'completed',
    details: { responseLength: fullResponse.length },
  });

  return { fullResponse, usage, stopped: false };
}

/**
 * 记录并广播 token 使用量。
 * 若流式未返回 usage，则基于消息文本与回复文本估算。
 */
function recordAndBroadcastUsage(
  usage: { input: number; output: number } | null,
  messages: Message[],
  fullResponse: string,
): void {
  try {
    if (!usage) {
      const inputText = messages.map((m) => m.content || '').join('');
      usage = {
        input: estimateTokens(inputText),
        output: estimateTokens(fullResponse),
      };
    } else if (!usage.output) {
      usage.output = estimateTokens(fullResponse);
    }
    recordTokenUsage(usage.input, usage.output);
    println(
      `[Token] 输入:${usage.input} 输出:${usage.output} 总计:${usage.input + usage.output}`,
      'gray',
    );
    broadcast('token-usage', {
      input: usage.input,
      output: usage.output,
      total: usage.input + usage.output,
      session: getSessionStats(),
    });
  } catch (e) {
    console.error('[Token] 统计失败:', (e as Error).message);
  }
}

/**
 * 顺序执行工具调用列表，收集结果文本。
 * 每次工具执行前建立独立 AbortController，/stop 可通过 abort 中断。
 * shouldStop 在循环开头和结尾均检查，确保中断及时生效。
 */
async function executeAllToolCalls(
  toolCalls: ReturnType<typeof parseAllToolCalls>,
): Promise<string[]> {
  const toolResults: string[] = [];

  if (toolCalls.length === 0) {
    return toolResults;
  }

  for (const toolCall of toolCalls) {
    if (shouldStop) {
      println('[中断] 工具执行已停止', 'yellow');
      break;
    }

    broadcast('agent-reply', { type: 'tool-start', tool: toolCall.tool, args: toolCall.args });

    const toolStep = traceStep(`执行工具: ${toolCall.tool}`, { args: toolCall.args }, 'running');

    toolAbortController = new AbortController();
    const result = await executeTool(toolCall.tool, toolCall.args, toolAbortController.signal);
    toolAbortController = null;

    if (result.success) {
      const isEmpty =
        result.data === undefined ||
        result.data === null ||
        (typeof result.data === 'string' && result.data.trim() === '') ||
        (Array.isArray(result.data) && result.data.length === 0) ||
        (typeof result.data === 'object' && Object.keys(result.data).length === 0);

      if (isEmpty) {
        println(`[空结果] ${toolCall.tool} 返回空结果`, 'yellow');
        toolResults.push(`[工具结果]: [空结果] ${toolCall.tool} 返回空结果，未找到相关信息。`);
        broadcast('agent-reply', {
          type: 'tool-result',
          tool: toolCall.tool,
          success: true,
          data: '[空结果] 未找到相关信息',
          isEmpty: true,
        });
        updateTraceStep(toolStep.id, {
          status: 'completed',
          details: { success: true, isEmpty: true },
        });
      } else {
        const resultText = formatToolResult(toolCall.tool, result.data);
        printToolBlock(resultText, '工具结果');
        toolResults.push(`[工具结果]: ${resultText}`);
        broadcast('agent-reply', {
          type: 'tool-result',
          tool: toolCall.tool,
          success: true,
          data: resultText,
        });
        updateTraceStep(toolStep.id, {
          status: 'completed',
          details: { success: true, resultLength: resultText.length },
        });
      }
    } else {
      println(`[失败] ${result.error}`, 'red');
      toolResults.push(`[工具错误]: ${result.error}`);
      broadcast('agent-reply', {
        type: 'tool-result',
        tool: toolCall.tool,
        success: false,
        data: result.error,
      });
      updateTraceStep(toolStep.id, {
        status: 'failed',
        details: { success: false, error: result.errorType },
      });
    }

    if (shouldStop) {
      println('[中断] 工具执行已停止', 'yellow');
      break;
    }
  }

  return toolResults;
}

/**
 * 将 AI 回复与工具执行结果整合到对话历史。
 * 若历史过长则触发压缩。
 */
function integrateResults(finalResponse: string, toolResults: string[]): void {
  addAssistantMessage(finalResponse);

  if (toolResults.length > 0) {
    const toolResultMessage = `[系统返回的工具执行结果]\n${toolResults.join('\n\n')}\n[系统] 请基于以上工具执行结果继续回复，不要编造或猜测结果。`;
    addToolResultMessage(toolResultMessage);
  }

  if (shouldCompress()) {
    const compressStep = traceStep('压缩对话历史', {}, 'running');
    println('[系统] 正在压缩对话历史...', 'gray');
    compressHistory();
    println('[系统] 压缩完成', 'gray');
    updateTraceStep(compressStep.id, { status: 'completed' });
  }
}

/**
 * 周期结束后的状态转换。
 * 根据 wantsToWait / 是否有工具调用 / 回复是否有实质内容，决定：
 *   - 进入 AWAITING_INPUT 等待用户
 *   - 调度下一轮 thinkCycle（有工具调用或无实质回复）
 *   - 达到连续思考上限时强制等待用户
 */
function transitionAfterCycle(
  wantsToWait: boolean,
  toolCalls: ReturnType<typeof parseAllToolCalls>,
  finalResponse: string,
): void {
  if (wantsToWait || state.current !== STATE.THINKING) {
    state.current = STATE.AWAITING_INPUT;
    const nextAction = wantsToWait ? 'wait' : 'continue';
    if (getCurrentReplyKey()) {
      const cleanReply = extractCleanReply(finalResponse);
      if (cleanReply) deliverReply(cleanReply);
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
      if (getCurrentReplyKey()) {
        deliverReply(cleanReply);
      }
      broadcast('agent-reply', { type: 'end', nextAction: 'wait' });
      broadcast('agent-state', { state: 'idle' });
    } else {
      consecutiveCycleCount++;
      if (consecutiveCycleCount >= MAX_CONSECUTIVE_CYCLES) {
        consecutiveCycleCount = 0;
        state.current = STATE.AWAITING_INPUT;
        if (getCurrentReplyKey()) {
          const reply = extractCleanReply(finalResponse);
          if (reply) deliverReply(reply);
        }
        broadcast('agent-reply', { type: 'end', nextAction: 'wait' });
        broadcast('agent-state', { state: 'idle' });
        println('[系统] 已连续思考多轮，先听你说～', 'gray');
      } else {
        scheduleNextCycle();
      }
    }
  }
}

/**
 * 思考周期主流程：流式获取回复 → 记录 token → 解析工具调用 → 执行工具 → 整合结果 → 状态转换。
 * 具体逻辑拆分到上方命名子函数，此处仅做编排与异常处理。
 */
async function thinkCycle(): Promise<void> {
  if (isProcessing) return;
  if (state.current !== STATE.THINKING) return;

  isProcessing = true;
  broadcast('agent-state', { state: 'thinking' });

  clearThoughtTrace();
  const cycleStep = traceStep('思考周期开始', { messageCount: getMessages().length }, 'running');

  try {
    const messages = getMessages();

    // 1. 流式获取回复
    const streamResult = await streamAndAccumulateResponse(messages);
    if (streamResult.stopped) return;

    const { fullResponse, usage } = streamResult;

    // 2. 记录 token 使用量
    recordAndBroadcastUsage(usage, messages, fullResponse);

    closeReasoning();
    resetContentTag();

    if (shouldStop) {
      shouldStop = false;
      printBlank();
      return;
    }

    parseAndPrintResponse(fullResponse);
    printBlank();

    const wantsToWait = fullResponse.includes('[WAIT]');
    if (wantsToWait) {
      println('[等待] 我先不说了，等你说～', 'gray');
    }

    // 3. 解析工具调用
    const parseStep = traceStep('解析工具调用', {}, 'running');
    const toolCalls = parseAllToolCalls(fullResponse);
    updateTraceStep(parseStep.id, {
      status: 'completed',
      details: { toolCallCount: toolCalls.length },
    });

    const finalResponse = fullResponse
      .split('\n')
      .filter(
        (line) => !line.trim().startsWith('[工具结果]:') && !line.trim().startsWith('[工具错误]:'),
      )
      .join('\n');

    // 4. 执行工具调用
    const toolResults = await executeAllToolCalls(toolCalls);

    // 5. 整合结果到对话历史
    const integrateStep = traceStep('整合结果', { toolResultCount: toolResults.length }, 'running');
    integrateResults(finalResponse, toolResults);
    updateTraceStep(integrateStep.id, { status: 'completed' });

    updateTraceStep(cycleStep.id, {
      status: 'completed',
      details: {
        nextAction: wantsToWait ? 'wait' : toolCalls.length > 0 ? 'tools' : 'continue',
      },
    });

    // 6. 状态转换
    transitionAfterCycle(wantsToWait, toolCalls, finalResponse);
  } catch (error) {
    updateTraceStep(cycleStep.id, {
      status: 'failed',
      details: { error: (error as Error).message },
    });
    if (getCurrentReplyKey()) {
      deliverReply('抱歉，处理您的消息时出错：' + (error as Error).message);
    }
    if (shouldStop) {
      shouldStop = false;
      return;
    }
    println(`[错误] ${(error as Error).message}`, 'red');
    state.current = STATE.AWAITING_INPUT;
    broadcast('agent-reply', { type: 'end', nextAction: 'wait' });
    broadcast('agent-state', { state: 'idle' });
    showPrompt();
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
    if (applyPersona(envPersona)) {
      console.log(`[Agent] Persona 文件已复制: ${envPersona}`);
    } else {
      console.warn(`[Agent] Persona 文件复制失败或不存在: ${envPersona}`);
    }
  } else {
    // 无人设：不复制文件，system-prompt 构建时会自动回退读取
    // 人设根目录 personas/persona.md 作为默认人设（避免污染项目根目录）
    console.log('[Agent] 无人设，使用默认人设 personas/persona.md');
  }

  // 自动加载科学插件
  (async () => {
    const result = await loadPlugins();
    if (result.loaded > 0) {
      console.log(`[Agent] 已加载 ${result.loaded} 个科学插件`);
    }
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.warn(`[Agent] 插件加载失败: ${err.name} - ${err.error}`);
      }
    }
  })();

  if (process.env.DISABLE_WS !== 'true') {
    try {
      await startWsServer(9527);
      onMessage((msg: Record<string, unknown>) => {
        if (msg.type === 'update-language') {
          reloadConfig();
          updateSystemPrompt();
          console.log('[Agent] System prompt 语言已刷新');
          return;
        }
        if (msg.type === 'user-message' && typeof msg.text === 'string') {
          recordMessage();
          handleUserInput(msg.text);
        }
      });
      onToolsRequest(() => getToolsOverview());
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
        } else if (payload?.type === 'dailyHistory') {
          return { data: getMergedDailyHistory(payload?.limit || 365) };
        } else if (payload?.type === 'tokens') {
          const s = getSessionStats();
          return {
            data: {
              totalInputTokens: s.totalInputTokens,
              totalOutputTokens: s.totalOutputTokens,
              totalTokens: s.totalTokens,
              todayInputTokens: s.todayInputTokens,
              todayOutputTokens: s.todayOutputTokens,
              todayTokens: s.todayTokens,
            },
          };
        }
        return {
          toolUsage: getToolUsageByCategory(),
          topTools: getTopUsedTools(10),
          session: getSessionStats(),
          thoughtTrace: getThoughtTrace(),
          cluster: orchestrator.getClusterStatus(),
          dailyHistory: getMergedDailyHistory(365),
        };
      });
    } catch {
      console.log('[WS] WebSocket 启动失败，跳过（桌面端不可用）');
    }
  } else {
    console.log('[WS] WebSocket 服务已禁用（CLI 模式）');
  }

  printBanner({
    version: APP_VERSION,
    persona: cfg.persona || getCurrentPersonaTitle(),
    workspace: tools.getBasePath(),
    sessions: listSessions().length,
    mode: process.env.CLI_MODE ? 'CLI' : process.env.ELECTRON_MODE ? 'Electron' : 'CLI',
  });
  printDivider('─', 'cyan');
  println(
    '  活动范围: ' +
      printTag(tools.getBasePath(), 'bgBlue') +
      '  思考间隔: ' +
      printTag(`${thoughtInterval / 1000}秒`, 'bgCyan'),
  );
  println(
    '  输入 ' +
      printTag('/sessions', 'bgBlue') +
      ' 管理多会话，输入 ' +
      printTag('/help', 'bgBlue') +
      ' 查看所有命令\n',
    'gray',
  );
  printDivider('─', 'cyan');
  println(
    '  按 ' +
      printTag('Enter', 'bgBlue') +
      ' 打断思考，输入 ' +
      printTag('exit', 'bgBlue') +
      ' 退出\n',
    'gray',
  );

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
  getThoughtTrace,
};
