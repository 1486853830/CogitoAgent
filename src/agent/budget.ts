/**
 * 思考预算判定（R2.3）。
 *
 * 单个思考周期内可能产生三类预算消耗：
 * - steps：工具调用步数（maxSteps）
 * - tokens：累计输出 token（tokenBudget / maxTokens）
 * - cost：按路由表价格换算的预估花费（costBudget，美元）
 *
 * evaluateBudget 是纯函数，便于单测；三类上限按声明顺序判定，命中其一即返回类型。
 */

export type BudgetTrigger = 'steps' | 'tokens' | 'cost';

export interface BudgetState {
  /** 当前工具调用步数（已累计，含本轮）。 */
  step: number;
  /** 单轮最大工具调用步数；超过即触发 steps。 */
  maxSteps: number;
  /** 本轮累计输出 token。 */
  tokensUsed: number;
  /** 单轮最大输出 token 数；0 表示不限制。 */
  tokenBudget: number;
  /** 本轮累计预估花费（美元）。 */
  costUsed: number;
  /** 单轮最大预估花费（美元）；0 或不设表示不限制。 */
  costBudget: number;
}

/**
 * 返回当前触发的预算类型；未触发返回 null。
 */
export function evaluateBudget(state: BudgetState): BudgetTrigger | null {
  if (state.step > state.maxSteps) return 'steps';
  if (state.tokenBudget > 0 && state.tokensUsed >= state.tokenBudget) return 'tokens';
  if (state.costBudget > 0 && state.costUsed >= state.costBudget) return 'cost';
  return null;
}
