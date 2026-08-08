import { evaluateBudget } from '../../src/agent/budget.ts';
import type { BudgetState } from '../../src/agent/budget.ts';

function makeState(overrides: Partial<BudgetState> = {}): BudgetState {
  return {
    step: 1,
    maxSteps: 6,
    tokensUsed: 0,
    tokenBudget: 0,
    costUsed: 0,
    costBudget: 0,
    ...overrides,
  };
}

describe('evaluateBudget (R2.3)', () => {
  it('returns null when everything is within limits', () => {
    const state = makeState({
      step: 3,
      maxSteps: 6,
      tokensUsed: 100,
      tokenBudget: 1000,
      costUsed: 0.01,
      costBudget: 1,
    });
    expect(evaluateBudget(state)).toBeNull();
  });

  it('triggers steps when step exceeds maxSteps', () => {
    const state = makeState({ step: 7, maxSteps: 6 });
    expect(evaluateBudget(state)).toBe('steps');
  });

  it('does NOT trigger steps at the boundary (strict greater-than)', () => {
    const state = makeState({ step: 6, maxSteps: 6 });
    expect(evaluateBudget(state)).toBeNull();
  });

  it('triggers tokens at the boundary (>=)', () => {
    const state = makeState({ tokensUsed: 1000, tokenBudget: 1000 });
    expect(evaluateBudget(state)).toBe('tokens');
  });

  it('never triggers tokens when tokenBudget is 0 (unlimited)', () => {
    const state = makeState({ tokensUsed: 999999, tokenBudget: 0 });
    expect(evaluateBudget(state)).toBeNull();
  });

  it('triggers cost at the boundary (>=)', () => {
    const state = makeState({ costUsed: 0.5, costBudget: 0.5 });
    expect(evaluateBudget(state)).toBe('cost');
  });

  it('never triggers cost when costBudget is 0 (unlimited)', () => {
    const state = makeState({ costUsed: 999, costBudget: 0 });
    expect(evaluateBudget(state)).toBeNull();
  });

  it('gives steps priority over tokens and cost', () => {
    const state = makeState({
      step: 10,
      maxSteps: 6,
      tokensUsed: 5000,
      tokenBudget: 1000,
      costUsed: 100,
      costBudget: 1,
    });
    expect(evaluateBudget(state)).toBe('steps');
  });

  it('gives tokens priority over cost', () => {
    const state = makeState({
      step: 2,
      maxSteps: 6,
      tokensUsed: 2000,
      tokenBudget: 1000,
      costUsed: 50,
      costBudget: 1,
    });
    expect(evaluateBudget(state)).toBe('tokens');
  });
});
