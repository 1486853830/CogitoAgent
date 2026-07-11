/**
 * 思维链追踪模块
 * 记录 Agent 的思考步骤并通过 WebSocket 广播给前端
 */

import { broadcast } from '../io/ws-server.js';

let thoughtTrace = [];

/**
 * 追踪一个新步骤
 */
function traceStep(name, details = {}, status = 'running') {
  const step = {
    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    name,
    details,
    status,
    startTime: new Date().toISOString(),
    duration: 0
  };
  thoughtTrace.push(step);
  broadcast('thought-trace', { action: 'add', step });
  return step;
}

/**
 * 更新某个步骤的状态
 */
function updateTraceStep(id, updates) {
  const step = thoughtTrace.find(s => s.id === id);
  if (step) {
    const start = new Date(step.startTime).getTime();
    step.duration = Math.round((Date.now() - start) / 1000 * 100) / 100;
    Object.assign(step, updates);
    broadcast('thought-trace', { action: 'update', step });
  }
}

/**
 * 清空思维链
 */
function clearThoughtTrace() {
  thoughtTrace = [];
  broadcast('thought-trace', { action: 'clear' });
}

/**
 * 获取思维链副本
 */
function getThoughtTrace() {
  return [...thoughtTrace];
}

export { traceStep, updateTraceStep, clearThoughtTrace, getThoughtTrace };
