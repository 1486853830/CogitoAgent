import fs from 'fs/promises';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { estimateCost } from '../api/router.ts';

const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const STATS_FILE = path.join(DATA_DIR, 'data', 'stats.json');

interface ToolCategoryStats {
  callCount: number;
  successCount: number;
  failCount: number;
  totalTime: number;
  tools: Record<
    string,
    { callCount: number; successCount: number; failCount: number; totalTime: number }
  >;
}

interface DailyStats {
  date: string;
  sessions: number;
  messages: number;
  toolCalls: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost?: number;
}

interface SessionStats {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  totalThinkingTime: number;
  todaySessions: number;
  todayMessages: number;
  todayToolCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  todayInputTokens: number;
  todayOutputTokens: number;
  todayTokens: number;
  totalCost: number;
  todayCost: number;
  lastDate?: string;
  // 按天历史(用于热力图),key 为 YYYY-MM-DD
  dailyHistory?: Record<string, DailyStats & { cost?: number }>;
  [key: string]:
    number | string | undefined | Record<string, DailyStats & { cost?: number }> | boolean;
}

let toolStats: Record<string, ToolCategoryStats> = {};
let sessionStats: SessionStats = {
  totalSessions: 0,
  totalMessages: 0,
  totalToolCalls: 0,
  totalThinkingTime: 0,
  todaySessions: 0,
  todayMessages: 0,
  todayToolCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  todayInputTokens: 0,
  todayOutputTokens: 0,
  todayTokens: 0,
  totalCost: 0,
  todayCost: 0,
};

function initStats(): void {
  toolStats = {};
  const categories = [
    'file',
    'web',
    'system',
    'browser',
    'code',
    'git',
    'task',
    'memory',
    'data',
    'db',
    'email',
    'monitor',
    'scheduler',
    'ocr',
    'office',
    'vision',
    'cluster',
    'wechat',
  ];
  for (const cat of categories) {
    toolStats[cat] = {
      callCount: 0,
      successCount: 0,
      failCount: 0,
      totalTime: 0,
      tools: {},
    };
  }
}

