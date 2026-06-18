/**
 * 状态机模块
 * 管理 Agent 的状态：THINKING、AWAITING_INPUT、AWAITING_CONFIRMATION
 */

const STATE = {
  THINKING: 'THINKING',
  AWAITING_INPUT: 'AWAITING_INPUT',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION'
};

// 当前状态
let currentState = STATE.THINKING;

// 待确认的操作
let pendingConfirmation = null;

// 确认 Promise 的 resolve 函数
let confirmationResolve = null;

/**
 * 获取当前状态
 */
function getState() {
  return currentState;
}

/**
 * 设置状态
 */
function setState(state) {
  if (Object.values(STATE).includes(state)) {
    currentState = state;
  }
}

/**
 * 是否处于思考状态
 */
function isThinking() {
  return currentState === STATE.THINKING;
}

/**
 * 是否处于等待输入状态
 */
function isAwaitingInput() {
  return currentState === STATE.AWAITING_INPUT;
}

/**
 * 是否处于等待确认状态
 */
function isAwaitingConfirmation() {
  return currentState === STATE.AWAITING_CONFIRMATION;
}

/**
 * 获取待确认操作
 */
function getPendingConfirmation() {
  return pendingConfirmation;
}

/**
 * 设置待确认操作
 */
function setPendingConfirmation(confirmation) {
  pendingConfirmation = confirmation;
}

/**
 * 请求用户确认危险操作
 * @param {string} toolName 工具名称
 * @param {array} args 工具参数
 * @returns {Promise<boolean>} 用户是否确认
 */
async function requestConfirmation(toolName, args) {
  setState(STATE.AWAITING_CONFIRMATION);
  pendingConfirmation = { toolName, args };
  
  // 超时配置：5分钟
  const CONFIRM_TIMEOUT = 5 * 60 * 1000;
  
  return new Promise((resolve) => {
    confirmationResolve = resolve;
    
    setTimeout(() => {
      if (confirmationResolve === resolve) {
        confirmationResolve = null;
        pendingConfirmation = null;
        setState(STATE.THINKING);
        resolve(false);
      }
    }, CONFIRM_TIMEOUT);
  });
}

/**
 * 处理确认结果
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
 * 取消待确认操作
 */
function cancelConfirmation() {
  if (confirmationResolve) {
    confirmationResolve(false);
    confirmationResolve = null;
    pendingConfirmation = null;
  }
}

// 导出一个共享的状态对象，供外部模块使用
// 使用 getter/setter 确保状态一致
const state = {
  get current() { return currentState; },
  set current(v) { setState(v); }
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
  state
};
