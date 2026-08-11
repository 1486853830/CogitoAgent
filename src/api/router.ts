/**
 * 模型路由与成本估算。
 * 支持按任务复杂度选择模型（预留配置接口），并提供内置价格表 +
 * 环境变量覆盖的成本估算，供统计面板展示真实花费。
 */
import { loadConfig } from '../config.ts';

interface Pricing {
  inputPerMillion: number; // $ per 1M input tokens
  outputPerMillion: number; // $ per 1M output tokens
}

/** 常见模型价格表（$/1M tokens，近似值，可按需补充） */
const MODEL_PRICING: Record<string, Pricing> = {
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'claude-3-5-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-haiku': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  'claude-sonnet-4': { inputPerMillion: 3, outputPerMillion: 15 },
  'deepseek-chat': { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  'deepseek-reasoner': { inputPerMillion: 0.55, outputPerMillion: 2.19 },
  'moark-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'qwen-max': { inputPerMillion: 1.6, outputPerMillion: 6.4 },
  'glm-4-plus': { inputPerMillion: 0.8, outputPerMillion: 0.8 },
};

/**
 * 当前使用的模型名称（未来支持按任务复杂度路由时可在此返回不同模型）。
 */
export function getActiveModel(): string {
  return loadConfig().api.model || 'unknown';
}

/**
 * 按当前模型获取价格。优先读取环境变量覆盖，其次查内置价格表。
 */
export function getModelPricing(modelName?: string): Pricing {
  const model = modelName || getActiveModel();

  const envIn = process.env.COGITO_MODEL_PRICE_IN;
  const envOut = process.env.COGITO_MODEL_PRICE_OUT;
  if (envIn !== undefined || envOut !== undefined) {
    const inputPerMillion = envIn !== undefined ? parseFloat(envIn) : NaN;
    const outputPerMillion = envOut !== undefined ? parseFloat(envOut) : NaN;
    if (!isNaN(inputPerMillion) && !isNaN(outputPerMillion)) {
      return { inputPerMillion, outputPerMillion };
    }
  }

  // 模糊匹配：先精确，再按前缀匹配（如 'gpt-4o-2024-08-06' 命中 'gpt-4o'）
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const matched = Object.keys(MODEL_PRICING)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  if (matched) return MODEL_PRICING[matched];

  return { inputPerMillion: 0, outputPerMillion: 0 };
}

/**
 * 估算一次调用的成本（美元）。
 * @param modelName 可选。指定本次调用实际使用的模型（子模型 / 路由后的模型）；
 *                  省略时回退到当前活跃模型。
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  modelName?: string,
): number {
  const pricing = getModelPricing(modelName);
  const input = Number(inputTokens) || 0;
  const output = Number(outputTokens) || 0;
  return (
    (input / 1_000_000) * pricing.inputPerMillion + (output / 1_000_000) * pricing.outputPerMillion
  );
}

/**
 * 成本累计到金额字符串（保留 4 位小数，不足 0.0001 时显示更小单位）。
 */
export function formatCost(cost: number): string {
  if (Number.isNaN(cost)) {
    console.warn('[路由] formatCost 收到 NaN，请检查 token 计数逻辑');
    return '$0.0000';
  }
  if (!cost || cost <= 0) return '$0.0000';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}
