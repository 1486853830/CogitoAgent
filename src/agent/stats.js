import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_FILE = path.join(__dirname, '../../data/stats.json');

let toolStats = {};
let sessionStats = {
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
  todayTokens: 0
};

function initStats() {
  toolStats = {};
  const categories = ['file', 'web', 'system', 'browser', 'code', 'git', 'task', 'memory', 'data', 'db', 'email', 'monitor', 'scheduler', 'ocr', 'office'];
  for (const cat of categories) {
    toolStats[cat] = {
      callCount: 0,
      successCount: 0,
      failCount: 0,
      totalTime: 0,
      tools: {}
    };
  }
}

async function loadStats() {
  try {
    const data = await fs.readFile(STATS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    toolStats = parsed.toolStats || {};
    // 合并旧数据，确保新增的 token 字段存在（向后兼容旧 stats.json）
    const loaded = parsed.sessionStats || {};
    sessionStats = { ...sessionStats, ...loaded };
    const tokenFields = [
      'totalInputTokens', 'totalOutputTokens', 'totalTokens',
      'todayInputTokens', 'todayOutputTokens', 'todayTokens'
    ];
    for (const k of tokenFields) {
      if (typeof sessionStats[k] !== 'number') sessionStats[k] = 0;
    }
  } catch {
    initStats();
  }
}

async function saveStats() {
  try {
    const dir = path.dirname(STATS_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(STATS_FILE, JSON.stringify({ toolStats, sessionStats }, null, 2));
  } catch (e) {
    console.error('[Stats] 保存统计数据失败:', e.message);
  }
}

function recordToolCall(toolName, category, success, duration) {
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

function recordSession() {
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

function recordMessage() {
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

function recordThinkingTime(duration) {
  sessionStats.totalThinkingTime += duration;
  saveStats();
}

/**
 * 记录 token 用量
 * @param {number} inputTokens 输入 token 数
 * @param {number} outputTokens 输出 token 数
 */
function recordTokenUsage(inputTokens, outputTokens) {
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
    // 跨天时同步重置其他 today 计数器
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

function getToolStats() {
  return { ...toolStats };
}

function getSessionStats() {
  return { ...sessionStats };
}

function getToolUsageByCategory() {
  const result = [];
  for (const [category, stats] of Object.entries(toolStats)) {
    result.push({
      category,
      callCount: stats.callCount,
      successCount: stats.successCount,
      failCount: stats.failCount,
      successRate: stats.callCount > 0 ? Math.round(stats.successCount / stats.callCount * 100) : 0,
      avgTime: stats.callCount > 0 ? Math.round(stats.totalTime / stats.callCount * 100) / 100 : 0
    });
  }
  return result;
}

function getTopUsedTools(limit = 10) {
  const tools = [];
  for (const [category, catStats] of Object.entries(toolStats)) {
    for (const [toolName, stats] of Object.entries(catStats.tools)) {
      tools.push({
        toolName,
        category,
        callCount: stats.callCount,
        successCount: stats.successCount,
        failCount: stats.failCount,
        successRate: stats.callCount > 0 ? Math.round(stats.successCount / stats.callCount * 100) : 0,
        avgTime: stats.callCount > 0 ? Math.round(stats.totalTime / stats.callCount * 100) / 100 : 0
      });
    }
  }
  return tools.sort((a, b) => b.callCount - a.callCount).slice(0, limit);
}

function resetStats() {
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
    lastDate: new Date().toISOString().split('T')[0]
  };
  saveStats();
}

initStats();
loadStats();

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
  resetStats
};