import { streamChatNative } from '../api/client.ts';
import type { NativeStreamReturn } from '../api/client.ts';
import { safeParseJSON } from '../utils/llm-validator.ts';
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
  addAssistantNativeMessage,
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
  onCleanup,
} from '../io/terminal.ts';
import { setReplyCallback, deliverReply, setCurrentReplyKey, getCurrentReplyKey } from './reply.ts';
import { loadConfig } from '../config.ts';
import {
  startWsServer,
  stopWsServer,
  broadcast,
  onMessage,
  onStatsRequest,
  onToolsRequest,
  onStatusSnapshot,
} from '../io/ws-server.ts';
import { laneQueue, AGENT_LANE_KEY } from './lane.ts';
import { channelManager } from './channels/index.ts';
import { startHeartbeat, getHeartbeatStatus } from './heartbeat.ts';
import { startWebhookServer, stopWebhookServer } from '../io/webhook.ts';
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
import {
  TOOL_OUTPUT_LIMITS,
  formatToolResult,
  classifyToolError,
  formatToolError,
} from './tool-utils.ts';
import { traceStep, updateTraceStep, clearThoughtTrace, getThoughtTrace } from './thought-trace.ts';
import { getCurrentPersonaTitle, applyPersona } from './persona.ts';
import { loadPlugins, getToolPermission } from './plugin.ts';
import {
  buildOpenAITools,
  objectArgsToPositional,
  validateToolArgs,
  toRichError,
} from './tool-schema.ts';
import { getEnabledToolNames } from './registry.ts';
import { formatCost, getModelPricing } from '../api/router.ts';
import { evaluateBudget } from './budget.ts';
import {
  classifyTool,
  predictNextTool,
  sameToolInvocation,
  contextSignature,
  getGlobalPatternStore,
  PatternStore,
} from './speculation.ts';
import type { Message, NativeToolInvocation } from '../types/index.ts';

let thinkingTimer: ReturnType<typeof setTimeout> | null = null;
let shouldStop = false;
let isProcessing = false;
// 思考周期所有权令牌：每次 thinkCycle 真正开始处理时自增并捕获自己的 id，
// finally 中仅当自己仍是当前周期时才复位 isProcessing。防止旧周期在中断后
// 仍处于飞行中、新周期已启动时，旧周期的 finally 误清新周期的标志导致并发。
let cycleSeq = 0;
// 当前工具执行的 AbortController：/stop 时 abort，让 executeTool 通过 Promise.race
// 立即返回中断结果，而不必等待单个工具（如 executeCode 跑 30s）执行完毕。
let toolAbortController: AbortController | null = null;
// 推测执行（R2.7）的 AbortController：此前传入 `new AbortController().signal`，
// 该 controller 无人持有、永不 abort，导致 /stop 后预执行的工具仍在后台跑完。
let speculativeAbortController: AbortController | null = null;

