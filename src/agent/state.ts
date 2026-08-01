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

async function requestConfirmation(toolName: string, args: unknown[]): Promise<boolean> {
  setState(STATE.AWAITING_CONFIRMATION);
  pendingConfirmation = { toolName, args };

  const CONFIRM_TIMEOUT = 5 * 60 * 1000;

  return new Promise((resolve) => {
    confirmationResolve = resolve;

    confirmationTimer = setTimeout(() => {
      if (confirmationResolve === resolve) {
        confirmationResolve = null;
        pendingConfirmation = null;
        confirmationTimer = null;
        setState(STATE.THINKING);
        resolve(false);
      }
    }, CONFIRM_TIMEOUT);
    confirmationTimer.unref();
  });
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