async function loadStats(): Promise<void> {
  try {
    const data = await fs.readFile(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    toolStats = parsed.toolStats || {};
    const loaded = parsed.sessionStats || {};
    sessionStats = { ...sessionStats, ...loaded };
    const tokenFields = [
      'totalInputTokens',
      'totalOutputTokens',
      'totalTokens',
      'todayInputTokens',
      'todayOutputTokens',
      'todayTokens',
      'totalCost',
      'todayCost',
    ];
    for (const k of tokenFields) {
      if (typeof sessionStats[k] !== 'number') sessionStats[k] = 0;
    }
  } catch {
    initStats();
  }
}

let saveStatsTimer: ReturnType<typeof setTimeout> | null = null;
let saveQueue: Promise<void> = Promise.resolve();

/**
 * 串行化写入，避免并发 writeFile 交错导致文件损坏。
 * 返回的 Promise 可被调用方 await（例如进程退出前 flush）。
 */
function enqueueSave(): Promise<void> {
  const run = async () => {
    try {
      const dir = path.dirname(STATS_FILE);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(STATS_FILE, JSON.stringify({ toolStats, sessionStats }, null, 2));
    } catch (e) {
      console.error('[Stats] 保存统计数据失败:', (e as Error).message);
    }
  };
  const next = saveQueue.then(run);
  // 防止队列无限增长；失败也已在上层吞掉
  saveQueue = next.catch(() => undefined);
  return next;
}

/** 同步调度延迟保存——注意：此函数不等待写入完成，调用方不应依赖写入结果。 */
function saveStats(): void {
  if (saveStatsTimer) return;
  saveStatsTimer = setTimeout(() => {
    saveStatsTimer = null;
    void enqueueSave();
  }, 100);
}

/**
 * 立即写入并等待完成（供进程退出前 flush 使用）。
 * 与延迟保存共用串行队列，保证不会丢掉最后一批数据。
 */
async function flushStats(): Promise<void> {
  if (saveStatsTimer) {
    clearTimeout(saveStatsTimer);
    saveStatsTimer = null;
  }
  await enqueueSave();
}

/**
 * 进程退出时同步刷盘。异步 flush 在退出事件里不可靠，
 * 这里用 writeFileSync 直接落盘，保证统计数据不丢失。
 */
function flushStatsSync(): void {
  if (saveStatsTimer) {
    clearTimeout(saveStatsTimer);
    saveStatsTimer = null;
  }
  try {
    const dir = path.dirname(STATS_FILE);
    mkdirSync(dir, { recursive: true });
    writeFileSync(STATS_FILE, JSON.stringify({ toolStats, sessionStats }, null, 2));
  } catch (e) {
    console.error('[Stats] 同步保存统计数据失败:', (e as Error).message);
  }
}

process.on('exit', flushStatsSync);
process.on('SIGINT', () => {
  flushStatsSync();
  process.exit(0);
});

/**
 * 检查日期是否变更，若跨日则统一重置所有 today 计数器
 * 跨日时把昨天的累计归档到 dailyHistory(供热力图使用)
 */
function checkAndResetDay(): void {
  const today = new Date().toISOString().split('T')[0];
  if (sessionStats.lastDate !== today) {
    // 把上一个 lastDate 对应的"今天累计"归档到历史
    if (sessionStats.lastDate) {
      if (!sessionStats.dailyHistory) sessionStats.dailyHistory = {};
      sessionStats.dailyHistory[sessionStats.lastDate] = {
        date: sessionStats.lastDate,
        sessions: sessionStats.todaySessions,
        messages: sessionStats.todayMessages,
        toolCalls: sessionStats.todayToolCalls,
        tokens: sessionStats.todayTokens,
        inputTokens: sessionStats.todayInputTokens,
        outputTokens: sessionStats.todayOutputTokens,
        cost: sessionStats.todayCost,
      };
    }
    sessionStats.lastDate = today;
    sessionStats.todaySessions = 0;
    sessionStats.todayMessages = 0;
    sessionStats.todayToolCalls = 0;
    sessionStats.todayInputTokens = 0;
    sessionStats.todayOutputTokens = 0;
    sessionStats.todayTokens = 0;
    sessionStats.todayCost = 0;
  }
}

/**
 * 实时累计当天历史——记录当前进行中的当天数据
 * 热力图读取时需要把今日"实时"数据合并进 dailyHistory
 */
function getMergedDailyHistory(days = 365): DailyStats[] {
  const history: Record<string, DailyStats> = {};
  // 先复制历史
  if (sessionStats.dailyHistory) {
    for (const [k, v] of Object.entries(sessionStats.dailyHistory)) {
      history[k] = { ...v };
    }
  }
  // 合并今日实时数据
  const today = sessionStats.lastDate || new Date().toISOString().split('T')[0];
  history[today] = {
    date: today,
    sessions: sessionStats.todaySessions,
    messages: sessionStats.todayMessages,
    toolCalls: sessionStats.todayToolCalls,
    tokens: sessionStats.todayTokens,
    inputTokens: sessionStats.todayInputTokens,
    outputTokens: sessionStats.todayOutputTokens,
    cost: sessionStats.todayCost,
  };
  // 排序并截取最近 days 天
  return Object.values(history)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-days);
}

function recordToolCall(
  toolName: string,
  category: string,
  success: boolean,
  duration: number,
): void {
  if (!toolStats[category]) {
    toolStats[category] = { callCount: 0, successCount: 0, failCount: 0, totalTime: 0, tools: {} };
  }

  const catStats = toolStats[category];
  catStats.callCount++;
  catStats.totalTime += duration;

  if (success) {
    catStats.successCount++;
  } else {
    catStats.failCount++;
  }

  if (!catStats.tools[toolName]) {
    catStats.tools[toolName] = { callCount: 0, successCount: 0, failCount: 0, totalTime: 0 };
  }

  const toolStat = catStats.tools[toolName];
  toolStat.callCount++;
  toolStat.totalTime += duration;

  if (success) {
    toolStat.successCount++;
  } else {
    toolStat.failCount++;
  }

  sessionStats.totalToolCalls++;

  checkAndResetDay();
  sessionStats.todayToolCalls++;

  saveStats();
}

