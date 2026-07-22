import fs from 'fs/promises';
import path from 'path';

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
  lastDate?: string;
  [key: string]: number | string | undefined;
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
    'gis',
    'bio',
    'med',
    'chem',
    'finance',
    'math',
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
    ];
    for (const k of tokenFields) {
      if (typeof sessionStats[k] !== 'number') sessionStats[k] = 0;
    }
  } catch {
    initStats();
  }
}

async function saveStats(): Promise<void> {
  try {
    const dir = path.dirname(STATS_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(STATS_FILE, JSON.stringify({ toolStats, sessionStats }, null, 2));
  } catch (e) {
    console.error('[Stats] 保存统计数据失败:', (e as Error).message);
  }
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

  const today = new Date().toISOString().split('T')[0];
  if (sessionStats.lastDate !== today) {
    sessionStats.lastDate = today;
    sessionStats.todayToolCalls = 1;
  } else {
    sessionStats.todayToolCalls++;
  }

  saveStats();
}

function recordSession(): void {
  sessionStats.totalSessions++;
  const today = new Date().toISOString().split('T')[0];
  if (sessionStats.lastDate !== today) {
    sessionStats.lastDate = today;
    sessionStats.todaySessions = 1;
  } else {
    sessionStats.todaySessions++;
  }
  saveStats();
}

function recordMessage(): void {
  sessionStats.totalMessages++;
  const today = new Date().toISOString().split('T')[0];
  if (sessionStats.lastDate !== today) {
    sessionStats.lastDate = today;
    sessionStats.todayMessages = 1;
  } else {
    sessionStats.todayMessages++;
  }
  saveStats();
}

function recordThinkingTime(duration: number): void {
  sessionStats.totalThinkingTime += duration;
  saveStats();
}

function recordTokenUsage(inputTokens: number, outputTokens: number): void {
  const input = Number(inputTokens) || 0;
  const output = Number(outputTokens) || 0;
  const total = input + output;

  sessionStats.totalInputTokens += input;
  sessionStats.totalOutputTokens += output;
  sessionStats.totalTokens += total;

  const today = new Date().toISOString().split('T')[0];
  if (sessionStats.lastDate !== today) {
    sessionStats.lastDate = today;
    sessionStats.todayInputTokens = input;
    sessionStats.todayOutputTokens = output;
    sessionStats.todayTokens = total;
    sessionStats.todaySessions = 0;
    sessionStats.todayMessages = 0;
    sessionStats.todayToolCalls = 0;
  } else {
    sessionStats.todayInputTokens += input;
    sessionStats.todayOutputTokens += output;
    sessionStats.todayTokens += total;
  }

  saveStats();
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
    lastDate: new Date().toISOString().split('T')[0],
  };
  saveStats();
}

initStats();
await loadStats();

export {
  recordToolCall,
  recordSession,
  recordMessage,
  recordThinkingTime,
  recordTokenUsage,
  getToolStats,
  getSessionStats,
  getToolUsageByCategory,
  getTopUsedTools,
  resetStats,
};
