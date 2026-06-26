/**
 * Tracing 模块 - 轻量可观测性
 * 记录工具执行、LLM 调用、状态转换等事件
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const TRACING_DIR = path.resolve(process.cwd(), 'data', 'logs');
const MAX_TRACES = 1000;

// 追踪事件类型
const TRACE_EVENTS = {
  LLM_CALL: 'llm_call',
  TOOL_EXEC: 'tool_exec',
  STATE_CHANGE: 'state_change',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  ERROR: 'error'
};

/**
 * 追踪记录结构
 */
class TraceRecord {
  constructor(event, data) {
    this.id = generateId();
    this.timestamp = new Date().toISOString();
    this.event = event;
    this.data = data;
    this.duration = data?.duration || 0;
  }
}

// 当前追踪会话
let currentSessionId = null;
let traces = [];
let traceEnabled = true;

/**
 * 生成唯一 ID
 */
function generateId() {
  return `trace_${Date.now().toString(36)}_${crypto.randomUUID().split('-')[0]}`;
}

/**
 * 初始化追踪会话
 */
function initTracing(sessionId) {
  currentSessionId = sessionId || generateId();
  traces = [];
  
  log(TRACE_EVENTS.SESSION_START, {
    sessionId: currentSessionId,
    pid: process.pid,
    nodeVersion: process.version
  });
  
  return currentSessionId;
}

/**
 * 记录追踪事件
 */
function log(event, data = {}) {
  if (!traceEnabled) return;
  
  const record = new TraceRecord(event, data);
  traces.push(record);
  
  // 限制内存中的追踪记录数量
  if (traces.length > MAX_TRACES) {
    traces = traces.slice(-MAX_TRACES / 2);
  }
  
  // 同时输出到 stderr（便于实时查看）
  const color = getEventColor(event);
  console.error(`[TRACE:${color}${event}\x1b[0m] ${data.tool || data.action || ''} (${record.duration}ms)`);
  
  return record;
}

/**
 * 获取事件颜色
 */
function getEventColor(event) {
  switch (event) {
    case TRACE_EVENTS.LLM_CALL: return '\x1b[94m'; // 蓝色
    case TRACE_EVENTS.TOOL_EXEC: return '\x1b[96m'; // 青色
    case TRACE_EVENTS.ERROR: return '\x1b[91m'; // 红色
    case TRACE_EVENTS.STATE_CHANGE: return '\x1b[93m'; // 黄色
    default: return '\x1b[90m'; // 灰色
  }
}

/**
 * 追踪 LLM 调用
 */
function traceLLMCall(model, inputLength, outputLength, duration, tokensUsed = null) {
  return log(TRACE_EVENTS.LLM_CALL, {
    model,
    inputLength,
    outputLength,
    tokensUsed,
    duration
  });
}

/**
 * 追踪工具执行
 */
function traceToolExec(toolName, args, result, duration, success) {
  return log(TRACE_EVENTS.TOOL_EXEC, {
    tool: toolName,
    args: sanitizeArgs(args),
    success,
    resultSize: typeof result === 'string' ? result.length : JSON.stringify(result).length,
    duration
  });
}

/**
 * 追踪状态转换
 */
function traceStateChange(fromState, toState, reason = null) {
  return log(TRACE_EVENTS.STATE_CHANGE, {
    from: fromState,
    to: toState,
    reason
  });
}

/**
 * 追踪错误
 */
function traceError(error, context = {}) {
  return log(TRACE_EVENTS.ERROR, {
    message: error.message,
    stack: process.env.DEBUG === 'true' ? error.stack : undefined,
    ...context
  });
}

/**
 * 清理敏感参数
 */
function sanitizeArgs(args) {
  if (!args) return {};
  if (typeof args !== 'object') return {};
  
  const sanitized = {};
  const sensitiveKeys = ['password', 'apiKey', 'token', 'secret', 'auth'];
  
  for (const [key, value] of Object.entries(args)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '***';
    } else if (typeof value === 'string' && value.length > 100) {
      sanitized[key] = value.slice(0, 100) + '...';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * 获取当前追踪统计
 */
function getStats() {
  const stats = {
    sessionId: currentSessionId,
    totalTraces: traces.length,
    events: {}
  };
  
  for (const trace of traces) {
    stats.events[trace.event] = (stats.events[trace.event] || 0) + 1;
  }
  
  // 计算总耗时
  const toolExecs = traces.filter(t => t.event === TRACE_EVENTS.TOOL_EXEC);
  if (toolExecs.length > 0) {
    stats.totalToolDuration = toolExecs.reduce((sum, t) => sum + t.duration, 0);
    stats.avgToolDuration = Math.round(stats.totalToolDuration / toolExecs.length);
  }
  
  // Token 统计
  const llmCalls = traces.filter(t => t.event === TRACE_EVENTS.LLM_CALL);
  if (llmCalls.length > 0) {
    stats.totalInputTokens = llmCalls.reduce((sum, t) => sum + (t.data.inputLength || 0), 0);
    stats.totalOutputTokens = llmCalls.reduce((sum, t) => sum + (t.data.outputLength || 0), 0);
  }
  
  return stats;
}

/**
 * 保存追踪记录到文件
 */
function saveTraces() {
  if (traces.length === 0) return;
  
  try {
    if (!existsSync(TRACING_DIR)) {
      mkdirSync(TRACING_DIR, { recursive: true });
    }
    
    const date = new Date().toISOString().split('T')[0];
    const fileName = `trace_${currentSessionId}_${date}.json`;
    const filePath = path.join(TRACING_DIR, fileName);
    
    const data = {
      sessionId: currentSessionId,
      savedAt: new Date().toISOString(),
      stats: getStats(),
      traces: traces.slice(-100)  // 只保存最近 100 条
    };
    
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.error(`[TRACE] 已保存追踪记录到 ${filePath}`);
  } catch (e) {
    console.error(`[TRACE] 保存失败: ${e.message}`);
  }
}

/**
 * 启用/禁用追踪
 */
function setTracingEnabled(enabled) {
  traceEnabled = enabled;
  console.error(`[TRACE] 追踪已${enabled ? '启用' : '禁用'}`);
}

/**
 * 获取最近的追踪记录
 */
function getRecentTraces(count = 50) {
  return traces.slice(-count);
}

/**
 * 清除追踪记录
 */
function clearTraces() {
  traces = [];
  console.error('[TRACE] 追踪记录已清除');
}

/**
 * 结束追踪会话
 */
function endTracing() {
  if (currentSessionId) {
    log(TRACE_EVENTS.SESSION_END, { sessionId: currentSessionId });
    saveTraces();
  }
}

/**
 * 创建计时器
 */
function startTimer() {
  return {
    start: Date.now(),
    end: null,
    get duration() {
      return this.end ? this.end - this.start : Date.now() - this.start;
    },
    stop() {
      this.end = Date.now();
      return this.duration;
    }
  };
}

export {
  TRACE_EVENTS,
  initTracing,
  log,
  traceLLMCall,
  traceToolExec,
  traceStateChange,
  traceError,
  getStats,
  saveTraces,
  setTracingEnabled,
  getRecentTraces,
  clearTraces,
  endTracing,
  startTimer
};
