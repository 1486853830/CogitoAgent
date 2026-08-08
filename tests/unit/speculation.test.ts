import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { NativeToolInvocation } from '../../src/types/index.ts';

jest.unstable_mockModule('../../src/api/client.ts', () => ({
  streamChatNative: jest.fn(),
  // registry→tools→cluster-tools→orchestrator 会从 client.ts 取 isAbortError，
  // mock 若缺该导出，整个模块图解析时报 SyntaxError。
  isAbortError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError',
}));

// ESM 下必须用 await import 取 mocked 模块；静态 import 会在 mock 生效前绑定真实实现。
let spec: typeof import('../../src/agent/speculation.ts');
let mockStream: jest.Mock;

beforeAll(async () => {
  spec = await import('../../src/agent/speculation.ts');
  const client = await import('../../src/api/client.ts');
  mockStream = (client as unknown as { streamChatNative: jest.Mock }).streamChatNative;
});

/** 构造一个返回指定 toolCalls 的假流式生成器。 */
async function* fakeStream(toolCalls: Array<{ id: string; name: string; arguments: string }>) {
  yield { content: null, reasoning: null };
  return { input: 0, output: 0, stopReason: 'tool_calls', toolCalls };
}

describe('classifyTool (R2.8 策略系统)', () => {
  it('只读工具归类为可推测', () => {
    expect(spec.classifyTool('gitStatus')).toBe('speculatable');
    expect(spec.classifyTool('browse')).toBe('speculatable');
  });

  it('未知工具默认禁止推测（避免副作用）', () => {
    expect(spec.classifyTool('no_such_tool_xyz')).toBe('forbidden');
  });
});

describe('sameToolInvocation', () => {
  const a: NativeToolInvocation = { id: '1', name: 'gitStatus', argsJson: '{}', args: { x: 1 } };
  it('同名同参视为等价', () => {
    const b: NativeToolInvocation = { id: '2', name: 'gitStatus', argsJson: '{}', args: { x: 1 } };
    expect(spec.sameToolInvocation(a, b)).toBe(true);
  });
  it('不同名或不等价参数视为不等价', () => {
    const diffName: NativeToolInvocation = {
      id: '2',
      name: 'gitLog',
      argsJson: '{}',
      args: { x: 1 },
    };
    const diffArgs: NativeToolInvocation = {
      id: '2',
      name: 'gitStatus',
      argsJson: '{}',
      args: { x: 2 },
    };
    expect(spec.sameToolInvocation(a, diffName)).toBe(false);
    expect(spec.sameToolInvocation(a, diffArgs)).toBe(false);
  });
});

describe('contextSignature', () => {
  it('相同消息序列产生稳定签名', () => {
    const m = [{ role: 'user' as const, content: '你好' }];
    expect(spec.contextSignature(m as never)).toBe(spec.contextSignature(m as never));
  });
  it('不同消息序列产生不同签名', () => {
    const a = [{ role: 'user' as const, content: '你好' }];
    const b = [{ role: 'user' as const, content: '再见' }];
    expect(spec.contextSignature(a as never)).not.toBe(spec.contextSignature(b as never));
  });
});

describe('PatternStore (R2.8 PASTE 模式挖掘)', () => {
  let file: string;
  beforeEach(() => {
    file = path.join(
      os.tmpdir(),
      `pattern-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
  });
  afterEach(() => {
    try {
      fs.unlinkSync(file);
    } catch {
      /* noop */
    }
  });

  it('观察命中率与 shouldSpeculate 门槛', () => {
    const store = new spec.PatternStore(file);
    store.observe('ctx1', 'gitStatus', 'gitStatus');
    store.observe('ctx1', 'gitStatus', 'gitStatus');
    expect(store.samples('ctx1')).toBe(2);
    expect(store.confidence('ctx1')).toBe(1);
    store.observe('ctx1', 'gitStatus', 'gitLog');
    expect(store.samples('ctx1')).toBe(3);
    expect(store.confidence('ctx1')).toBeCloseTo(2 / 3);

    expect(store.shouldSpeculate('ctx1', 0.6, 2)).toBe(true);
    expect(store.shouldSpeculate('ctx1', 0.9, 2)).toBe(false);
    expect(store.shouldSpeculate('nope', 0.8, 2)).toBe(false);
  });

  it('持久化：重新加载后保留模式', () => {
    const s1 = new spec.PatternStore(file);
    s1.observe('k', 'gitStatus', 'gitStatus');
    // 落盘是防抖的（避免每轮同步 IO 阻塞思考循环），显式 flush 后再读取
    s1.flush();
    const s2 = new spec.PatternStore(file);
    expect(s2.samples('k')).toBe(1);
    expect(s2.confidence('k')).toBe(1);
  });

  it('容量上限：超出 MAX_ENTRIES 后淘汰最旧条目，内存不会无限增长', () => {
    const store = new spec.PatternStore(file);
    const max = spec.PatternStore.MAX_ENTRIES;
    // 写入 max + 10 个不同签名
    for (let i = 0; i < max + 10; i++) {
      store.observe(`ctx-${i}`, 'gitStatus', 'gitStatus');
    }
    // 最早的 10 个应已被淘汰，最新的仍在
    expect(store.samples('ctx-0')).toBe(0);
    expect(store.samples('ctx-9')).toBe(0);
    expect(store.samples(`ctx-${max + 9}`)).toBe(1);
    store.flush();
  });
});

describe('predictNextTool (R2.7 草稿模型预测)', () => {
  afterEach(() => mockStream.mockReset());

  it('解析草稿模型返回的单个工具调用', async () => {
    mockStream.mockImplementation(() =>
      fakeStream([{ id: 'd1', name: 'gitStatus', arguments: '{"x":1}' }]),
    );
    const pred = await spec.predictNextTool([{ role: 'user', content: 'hi' }], [], 'draft-model');
    expect(pred).not.toBeNull();
    expect(pred!.name).toBe('gitStatus');
    expect(pred!.args).toEqual({ x: 1 });
  });

  it('无工具调用时返回 null', async () => {
    mockStream.mockImplementation(() => fakeStream([]));
    const pred = await spec.predictNextTool([{ role: 'user', content: 'hi' }], [], 'draft-model');
    expect(pred).toBeNull();
  });

  it('草稿模型异常时安全返回 null（无损回退）', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('draft down');
    });
    const pred = await spec.predictNextTool([{ role: 'user', content: 'hi' }], [], 'draft-model');
    expect(pred).toBeNull();
  });
});