function recordSession(): void {
  sessionStats.totalSessions++;
  checkAndResetDay();
  sessionStats.todaySessions++;
  saveStats();
}

function recordMessage(): void {
  sessionStats.totalMessages++;
  checkAndResetDay();
  sessionStats.todayMessages++;
  saveStats();
}

function recordTokenUsage(inputTokens: number, outputTokens: number): number {
  const input = Number(inputTokens) || 0;
  const output = Number(outputTokens) || 0;
  const total = input + output;

  sessionStats.totalInputTokens += input;
  sessionStats.totalOutputTokens += output;
  sessionStats.totalTokens += total;

  // 成本估算：基于当前模型价格表 / 环境变量覆盖
  const cost = estimateCost(input, output);
  sessionStats.totalCost += cost;

  checkAndResetDay();
  sessionStats.todayInputTokens += input;
  sessionStats.todayOutputTokens += output;
  sessionStats.todayTokens += total;
  sessionStats.todayCost += cost;

  saveStats();
  return cost;
}

function getToolStats(): Record<string, ToolCategoryStats> {
  return { ...toolStats };
}

function getSessionStats(): SessionStats {
  return { ...sessionStats };
}

function getToolUsageByCategory(): Array<{
  category: string;
  callCount: number;
  successCount: number;
  failCount: number;
  successRate: number;
  avgTime: number;
}> {
  const result: Array<{
    category: string;
    callCount: number;
    successCount: number;
    failCount: number;
    successRate: number;
    avgTime: number;
  }> = [];
  for (const [category, stats] of Object.entries(toolStats)) {
    result.push({
      category,
      callCount: stats.callCount,
      successCount: stats.successCount,
      failCount: stats.failCount,
      successRate:
        stats.callCount > 0 ? Math.round((stats.successCount / stats.callCount) * 100) : 0,
      avgTime:
        stats.callCount > 0 ? Math.round((stats.totalTime / stats.callCount) * 100) / 100 : 0,
    });
  }
  return result;
}

function getTopUsedTools(limit = 10): Array<{
  toolName: string;
  category: string;
  callCount: number;
  successCount: number;
  failCount: number;
  successRate: number;
  avgTime: number;
}> {
  const tools: Array<{
    toolName: string;
    category: string;
    callCount: number;
    successCount: number;
    failCount: number;
    successRate: number;
    avgTime: number;
  }> = [];
  for (const [category, catStats] of Object.entries(toolStats)) {
    for (const [toolName, stats] of Object.entries(catStats.tools)) {
      tools.push({
        toolName,
        category,
        callCount: stats.callCount,
        successCount: stats.successCount,
        failCount: stats.failCount,
        successRate:
          stats.callCount > 0 ? Math.round((stats.successCount / stats.callCount) * 100) : 0,
        avgTime:
          stats.callCount > 0 ? Math.round((stats.totalTime / stats.callCount) * 100) / 100 : 0,
      });
    }
  }
  return tools.sort((a, b) => b.callCount - a.callCount).slice(0, limit);
}

function resetStats(): void {
  initStats();
  sessionStats = {
    totalSessions: 0,
    totalMessages: 0,
    totalToolCalls: 0,
    totalThinkingTime: 0,
    todaySessions: 0,
    todayMessages: 0,
    todayToolCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    todayInputTokens: 0,
    todayOutputTokens: 0,
    todayTokens: 0,
    totalCost: 0,
    todayCost: 0,
    lastDate: new Date().toISOString().split('T')[0],
    dailyHistory: {},
  };
  saveStats();
}

initStats();
// 启动时异步加载历史统计。因为历史数据只在记录时被增量叠加，
// 即便加载还没完成就开始记录，也只会少加一段历史，不会产生错误计数。
// 使用 .catch 兜底，避免未处理的 rejection 影响进程退出。
loadStats().catch(() => {
  console.error('[Stats] 加载历史统计数据失败');
});

export {
  recordToolCall,
  recordSession,
  recordMessage,
  recordTokenUsage,
  getToolStats,
  getSessionStats,
  getToolUsageByCategory,
  getTopUsedTools,
  getMergedDailyHistory,
  resetStats,
  flushStats,
};
