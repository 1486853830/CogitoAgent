import { broadcast } from '../io/ws-server.ts';
import { channelManager } from './channels/index.ts';

const STATE = {
  THINKING: 'THINKING',
  AWAITING_INPUT: 'AWAITING_INPUT',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
};

let currentState = STATE.THINKING;
let pendingConfirmation: { toolName: string; args: unknown[]; type?: string } | null = null;
let confirmationResolve: ((confirmed: boolean) => void) | null = null;
let confirmationTimer: ReturnType<typeof setTimeout> | null = null;

function getState(): string {
  return currentState;
}

function setState(state: string): void {
  if (Object.values(STATE).includes(state)) {
    currentState = state;
  }
}

function isThinking(): boolean {
  return currentState === STATE.THINKING;
}

function isAwaitingInput(): boolean {
  return currentState === STATE.AWAITING_INPUT;
}

function isAwaitingConfirmation(): boolean {
  return currentState === STATE.AWAITING_CONFIRMATION;
}

function getPendingConfirmation(): { toolName: string; args: unknown[]; type?: string } | null {
  return pendingConfirmation;
}

function setPendingConfirmation(
  confirmation: { toolName: string; args: unknown[]; type?: string } | null,
): void {
  pendingConfirmation = confirmation;
}

// 确认串行化链：并行工具调用（Agent.ts 的 Promise.allSettled）可能同时发起多个
// 确认请求。confirmationResolve 是单例，后发起者会直接覆盖前者，使前者的 Promise
// 永远无人 resolve（其超时回调里的 `confirmationResolve === resolve` 恒为假），
// 导致 allSettled 永不返回、Agent 彻底冻结。这里用串行链保证同一时刻只有一个
// 待确认请求，后来者排队等待。
let confirmationChain: Promise<void> = Promise.resolve();
// 代际计数：cancelConfirmation（/stop）递增此值，使仍在排队的确认请求直接作废，
// 避免用户已中止后仍被逐个弹出确认框。
let confirmationGeneration = 0;
// 仍在串行链上（含正在弹框）的确认请求数，同步维护。resolveConfirmation 需要在
// "请求还在排队、exclusive 尚未启动"时区分两种情形：
//   1. 有请求在排队 → 决定先记下（earlyConfirmationResult），exclusive 启动时消费；
//   2. 完全没有请求 → 严格 no-op（不污染下一次请求）。
let pendingConfirmationRequests = 0;
// 弹框前已收到的决定（调用方同步批准/拒绝，早于 exclusive 启动）。
let earlyConfirmationResult: boolean | null = null;

async function requestConfirmation(
  toolName: string,
  args: unknown[],
  hint?: string,
): Promise<boolean> {
  const myGeneration = confirmationGeneration;
  const previous = confirmationChain;
  let release!: () => void;
  confirmationChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  pendingConfirmationRequests++;

  try {
    await previous;
    // 排队期间被 /stop 取消，则不再弹框，直接按拒绝处理
    if (myGeneration !== confirmationGeneration) return false;
    return await requestConfirmationExclusive(toolName, args, hint);
  } finally {
    release();
    pendingConfirmationRequests--;
  }
}

/** 实际发起单个确认请求；调用方必须已持有串行链锁。 */
async function requestConfirmationExclusive(
  toolName: string,
  args: unknown[],
  hint?: string,
): Promise<boolean> {
  // 决定在弹框前已到达（调用方同步 resolve/cancel 竞态）：直接消费，不再弹框。
  if (earlyConfirmationResult !== null) {
    const result = earlyConfirmationResult;
    earlyConfirmationResult = null;
    broadcast('confirmation-resolved', { resolved: result });
    return result;
  }

  setState(STATE.AWAITING_CONFIRMATION);
  pendingConfirmation = { toolName, args };

  // 通知前端（Web 界面）弹出危险操作确认框；CLI 终端仍通过 handleUserInput 的
  // AWAITING_CONFIRMATION 分支用 y/n 确认。
  broadcast('confirmation-requested', {
    toolName,
    hint: hint || toolName,
    args: formatArgsForConfirmation(args),
  });

  const CONFIRM_TIMEOUT = 5 * 60 * 1000;

  // 跨通道审批：把确认请求推送到在线通道（如微信），对方回复 y/n 即可完成审批
  channelManager.pushConfirmation({
    toolName,
    hint: hint || toolName,
    argsText: formatArgsForConfirmation(args),
    timeoutMs: CONFIRM_TIMEOUT,
  });

  return new Promise((resolve) => {
    confirmationResolve = resolve;

    confirmationTimer = setTimeout(() => {
      if (confirmationResolve === resolve) {
        confirmationResolve = null;
        pendingConfirmation = null;
        confirmationTimer = null;
        setState(STATE.THINKING);
        broadcast('confirmation-resolved', { resolved: false, timedOut: true });
        resolve(false);
      }
    }, CONFIRM_TIMEOUT);
    // 非 Node 定时器实现（部分测试环境/浏览器 polyfill）没有 unref
    if (typeof confirmationTimer.unref === 'function') confirmationTimer.unref();
  });
}

/** 将工具参数截断成前端可读的文本，避免把超长内容灌给确认框 */
function formatArgsForConfirmation(args: unknown[]): string {
  try {
    const text = JSON.stringify(args);
    return text && text.length > 200 ? text.slice(0, 200) + '…' : text || '(无参数)';
  } catch {
    return '(无法序列化参数)';
  }
}

function resolveConfirmation(confirmed: boolean): void {
  if (confirmationResolve) {
    if (confirmationTimer) {
      clearTimeout(confirmationTimer);
      confirmationTimer = null;
    }
    confirmationResolve(confirmed);
    confirmationResolve = null;
    pendingConfirmation = null;
    broadcast('confirmation-resolved', { resolved: confirmed });
    return;
  }
  // exclusive 尚未启动（请求仍在串行链上排队）：记下决定，启动时消费，
  // 避免 resolve 落在 confirmationResolve 为 null 的空窗期被静默丢弃。
  if (pendingConfirmationRequests > 0) {
    earlyConfirmationResult = confirmed;
  }
  // 完全没有请求在排队：严格 no-op。
}

function cancelConfirmation(): void {
  // 作废所有仍在串行链上排队的确认请求（用户已 /stop，不应继续弹框）
  confirmationGeneration++;
  // 排队中的请求会在恢复时因 generation 不匹配直接作废；
  // 已暂存的早到决定必须一并清除，避免被后续请求误消费。
  earlyConfirmationResult = null;
  if (confirmationResolve) {
    if (confirmationTimer) {
      clearTimeout(confirmationTimer);
      confirmationTimer = null;
    }
    confirmationResolve(false);
    confirmationResolve = null;
    pendingConfirmation = null;
    broadcast('confirmation-resolved', { resolved: false, cancelled: true });
  }
}

const state = {
  get current(): string {
    return currentState;
  },
  set current(v: string) {
    setState(v);
  },
};

export {
  STATE,
  getState,
  setState,
  isThinking,
  isAwaitingInput,
  isAwaitingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
  requestConfirmation,
  resolveConfirmation,
  cancelConfirmation,
  state,
};
