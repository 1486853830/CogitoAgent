import { jest } from '@jest/globals';
import {
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
  STATE,
} from '../../src/agent/state.ts';

describe('state.ts', () => {
  describe('STATE constants', () => {
    it('should define state constants', () => {
      expect(STATE.THINKING).toBe('THINKING');
      expect(STATE.AWAITING_INPUT).toBe('AWAITING_INPUT');
      expect(STATE.AWAITING_CONFIRMATION).toBe('AWAITING_CONFIRMATION');
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = getState();
      expect(Object.values(STATE)).toContain(state);
    });
  });

  describe('setState', () => {
    it('should set valid state', () => {
      setState(STATE.AWAITING_INPUT);
      expect(getState()).toBe(STATE.AWAITING_INPUT);
    });

    it('should reject invalid state', () => {
      const original = getState();
      setState('INVALID_STATE');
      expect(getState()).toBe(original);
    });
  });

  describe('isThinking', () => {
    it('should return true when thinking', () => {
      setState(STATE.THINKING);
      expect(isThinking()).toBe(true);
    });

    it('should return false when not thinking', () => {
      setState(STATE.AWAITING_INPUT);
      expect(isThinking()).toBe(false);
    });
  });

  describe('isAwaitingInput', () => {
    it('should return true when awaiting input', () => {
      setState(STATE.AWAITING_INPUT);
      expect(isAwaitingInput()).toBe(true);
    });

    it('should return false when not awaiting input', () => {
      setState(STATE.THINKING);
      expect(isAwaitingInput()).toBe(false);
    });
  });

  describe('isAwaitingConfirmation', () => {
    it('should return true when awaiting confirmation', () => {
      setState(STATE.AWAITING_CONFIRMATION);
      expect(isAwaitingConfirmation()).toBe(true);
    });

    it('should return false when not awaiting confirmation', () => {
      setState(STATE.THINKING);
      expect(isAwaitingConfirmation()).toBe(false);
    });
  });

  describe('pending confirmation', () => {
    it('should get and set pending confirmation', () => {
      const confirmation = { toolName: 'test', args: [1, 2, 3] };
      setPendingConfirmation(confirmation);
      expect(getPendingConfirmation()).toEqual(confirmation);
      setPendingConfirmation(null);
      expect(getPendingConfirmation()).toBe(null);
    });
  });

  describe('requestConfirmation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      setState(STATE.THINKING);
      setPendingConfirmation(null);
    });

    afterEach(() => {
      // 兜底作废可能悬挂的确认请求（失败用例不应把 confirmationResolve /
      // pendingConfirmation / timer 残留到下一个用例）
      cancelConfirmation();
      jest.useRealTimers();
    });

    it('should set state to AWAITING_CONFIRMATION', async () => {
      const promise = requestConfirmation('testTool', ['arg1']);
      // 串行链下 exclusive（弹框）在微任务中启动：等一拍再断言同步可见性
      await Promise.resolve();
      expect(getState()).toBe(STATE.AWAITING_CONFIRMATION);
      resolveConfirmation(true);
      await promise;
    });

    it('should store pending confirmation with toolName and args', async () => {
      const promise = requestConfirmation('myTool', [1, 2, 3]);
      await Promise.resolve();
      const pending = getPendingConfirmation();
      expect(pending).toEqual({ toolName: 'myTool', args: [1, 2, 3] });
      resolveConfirmation(true);
      await promise;
    });

    it('should resolve to false on timeout', async () => {
      const promise = requestConfirmation('timeoutTool', []);
      // exclusive（含 5 分钟定时器）在微任务中启动：先推进微任务再拨动定时器
      await Promise.resolve();
      // Advance past the 5 minute timeout
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      const result = await promise;
      expect(result).toBe(false);
    });

    it('should reset state to THINKING after timeout', async () => {
      const promise = requestConfirmation('timeoutTool', []);
      await Promise.resolve();
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      await promise;
      expect(getState()).toBe(STATE.THINKING);
    });

    it('should clear pending confirmation after timeout', async () => {
      const promise = requestConfirmation('timeoutTool', []);
      await Promise.resolve();
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);
      await promise;
      expect(getPendingConfirmation()).toBe(null);
    });
  });

  describe('resolveConfirmation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      setState(STATE.THINKING);
      setPendingConfirmation(null);
    });

    afterEach(() => {
      cancelConfirmation();
      jest.useRealTimers();
    });

    it('should resolve the promise with true', async () => {
      const promise = requestConfirmation('confirmTool', []);
      resolveConfirmation(true);
      const result = await promise;
      expect(result).toBe(true);
    });

    it('should resolve the promise with false', async () => {
      const promise = requestConfirmation('denyTool', []);
      resolveConfirmation(false);
      const result = await promise;
      expect(result).toBe(false);
    });

    it('should clear pending confirmation after resolving', async () => {
      const promise = requestConfirmation('clearTool', []);
      resolveConfirmation(true);
      await promise;
      expect(getPendingConfirmation()).toBe(null);
    });

    it('should be a no-op when no confirmation is pending', () => {
      expect(() => resolveConfirmation(true)).not.toThrow();
      expect(getPendingConfirmation()).toBe(null);
    });
  });

  describe('cancelConfirmation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      setState(STATE.THINKING);
      setPendingConfirmation(null);
    });

    afterEach(() => {
      cancelConfirmation();
      jest.useRealTimers();
    });

    it('should resolve the pending promise with false', async () => {
      const promise = requestConfirmation('cancelTool', []);
      cancelConfirmation();
      const result = await promise;
      expect(result).toBe(false);
    });

    it('should clear pending confirmation', async () => {
      const promise = requestConfirmation('cancelTool', []);
      cancelConfirmation();
      await promise;
      expect(getPendingConfirmation()).toBe(null);
    });

    it('should be a no-op when no confirmation is pending', () => {
      expect(() => cancelConfirmation()).not.toThrow();
      expect(getPendingConfirmation()).toBe(null);
    });
  });

  describe('state getter/setter', () => {
    it('should return the current state via the getter', () => {
      setState(STATE.THINKING);
      expect(state.current).toBe(STATE.THINKING);
    });

    it('should set the state via the setter', () => {
      state.current = STATE.AWAITING_INPUT;
      expect(getState()).toBe(STATE.AWAITING_INPUT);
      expect(state.current).toBe(STATE.AWAITING_INPUT);
    });

    it('should reject invalid state via the setter', () => {
      setState(STATE.THINKING);
      state.current = 'NOT_A_VALID_STATE';
      expect(state.current).toBe(STATE.THINKING);
    });

    it('should reflect changes made through setState', () => {
      setState(STATE.AWAITING_CONFIRMATION);
      expect(state.current).toBe(STATE.AWAITING_CONFIRMATION);
    });
  });
});
