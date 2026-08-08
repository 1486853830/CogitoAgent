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

async function requestConfirmation(
  toolName: string,
  args: unknown[],
  hint?: string,
): Promise<boolean> {
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
    confirmationTimer.unref();
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
  }
}

function cancelConfirmation(): void {
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
