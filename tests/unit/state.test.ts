import {
  getState,
  setState,
  isThinking,
  isAwaitingInput,
  isAwaitingConfirmation,
  getPendingConfirmation,
  setPendingConfirmation,
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
});
