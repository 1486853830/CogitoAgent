/**
 * 推测执行与 PASTE 模式挖掘（R2.7 / R2.8）。
 *
 * - classifyTool：基于 R1.7 工具注解把工具分为 可推测 / dry-run 可行 / 禁止推测。
 * - predictNextTool：用轻量草稿模型并行预测下一步工具调用。
 * - PatternStore：从执行轨迹挖掘（上下文签名 → 预测工具）模式元组，记录命中率；
 *   命中率达标后由 R2.8 自动启用推测执行。
 *
 * 安全约束：推测执行只在 classifyTool 返回 'speculatable'（只读/无副作用）时预执行；
 * 主模型返回后若预测未命中，直接丢弃推测结果走标准顺序路径（无损回退）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { streamChatNative } from '../api/client.ts';
import type { NativeStreamReturn, OpenAITool } from '../api/client.ts';
import type { Message, NativeToolInvocation } from '../types/index.ts';
import { getToolAnnotations } from './tool-schema.ts';

export type ToolSpeculationClass = 'speculatable' | 'dryrun' | 'forbidden';

/** 基于 R1.7 注解分类工具的可推测性（R2.8 策略系统）。 */
export function classifyTool(name: string): ToolSpeculationClass {
  const a = getToolAnnotations(name);
  if (a.destructiveHint) return 'forbidden';
  if (a.readOnlyHint) return 'speculatable';
  if (a.idempotentHint && !a.openWorldHint) return 'dryrun';
  return 'forbidden';
}

/** 稳定序列化（key 排序），用于比较两次工具调用的参数是否等价。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/** 比较两个工具调用是否等价（同名且参数一致）。 */
export function sameToolInvocation(a: NativeToolInvocation, b: NativeToolInvocation): boolean {
  return a.name === b.name && stableStringify(a.args) === stableStringify(b.args);
}

/** 由最近若干消息生成上下文签名（用于 PASTE 模式挖掘的 key）。 */
export function contextSignature(messages: Message[]): string {
  const recent = messages.slice(-6);
  const raw = recent
    .map((m) => {
      if (m.role === 'tool') return `tool:${m.tool_call_id ?? ''}`;
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return 'assistant:' + m.tool_calls.map((tc) => tc.function.name).join(',');
      }
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${m.role}:${c.slice(0, 80)}`;
    })
    .join('|');
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

interface PatternEntry {
  predicted: string;
  hits: number;
  total: number;
}

/**
 * PASTE 模式存储（R2.8）：以上下文签名为 key，记录「预测工具 → 实际工具」的命中情况。
 * 命中率与样本数达标后 shouldSpeculate 返回 true，驱动推测执行自动启用。
 */
export class PatternStore {
  private map = new Map<string, PatternEntry>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<
          string,
          PatternEntry
        >;
        if (data && typeof data === 'object') {
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v.predicted === 'string' && typeof v.hits === 'number') {
              this.map.set(k, v);
            }
          }
        }
      }
    } catch {
      // 损坏文件忽略，从空开始。
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, PatternEntry> = {};
      for (const [k, v] of this.map) obj[k] = v;
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch {
      // 持久化失败不阻塞主流程。
    }
  }

  /** 记录一次预测与实际的对照（供后续统计命中率）。 */
  observe(contextSig: string, predicted: string, actual: string): void {
    const e = this.map.get(contextSig) ?? { predicted, hits: 0, total: 0 };
    e.total += 1;
    if (predicted === actual) e.hits += 1;
    this.map.set(contextSig, e);
    this.save();
  }

  confidence(contextSig: string): number {
    const e = this.map.get(contextSig);
    return e && e.total > 0 ? e.hits / e.total : 0;
  }

  samples(contextSig: string): number {
    return this.map.get(contextSig)?.total ?? 0;
  }

  /** 命中率与样本数双达标即视为可启用推测执行（R2.8 自动启用判据）。 */
  shouldSpeculate(contextSig: string, threshold: number, minSamples: number): boolean {
    const e = this.map.get(contextSig);
    if (!e) return false;
    return e.total >= minSamples && e.hits / e.total >= threshold;
  }

  /** 测试/调试用：清空全部模式。 */
  reset(): void {
    this.map.clear();
    this.save();
  }
}

export function defaultPatternStorePath(): string {
  return path.join(process.cwd(), 'data', 'speculation-patterns.json');
}

let globalStore: PatternStore | null = null;
/** 进程级单例（写入 data/speculation-patterns.json）。测试可自建 PatternStore 隔离。 */
export function getGlobalPatternStore(): PatternStore {
  if (!globalStore) globalStore = new PatternStore(defaultPatternStorePath());
  return globalStore;
}

/**
 * 用草稿模型并行预测下一步工具调用（R2.7）。
 * 返回单个预测调用；无预测或解析失败返回 null。
 */
export async function predictNextTool(
  messages: Array<Record<string, unknown>>,
  tools: OpenAITool[],
  draftModel: string,
): Promise<NativeToolInvocation | null> {
  try {
    const stream = streamChatNative(messages, {
      tools,
      model: draftModel,
      toolChoice: 'auto',
    });
    let result: NativeStreamReturn | undefined;
    while (true) {
      const it = await stream.next();
      if (it.done) {
        result = it.value;
        break;
      }
    }
    const calls = result?.toolCalls || [];
    const first = calls[0];
    if (!first) return null;
    let parsed: Record<string, unknown> = {};
    try {
      const j = JSON.parse(first.arguments || '{}');
      if (j && typeof j === 'object') parsed = j as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return {
      id: first.id || `draft-${Date.now()}`,
      name: first.name,
      argsJson: first.arguments || '{}',
      args: parsed,
    };
  } catch {
    return null;
  }
}
