import crypto from 'crypto';

/**
 * LaneQueue —— 面向会话的串行任务队列。
 * 每个 lane key（如 `workspace:channel:userId`）独立一条 FIFO 队列，
 * 同一 Lane 内任务严格串行，不同 Lane 之间互不阻塞，从根本上消除并发竞态。
 */
interface LaneItem<T = unknown> {
  id: string;
  key: string;
  task: () => Promise<T> | T;
  priority: number;
  enqueuedAt: number;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

interface LaneState {
  lanes: Array<{ key: string; pending: number; running: boolean }>;
  total: { enqueued: number; completed: number; failed: number };
}

const queues = new Map<string, LaneItem[]>();
const runningLanes = new Set<string>();

let totalEnqueued = 0;
let totalCompleted = 0;
let totalFailed = 0;

/** 主 Agent 的全局串行 Lane：终端 / WebSocket / 微信 / Webhook / Heartbeat 统一入口 */
const AGENT_LANE_KEY = 'agent:main';

function nextItem<T = unknown>(key: string): LaneItem<T> | null {
  const queue = queues.get(key);
  if (!queue || queue.length === 0) return null;
  return queue[0] as LaneItem as LaneItem<T>;
}

async function drain(key: string): Promise<void> {
  if (runningLanes.has(key)) return;
  runningLanes.add(key);
  try {
    while (true) {
      const item = nextItem(key);
      if (!item) break;
      const queue = queues.get(key)!;
      queue.shift();
      try {
        const result = await item.task();
        totalCompleted++;
        item.resolve(result);
      } catch (e) {
        totalFailed++;
        item.reject(e);
      }
    }
  } finally {
    runningLanes.delete(key);
    if (queues.get(key)?.length === 0) {
      queues.delete(key);
    }
  }
}

/**
 * 入队一个任务。返回的 Promise 在该任务真正执行完成后 resolve。
 * @param key   lane 键，按此隔离串行执行
 * @param task  要执行的任务
 * @param priority 可选的优先级（越大越靠前，默认 0）
 */
function enqueue<T = unknown>(key: string, task: () => Promise<T> | T, priority = 0): Promise<T> {
  const item: LaneItem<T> = {
    id: crypto.randomUUID(),
    key,
    task,
    priority,
    enqueuedAt: Date.now(),
    resolve: () => {},
    reject: () => {},
  };
  const promise = new Promise<T>((resolve, reject) => {
    item.resolve = resolve;
    item.reject = reject;
  });

  const queue = queues.get(key) ?? [];
  // 同优先级按入队顺序；高优先级任务插到同优先级组最前
  const insertAt = queue.findIndex((q) => q.priority < priority);
  const genericItem = item as unknown as LaneItem;
  if (insertAt === -1) {
    queue.push(genericItem);
  } else {
    queue.splice(insertAt, 0, genericItem);
  }
  queues.set(key, queue);
  totalEnqueued++;

  void drain(key);
  return promise;
}

function getLaneState(): LaneState {
  const lanes: LaneState['lanes'] = [];
  for (const [key, queue] of queues.entries()) {
    lanes.push({ key, pending: queue.length, running: runningLanes.has(key) });
  }
  lanes.sort((a, b) => b.pending - a.pending);
  return {
    lanes,
    total: { enqueued: totalEnqueued, completed: totalCompleted, failed: totalFailed },
  };
}

function getLaneCount(): number {
  return queues.size;
}

function getPendingCount(key: string): number {
  return queues.get(key)?.length ?? 0;
}

const laneQueue = {
  enqueue,
  getLaneState,
  getStateSnapshot: getLaneState,
  getLaneCount,
  getPendingCount,
};

export { laneQueue };
export { AGENT_LANE_KEY };
export type { LaneState };
