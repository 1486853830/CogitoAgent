import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { broadcast } from '../io/ws-server.ts';

/**
 * Heartbeat —— 事件驱动的主动行为层（对齐 OpenClaw 的心跳 + Markdown TODO）。
 * 周期性检查工作区 TODO.md 中未勾选的待办项并主动推给 Agent，
 * 让 Agent 从"被动等待输入"转变为"有活就干"。
 */

export interface TodoItem {
  line: number;
  text: string;
  done: boolean;
}

export interface HeartbeatOptions {
  workspace: string;
  enabled?: boolean;
  intervalMs?: number;
  maxTasksPerTick?: number;
}

export type HeartbeatRunner = (taskText: string) => void | Promise<void>;

let timer: ReturnType<typeof setInterval> | null = null;
let firstTimer: ReturnType<typeof setTimeout> | null = null;
let opts: HeartbeatOptions | null = null;
let runner: HeartbeatRunner | null = null;
const lastPush = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000;

export function getTodoPath(workspace: string): string {
  return path.join(workspace, 'TODO.md');
}

/** 解析工作区 TODO.md 中的任务清单（Markdown 复选框） */
export function parseTodoItems(filePath: string): TodoItem[] {
  try {
    if (!existsSync(filePath)) return [];
    const content = readFileSync(filePath, 'utf-8');
    const items: TodoItem[] = [];
    let lineNo = 0;
    for (const line of content.split('\n')) {
      lineNo++;
      const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (match) {
        items.push({ line: lineNo, text: match[2].trim(), done: match[1].toLowerCase() === 'x' });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function tick(): void {
  if (!opts || opts.enabled === false || !runner) return;

  const filePath = getTodoPath(opts.workspace);
  const items = parseTodoItems(filePath);
  if (items.length === 0) return;

  const pending = items.filter((item) => !item.done).sort((a, b) => a.line - b.line);
  if (pending.length === 0) {
    broadcast('heartbeat', { type: 'idle', pending: 0, checkedAt: new Date().toISOString() });
    return;
  }

  const max = opts.maxTasksPerTick ?? 1;
  let pushed = 0;
  const now = Date.now();

  for (const item of pending) {
    if (pushed >= max) break;
    const key = `${item.line}:${item.text}`;
    const last = lastPush.get(key);
    if (last !== undefined && now - last < COOLDOWN_MS) continue;
    lastPush.set(key, now);

    const taskText = [
      `[主动任务 · TODO.md] 你的工作区待办清单里有一项未完成任务：「${item.text}」。`,
      `请主动处理这项任务（可直接调用工具推进，无需等待用户确认）。`,
      `完成以后，请把该清单项标记为已完成（如无特殊说明，在 TODO.md 中把对应行改为 [ ] → [x]，或通过记忆工具记录完成）。`,
    ].join('\n');

    const result = runner(taskText);
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch((e) =>
        console.error('[Heartbeat] 任务推送失败:', (e as Error).message),
      );
    }
    pushed++;
  }

  // 清理超过冷却期 2 倍的过期条目，防止 lastPush Map 无限增长
  const staleBefore = now - COOLDOWN_MS * 2;
  for (const [k, t] of lastPush) {
    if (t < staleBefore) lastPush.delete(k);
  }

  broadcast('heartbeat', {
    type: 'active',
    pending: pending.length,
    pushed,
    at: new Date().toISOString(),
  });
}

export function startHeartbeat(options: HeartbeatOptions, run: HeartbeatRunner): void {
  stopHeartbeat();
  opts = options;
  runner = run;
  if (opts.enabled === false) return;

  const interval = opts.intervalMs ?? 60 * 1000;
  // 启动即轮询一次，随后按固定间隔
  firstTimer = setTimeout(() => tick(), 1000);
  if (typeof firstTimer.unref === 'function') firstTimer.unref();
  timer = setInterval(tick, Math.max(interval, 1000));
  if (typeof timer.unref === 'function') timer.unref();
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (firstTimer) {
    clearTimeout(firstTimer);
    firstTimer = null;
  }
  opts = null;
  runner = null;
}

export function getHeartbeatStatus(): {
  enabled: boolean;
  intervalMs: number;
  todoPath: string;
} | null {
  if (!opts) return null;
  return {
    enabled: opts.enabled !== false,
    intervalMs: opts.intervalMs ?? 60000,
    todoPath: getTodoPath(opts.workspace),
  };
}