/** 中断正在进行的工具执行与推测预执行（用于 /stop、中断、周期退出） */
function abortInFlightTools(): void {
  if (toolAbortController) {
    toolAbortController.abort();
    toolAbortController = null;
  }
  if (speculativeAbortController) {
    speculativeAbortController.abort();
    speculativeAbortController = null;
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

  // R5.2 权限门禁：这是所有工具执行的必经咽喉点（原生工具调用 / 推测执行 / 插件 / MCP
  // 注册的工具最终都落到这里），配置 tools.permissions 与插件 defaultPermission 在此生效。
  // deny 直接拒绝；ask 需一次用户授权。
  const permission = getToolPermission(toolName);
  if (permission === 'deny') {
    const duration = (Date.now() - startTime) / 1000;
    recordToolCall(toolName, registry.category, false, duration);
    return {
      success: false,
      error: `工具 ${toolName} 已被权限策略禁用`,
      toolName,
      timestamp: new Date().toISOString(),
    };
  }

  // ask 与危险操作确认合并为一次询问，避免同一次调用弹两次授权框。
  const needsDangerConfirm = isConfirmEnabled() && isDangerousOperation(toolName);
  if (permission === 'ask' || needsDangerConfirm) {
    const confirmed = await requestConfirmation(
      toolName,
      args as unknown[],
      needsDangerConfirm
        ? getDangerousOperationHint(toolName)
        : `工具 ${toolName} 已配置为需要授权后执行`,
    );
    if (!confirmed) {
      const duration = (Date.now() - startTime) / 1000;
      recordToolCall(toolName, registry.category, false, duration);
      return {
        success: false,
        error: needsDangerConfirm ? '用户拒绝执行此危险操作' : `用户拒绝授权工具 ${toolName}`,
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
      // 中断正在执行的单个工具与推测预执行：abort 后 executeTool 的 Promise.race 立即返回
      abortInFlightTools();
      // 若正在等待危险操作确认，必须 resolve 挂起的 Promise：否则 thinkCycle
      // 会卡在 await requestConfirmation 直到 5 分钟超时。解除后旧周期经 shouldStop
      // 检查自行退出并由其 finally 复位 isProcessing（所有权令牌保证不误清新周期）。
      if (isAwaitingConfirmation()) {
        cancelConfirmation(); // resolve(false)，解除 thinkCycle 阻塞
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
    // 防御性检查：state 可能因微任务竞态（连续工具确认时，前一个工具的
    // executeTool 将 state 重置为 THINKING 的微任务在后一个工具的
    // requestConfirmationExclusive 设置 AWAITING_CONFIRMATION 之后执行）
    // 显示为 THINKING，但实际上有挂起的确认等待响应。
    // 此时如果当作普通打断处理，y/n 会被 addUserMessage 入队破坏对话历史，
    // 且 cancelConfirmation 因 isAwaitingConfirmation() 为 false 不会被调用，
    // confirmationResolve 永不触发 → 旧周期永久卡死 → isProcessing 永不复位
    // → scheduleNextCycle 重试耗尽 → "上一思考周期长时间未退出，放弃本次调度"。
    if (input && getPendingConfirmation() !== null) {
      // 将输入当作确认响应处理，走 AWAITING_CONFIRMATION 分支逻辑。
      // 注：不直接 continue/fall-through，需显式调用 handleUserInput 自身的
      // AWAITING_CONFIRMATION 分支（但 handleUserInput 是入口函数不可自调）。
      // 直接在此内联确认响应逻辑，与 AWAITING_CONFIRMATION 分支保持一致。
      const response = input.toLowerCase().trim();
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

    shouldStop = true;
    if (thinkingTimer) clearTimeout(thinkingTimer);
    // 中断正在执行的工具与推测预执行：abort 让 executeTool 尽快返回，缩短旧周期的退出路径
    abortInFlightTools();
    // 若正在等待危险操作确认，同样需要解除挂起的 Promise，否则旧周期卡死
    if (isAwaitingConfirmation()) {
      cancelConfirmation();
    }
    // 注意：此处不再立即 isProcessing=false。旧周期（thinkCycle 的 finally）
    // 会在 shouldStop 检查后自行退出并复位 isProcessing——由周期所有权令牌保证
    // 只有「仍持有当前周期」的 finally 才允许复位。立即置 false 会让旧周期仍
    // 卡在网络/工具等待期间，新的 thinkCycle 并发启动，造成工具重复执行。

    // 带内容的打断（终端输入了文字、微信/Webhook/心跳等非终端来源推送了消息）：
    // 此前实现只中断不入队，消息文本被整条丢弃——非终端来源尤其致命，因为
    // 发送方不知道消息已丢。改为中断旧周期后把消息入队并调度新周期。
    if (input) {
      println(`\n[中断] 已停止上一轮思考，接管新消息`, 'yellow');
      println(`[消息] ${input}`, 'yellow');
      addUserMessage(input);
      state.current = STATE.THINKING;
      broadcast('agent-state', { state: 'thinking' });
      scheduleNextCycle();
      return;
    }

    println('\n[中断] 思考已停止，请输入消息...', 'yellow');
    state.current = STATE.AWAITING_INPUT;
    broadcast('agent-state', { state: 'idle' });
    showPrompt();
    return;
  }

  if (state.current === STATE.AWAITING_INPUT) {
    if (input) {
      println(`[消息] ${input}`, 'yellow');
      addUserMessage(input);
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

// =============================================================
// 原生函数调用协议（R1.2 / R1.6 / R1.9 / R2.x）
// 模型通过原生 function calling 调用 JSON Schema 描述的工具，不使用任何文本标记。
// =============================================================

function buildNativeApiMessages(): Array<Record<string, unknown>> {
  return getMessages().map((msg) => {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
    }
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.tool_call_id,
      };
    }
    return { role: msg.role, content: msg.content };
  });
}

/**
 * 执行单个原生工具调用：校验 schema → 转位置参数 → 执行 → 归一化结果。
 * 校验失败时不执行，返回供模型修正的错误文本（R1.6）；执行错误附富化错误码（R1.9）。
 */
async function executeNativeInvocation(
  call: NativeToolInvocation,
  signal?: AbortSignal,
): Promise<{ content: string; success: boolean }> {
  let parsedArgs: Record<string, unknown>;
  try {
    const json = JSON.parse(call.argsJson);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('arguments 必须是 JSON 对象');
    }
    parsedArgs = json as Record<string, unknown>;
  } catch {
    return {
      success: false,
      content: `[工具错误]: 参数 JSON 解析失败(${call.argsJson.slice(0, 120)})`,
    };
  }

  if (!TOOL_REGISTRY[call.name]) {
    return { success: false, content: `[工具错误]: 未知工具：${call.name}` };
  }

  const validationErrors = validateToolArgs(call.name, parsedArgs);
  if (validationErrors.length > 0) {
    const rich = toRichError(
      'EINVALID',
      `工具 ${call.name} 参数校验失败（${validationErrors.join('；')}）`,
    );
    return { success: false, content: `[工具错误]: ${rich.message}` };
  }

  const positional = objectArgsToPositional(call.name, parsedArgs);
  const result = await executeTool(call.name, positional, signal);

  if (result.success) {
    const isEmpty =
      result.data === undefined ||
      result.data === null ||
      (typeof result.data === 'string' && result.data.trim() === '');
    return {
      success: true,
      content: isEmpty
        ? `[工具结果]: [空结果] ${call.name} 返回空结果，未找到相关信息。`
        : `[工具结果]: ${formatToolResult(call.name, result.data)}`,
    };
  }

  const register = TOOL_REGISTRY[call.name];
  const rich =
    register?.richErrors?.enabled === false
      ? result.error || '执行失败'
      : toRichError(result.errorType || '', result.error || '').message;
  return { success: false, content: `[工具错误]: ${rich}` };
}

/**
 * 并行执行多个原生工具调用（R2.6），并按原始顺序注入 tool 结果消息。
 * 事件中断时所有在途工具经共享 AbortController 尽快返回。
 */
async function executeNativeToolCallsServer(invocations: NativeToolInvocation[]): Promise<void> {
  // 若上一轮调用未正常退出（旧周期残留），其 controller 可能仍是未 abort 的悬空引用；
  // 必须在创建新 controller 前 abort 旧 controller，否则旧工具调用会在后台继续执行，
  // 且 /stop 只能 abort 新 controller，导致旧工具泄漏。
  if (toolAbortController) {
    try {
      toolAbortController.abort();
    } catch {
      /* ignore */
    }
  }
  const controller = new AbortController();
  toolAbortController = controller;

  const settled = await Promise.allSettled(
    invocations.map(async (call) => {
      // 每个工具调用单独广播 tool-start 并携带真实 tool/args，
      // 否则渲染端 addToolCall(undefined, undefined) 会显示 `undefined(undefined)`。
      broadcast('agent-reply', { type: 'tool-start', tool: call.name, args: call.args });
      const toolStep = traceStep(`执行工具: ${call.name}`, { args: call.args }, 'running');
      const outcome = await executeNativeInvocation(call, controller.signal);
      if (outcome.success) {
        printToolBlock(outcome.content.replace(/^\[工具结果\]:\s*/, ''), '工具结果');
        broadcast('agent-reply', {
          type: 'tool-result',
          tool: call.name,
          success: true,
          data: outcome.content.replace(/^\[工具结果\]:\s*/, ''),
        });
        updateTraceStep(toolStep.id, { status: 'completed' });
      } else {
        println(`[失败] ${outcome.content.replace(/^\[工具错误\]:\s*/, '')}`, 'red');
        broadcast('agent-reply', {
          type: 'tool-result',
          tool: call.name,
          success: false,
          data: outcome.content,
        });
        updateTraceStep(toolStep.id, { status: 'failed' });
      }
      return outcome;
    }),
  );

  toolAbortController = null;

  for (let i = 0; i < invocations.length; i++) {
    const outcome =
      settled[i]?.status === 'fulfilled'
        ? (settled[i] as PromiseFulfilledResult<{ content: string; success: boolean }>).value
        : { content: '[工具错误]: 工具执行异常中断', success: false };
    addToolResultMessage(outcome.content, { toolCallId: invocations[i].id });
  }
}

/**
 * 推测命中时提交预执行结果（R2.7）：复用已完成的只读/幂等工具结果，避免重复执行。
 * 广播与落盘逻辑与 executeNativeToolCallsServer 单调用一致。
 */
function commitSpeculativeResult(
  invocation: NativeToolInvocation,
  outcome: { content: string; success: boolean },
): void {
  broadcast('agent-reply', { type: 'tool-start', tool: invocation.name, args: invocation.args });
  if (outcome.success) {
    printToolBlock(outcome.content.replace(/^\[工具结果\]:\s*/, ''), '工具结果');
    broadcast('agent-reply', {
      type: 'tool-result',
      tool: invocation.name,
      success: true,
      data: outcome.content.replace(/^\[工具结果\]:\s*/, ''),
    });
  } else {
    println(`[失败] ${outcome.content.replace(/^\[工具错误\]:\s*/, '')}`, 'red');
    broadcast('agent-reply', {
      type: 'tool-result',
      tool: invocation.name,
      success: false,
      data: outcome.content,
    });
  }
  addToolResultMessage(outcome.content, { toolCallId: invocation.id });
}

async function runNativeTurnLoop(): Promise<void> {
  const cfg = loadConfig();
  const budget = cfg.chat?.budget || {};
  // 单轮工具步数安全上限；与 DEFAULT_CONFIG.chat.budget.maxSteps 保持一致。
  // 仅作兜底，正常情况由配置（含用户覆盖）提供。
  const DEFAULT_MAX_STEPS = 20;
  const maxSteps = budget.maxSteps ?? DEFAULT_MAX_STEPS;
  const tokenBudget = budget.maxTokens || 0;
  const costBudget = budget.costBudget || 0;

  // 若配置了花费预算但当前模型无价格数据，提前告警一次（否则预算恒不触发）。
  if (costBudget > 0) {
    const pricing = getModelPricing();
    if (pricing.inputPerMillion === 0 && pricing.outputPerMillion === 0) {
      console.warn(
        '[预算] 已配置 costBudget，但当前模型不在价格表且无 COGITO_MODEL_PRICE_IN/OUT 覆盖，' +
          '花费估算恒为 $0，预算不会触发。请在价格表或环境变量补充该模型单价。',
      );
    }
  }

  const openaiTools = buildOpenAITools(getEnabledToolNames(), {
    strict: cfg.chat?.structuredOutput?.strict === true,
  });
  const reasoningEffort = cfg.chat?.reasoningEffort;

  // R1.8 结构化输出（strict 合规模式）：开启时把最终输出约束为 json_schema。
  // schema 取配置或默认 { result: string }（OpenAI strict 要求 additionalProperties:false + 全字段必填）。
  // 仅当 structuredOutput.strict 为真时启用，对普通对话无影响（opt-in）。
  const so = cfg.chat?.structuredOutput;
  const responseFormat =
    so?.strict === true
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'agent_output',
            strict: true,
            schema:
              (so.schema as {
                type: string;
                properties: Record<string, unknown>;
                required: string[];
              }) ||
              ({
                type: 'object',
                properties: { result: { type: 'string' } },
                required: ['result'],
                additionalProperties: false,
              } as unknown as {
                type: string;
                properties: Record<string, unknown>;
                required: string[];
              }),
          },
        }
      : undefined;

  let step = 0;
  let tokensUsed = 0;
  let costUsed = 0;

  while (state.current === STATE.THINKING) {
    const cycleStep = traceStep(
      `原生工具调用轮次 ${step + 1}`,
      { messageCount: getMessages().length },
      'running',
    );

    // R2.7/R2.8 推测执行：主模型推理期间并行跑草稿模型预测下一步工具调用。
    // 仅对「只读/幂等」工具预执行；主模型返回后若预测命中复用推测结果，否则无损回退。
    const sig = contextSignature(getMessages());
    const spec = cfg.chat?.speculative;
    const patternStore: PatternStore = getGlobalPatternStore();
    const speculateExplicit = spec?.enabled === true;
    const autoLearn = spec?.auto === true;
    const confThreshold = spec?.confidenceThreshold ?? 0.8;
    const minSamples = spec?.minSamples ?? 5;
    const confident = autoLearn && patternStore.shouldSpeculate(sig, confThreshold, minSamples);
    const runPrediction = speculateExplicit || autoLearn;
    const shouldPreExec = speculateExplicit || confident;

    let predictionPromise: Promise<NativeToolInvocation | null> | null = null;
    let speculativeTask: Promise<{
      predicted: NativeToolInvocation;
      outcome: { content: string; success: boolean };
    }> | null = null;

    if (runPrediction) {
      const draftModel = spec?.draftModel || cfg.api.model;
      predictionPromise = predictNextTool(buildNativeApiMessages(), openaiTools, draftModel).then(
        (pred) => {
          // R5.2：推测执行是"猜测"阶段的预执行，只对权限为 allow 的工具进行。
          // 否则 ask 类工具会因一次猜测就弹出授权框，deny 类工具则可能被提前执行。
          if (
            pred &&
            shouldPreExec &&
            classifyTool(pred.name) === 'speculatable' &&
            getToolPermission(pred.name) === 'allow'
          ) {
            const safePred = pred; // 已收窄为 NativeToolInvocation，供 .then/.catch 闭包安全引用
            // 新周期启动前，必须 abort 上一轮残留的 speculativeAbortController；
            // 否则旧 controller 成为无人持有的孤儿引用，其信号永不触发，
            // 预执行的工具调用在旧周期已退出后仍在后台消耗 CPU/IO。
            if (speculativeAbortController) {
              try {
                speculativeAbortController.abort();
              } catch {
                /* ignore */
              }
            }
            speculativeAbortController = new AbortController();
            speculativeTask = executeNativeInvocation(safePred, speculativeAbortController.signal)
              .then((outcome) => ({ predicted: safePred, outcome }))
              .catch((err) => ({
                predicted: safePred,
                outcome: { content: `[工具错误]: 推测执行失败 ${String(err)}`, success: false },
              }));
          }
          return pred;
        },
      );
    }

    const stream = streamChatNative(buildNativeApiMessages(), {
      tools: openaiTools,
      ...(responseFormat ? { responseFormat } : {}),
      ...(reasoningEffort && reasoningEffort !== 'none' ? { reasoningEffort } : {}),
      ...(cfg.chat?.verbosity ? { verbosity: cfg.chat.verbosity } : {}),
      ...(cfg.chat?.thinking ? { thinking: cfg.chat.thinking } : {}),
    });

    let content = '';
    let cleanContent = '';
    resetReasoningTag();
    resetContentTag();

    let result!: NativeStreamReturn;
    while (true) {
      const iterResult = await stream.next();
      if (iterResult.done) {
        result = iterResult.value;
        break;
      }
      const chunk = iterResult.value as { content: string | null; reasoning: string | null };
      if (shouldStop) {
        shouldStop = false;
        // 必须显式 return 生成器：直接 `return` 会抛弃生成器而不触发其 finally，
        // SSE reader 不会被 cancel，底层 TCP 连接一直挂着不归还连接池。
        try {
          await stream.return({ input: 0, output: 0, stopReason: 'aborted', toolCalls: [] });
        } catch {
          /* 生成器已结束 */
        }
        // 同时取消可能仍在后台跑的推测预执行
        abortInFlightTools();
        printBlank();
        return;
      }
      if (chunk.reasoning) printReasoning(chunk.reasoning);
      if (chunk.content) {
        const cleanChunk = chunk.content
          .split('\n')
          .filter(
            (line) =>
              !line.trim().startsWith('[工具结果]:') && !line.trim().startsWith('[工具错误]:'),
          )
          .join('\n');
        content += chunk.content;
        cleanContent += cleanChunk;
        if (cleanChunk.trim()) {
          broadcast('agent-reply', { type: 'chunk', content: cleanChunk, full: cleanContent });
        }
      }
    }

    const usage = { input: result.input, output: result.output };
    const turnCost = recordAndBroadcastUsage(usage, getMessages(), content);
    tokensUsed += result.output || 0;
    costUsed += turnCost;
    closeReasoning();
    resetContentTag();

    const stopReason = result.stopReason;
    const rawCalls = result.toolCalls || [];
    const invocations: NativeToolInvocation[] = rawCalls.map((tc) => {
      const parsed = safeParseJSON<Record<string, unknown>>(tc.arguments);
      return {
        id: tc.id,
        name: tc.name,
        argsJson: tc.arguments,
        args: parsed.success && parsed.data ? parsed.data : {},
      };
    });

    // R2.7/R2.8：等待草稿模型预测结果，并记录（预测→实际）对照，供 PASTE 模式挖掘。
    const predicted = predictionPromise ? await predictionPromise : null;
    let specResult: {
      predicted: NativeToolInvocation;
      outcome: { content: string; success: boolean };
    } | null = null;
    if (speculativeTask) {
      specResult = (await speculativeTask) as {
        predicted: NativeToolInvocation;
        outcome: { content: string; success: boolean };
      };
      // 预执行已结束，释放 controller 引用，避免后续 /stop 误 abort 已完成的任务
      speculativeAbortController = null;
    }
    if (predicted) {
      patternStore.observe(sig, predicted.name, invocations[0]?.name ?? '');
    }

    const finalAssistantText = cleanContent.trim();

    if (invocations.length > 0) {
      step++;
      const tripped = evaluateBudget({
        step,
        maxSteps,
        tokensUsed,
        tokenBudget,
        costUsed,
        costBudget,
      });
      if (tripped) {
        const budgetMsg: Record<'steps' | 'tokens' | 'cost', string> = {
          steps: `单轮工具步数已达上限 ${maxSteps}`,
          tokens: `本轮输出 token 已达上限 ${tokenBudget}`,
          cost: `本轮预估花费已达上限 ${formatCost(costBudget)}（本轮已用 ${formatCost(costUsed)}）`,
        };
        println(`[预算] ${budgetMsg[tripped]}，强制暂停，等你指示`, 'yellow');
        if (finalAssistantText) addAssistantMessage(finalAssistantText);
        finishNativeTurn('budget');
        break;
      }

      // 记录带 tool_calls 的 assistant 消息，结果将以 role=tool 续接
      addAssistantNativeMessage(finalAssistantText, rawToolCallMessages(rawCalls));

      // R2.7：单工具且预测命中 → 复用推测执行的预执行结果（无损）；否则走标准顺序路径。
      let committed = false;
      if (
        specResult &&
        invocations.length === 1 &&
        invocations[0].name === specResult.predicted.name &&
        sameToolInvocation(specResult.predicted, invocations[0])
      ) {
        commitSpeculativeResult(invocations[0], specResult.outcome);
        println(`[推测执行] 命中 ${invocations[0].name}，复用预执行结果`, 'gray');
        committed = true;
      }
      if (!committed) {
        await executeNativeToolCallsServer(invocations);
      }

      if (shouldStop) {
        shouldStop = false;
        printBlank();
        return;
      }

      if (shouldCompress()) {
        const cp = traceStep('压缩对话历史', {}, 'running');
        await compressHistory();
        updateTraceStep(cp.id, { status: 'completed' });
      }

      updateTraceStep(cycleStep.id, {
        status: 'completed',
        details: { toolCallCount: invocations.length, step, stopReason },
      });
      // 事件驱动的下一轮：立即继续（不再 3 秒轮询）
      continue;
    }

    // 无工具调用：本轮结束，结构化停靠（R2.4：依据 stop_reason 判定而非轮询）
    updateTraceStep(cycleStep.id, {
      status: 'completed',
      details: { stopReason, nextAction: 'wait' },
    });
    if (finalAssistantText) {
      addAssistantMessage(finalAssistantText);
    }
    finishNativeTurn('wait', finalAssistantText || undefined);
    break;
  }
}

function rawToolCallMessages(
  calls: Array<{ id: string; name: string; arguments: string }>,
): NonNullable<Message['tool_calls']> {
  return calls.map((c) => ({
    id: c.id,
    type: 'function' as const,
    function: { name: c.name, arguments: c.arguments },
  }));
}

function finishNativeTurn(nextAction: 'wait' | 'budget', reply?: string): void {
  state.current = STATE.AWAITING_INPUT;
  if (getCurrentReplyKey()) {
    const cleanReply = reply?.trim();
    if (cleanReply) deliverReply(cleanReply);
  }
  broadcast('agent-reply', { type: 'end', nextAction });
  broadcast('agent-state', { state: 'idle' });
}

// ---- 辅助函数（记录 token / 原生循环支持）----

/**
 * 记录并广播 token 使用量，返回本轮预估花费（美元）。
 * 若流式未返回 usage，则基于消息文本与回复文本估算。
 */
function recordAndBroadcastUsage(
  usage: { input: number; output: number } | null,
  messages: Message[],
  fullResponse: string,
): number {
  let cost = 0;
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
    // 成本只算一次：recordTokenUsage 内部用同一价格表估算并返回，避免两处重复实现漂移
    cost = recordTokenUsage(usage.input, usage.output);
    println(
      `[Token] 输入:${usage.input} 输出:${usage.output} 总计:${usage.input + usage.output}` +
        (cost > 0 ? ` 花费:约${cost.toFixed(6)}` : ''),
      'gray',
    );
    broadcast('token-usage', {
      input: usage.input,
      output: usage.output,
      total: usage.input + usage.output,
      cost,
      session: getSessionStats(),
    });
  } catch (e) {
    console.error('[Token] 统计失败:', (e as Error).message);
  }
  return cost;
}

/**
 * 思考周期主流程：调用原生 function calling 循环（runNativeTurnLoop）直至结束或等待用户。
 */
async function thinkCycle(): Promise<void> {
  if (isProcessing) return;
  if (state.current !== STATE.THINKING) return;

  const myCycle = ++cycleSeq;
  isProcessing = true;
  broadcast('agent-state', { state: 'thinking' });

  clearThoughtTrace();
  const cycleStep = traceStep('思考周期开始', { messageCount: getMessages().length }, 'running');

  try {
    await runNativeTurnLoop();
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
    // 所有权校验：只有仍是当前周期的 finally 才允许复位 isProcessing。
    // 若中断后新周期已启动（cycleSeq 已自增），旧周期不得清掉新周期的标志。
    if (myCycle === cycleSeq) {
      isProcessing = false;
    }
  }
}

// 旧周期尚未退出时的重排上限：50ms 起步、单次上限 500ms，最多 60 次（约 25 秒）
const MAX_RESCHEDULE_RETRIES = 60;

function scheduleNextCycle(retry = 0): void {
  if (thinkingTimer) clearTimeout(thinkingTimer);
  // R2.1/R2.2：原生 function calling 路径事件驱动——工具完成后由 runNativeTurnLoop
  // 自身 continue 立即推进，首轮用户消息也无需等待。此处仅负责把 thinkCycle 推到
  // 下一 tick 启动（避免在 handleUserInput 调用栈内重入），延迟为 0。
  // isProcessing 守卫防止旧周期未退出时并发；thinkingTimer 保留供 /stop 取消挂起调度。
  const delay = retry > 0 ? Math.min(50 * retry, 500) : 0;
  thinkingTimer = setTimeout(async () => {
    thinkingTimer = null;
    if (state.current !== STATE.THINKING) return;

    // 旧周期（中断后仍在飞行中）尚未退出：此前的实现直接调用 thinkCycle 让它被
    // isProcessing 守卫弹回，并且因为 wasBlocked 为 true 而不再重排——那条已经
    // addUserMessage 进历史的消息就此永远不会被处理（打断后紧接着发消息必现）。
    // 改为退避重排，直到旧周期的 finally 复位 isProcessing。
    if (isProcessing) {
      if (retry < MAX_RESCHEDULE_RETRIES) {
        scheduleNextCycle(retry + 1);
      } else {
        console.warn('[Agent] 上一思考周期长时间未退出，放弃本次调度');
        state.current = STATE.AWAITING_INPUT;
        broadcast('agent-state', { state: 'idle' });
        showPrompt();
      }
      return;
    }

    // 新周期不得继承上一周期遗留的中断标志，否则会在第一个检查点立刻自杀，
    // 让刚入队的用户消息永远得不到回复。
    shouldStop = false;
    await thinkCycle();
    scheduleNextCycle();
  }, delay);
}

/**
 * hello-ok 状态快照（presence）：Agent 核心运行状态 + 通道状态 + Lane 队列。
 * 由 WS hello-ok 握手与监控面板抓取使用。
 */
function buildPresenceSnapshot(): Record<string, unknown> {
  return {
    version: APP_VERSION,
    state: state.current,
    persona: getCurrentPersonaTitle(),
    workspace: tools.getBasePath(),
    sessions: listSessions().length,
    channels: channelManager.statusSnapshot(),
    lanes: laneQueue.getLaneState().total,
    heartbeat: getHeartbeatStatus(),
    model: loadConfig().api.model || 'unknown',
    serverTime: new Date().toISOString(),
  };
}

async function start(): Promise<void> {
  const cfg = loadConfig();

  initializeSession();

  // 启动时按 config.json 的 persona（如有）设定活动人设；否则默认 Cogito（personas/cogito/）。
  // 人设直接按名称读取 personas/ 文件夹，不再复制文件到数据目录（避免残留文件顶替默认人设）。
  const startupPersona = cfg.persona || null;
  if (applyPersona(startupPersona)) {
    console.log(`[Agent] 活动人设: ${startupPersona ? startupPersona : '默认(Cogito)'}`);
  }

  // 自动加载科学插件
  (async () => {
    try {
      const result = await loadPlugins();
      if (result.loaded > 0) {
        console.log(`[Agent] 已加载 ${result.loaded} 个科学插件`);
      }
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.warn(`[Agent] 插件加载失败: ${err.name} - ${err.error}`);
        }
      }
    } catch (e) {
      console.error(`[Agent] 插件加载异常: ${(e as Error).message}`);
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
          // 与微信/Webhook/Heartbeat 共用同一条主 Lane，串行化避免并发踩踏
          laneQueue.enqueue(AGENT_LANE_KEY, () => handleUserInput(msg.text as string));
        }
      });
      onStatusSnapshot(() => buildPresenceSnapshot());
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
  println('  活动范围: ' + printTag(tools.getBasePath(), 'bgBlue'));
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

  // Heartbeat 主动清单：周期性检查工作区 TODO.md 并主动派活（默认开启，
  // COGITO_HEARTBEAT_ENABLED=false 可关闭，COGITO_HEARTBEAT_INTERVAL 可调间隔）。
  startHeartbeat(
    {
      workspace: tools.getBasePath(),
      enabled: process.env.COGITO_HEARTBEAT_ENABLED !== 'false',
      intervalMs:
        (process.env.COGITO_HEARTBEAT_INTERVAL &&
          parseInt(process.env.COGITO_HEARTBEAT_INTERVAL, 10)) ||
        60000,
      maxTasksPerTick: 1,
    },
    (taskText: string) => {
      laneQueue.enqueue(AGENT_LANE_KEY, () => handleUserInput(taskText));
    },
  );

  // Webhook 外部触发器：COGITO_WEBHOOK_ENABLED=true 时开放 HTTP 入口，
  // 供第三方服务把事件注入 Agent（COGITO_WEBHOOK_PORT / COGITO_WEBHOOK_TOKEN 可选）。
  if (process.env.COGITO_WEBHOOK_ENABLED === 'true') {
    startWebhookServer({
      onTrigger: (payload) => {
        laneQueue.enqueue(AGENT_LANE_KEY, () => handleUserInput(payload.text as string));
      },
    }).catch((e: Error) => {
      console.log('[Webhook] 触发器启动失败，已跳过:', e.message);
    });
  }

  println('\n  准备就绪，等待您的指令...', 'green');
  state.current = STATE.AWAITING_INPUT;
  broadcast('agent-state', { state: 'idle' });

  // S7: 注册优雅退出清理——关闭 WS / Webhook 服务并清理其 token 文件，
  // 否则进程退出/卸载插件时端口、http.Server 句柄与凭据文件均不释放。
  onCleanup(async () => {
    try {
      await stopWsServer();
    } catch (e: unknown) {
      console.error('[Agent] 关闭 WS 服务失败:', (e as Error)?.message || String(e));
    }
    try {
      await stopWebhookServer();
    } catch (e: unknown) {
      console.error('[Agent] 关闭 Webhook 服务失败:', (e as Error)?.message || String(e));
    }
  });
}

export {
  start,
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
