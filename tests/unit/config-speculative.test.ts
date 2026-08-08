import { DEFAULT_CONFIG, deepMerge } from '../../src/config.ts';

describe('R2.7/R2.8/R2.9 配置默认值', () => {
  it('推测执行默认关闭（仅用户显式开启才生效）', () => {
    expect(DEFAULT_CONFIG.chat.speculative).toBeDefined();
    expect(DEFAULT_CONFIG.chat.speculative?.enabled).toBe(false);
  });

  it('reasoning_effort 支持 xhigh 档位（R2.9 对齐四大档）', () => {
    const merged = deepMerge(DEFAULT_CONFIG, {
      chat: { reasoningEffort: 'xhigh', verbosity: 'low', thinking: { type: 'adaptive' } },
    } as never);
    expect(merged.chat.reasoningEffort).toBe('xhigh');
    expect(merged.chat.verbosity).toBe('low');
    expect(merged.chat.thinking).toEqual({ type: 'adaptive' });
  });

  it('deepMerge 保留推测执行配置且不丢失默认字段', () => {
    const merged = deepMerge(DEFAULT_CONFIG, {
      chat: { speculative: { enabled: true, draftModel: 'mini' } },
    } as never);
    expect(merged.chat.speculative?.enabled).toBe(true);
    expect(merged.chat.speculative?.draftModel).toBe('mini');
    // 未显式给出的字段仍由 DEFAULT_CONFIG 兜底
    const merged2 = deepMerge(DEFAULT_CONFIG, { chat: {} } as never);
    expect(merged2.chat.speculative?.enabled).toBe(false);
  });
});
