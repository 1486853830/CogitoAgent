/**
 * Agent 桥接模块
 * WebSocket 客户端，连接终端 Agent 的 WebSocket 服务
 * 将 Electron IPC 消息转发到 Agent，将 Agent 消息转发到渲染进程
 */

import { ipcMain } from 'electron';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

const WS_URL = 'ws://localhost:9527';
let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;
// 是否应当重连。窗口全部关闭后置为 false，避免 ws.close() 触发 close 事件
// 又调度重连，导致连接空转泄漏。
let shouldReconnect = true;
const connectedWindows = new Set();
let USER_DATA_DIR = '';

function setUserDataDir(dir) {
  USER_DATA_DIR = dir;
}

/**
 * 校验 session.id 格式，防止路径穿越。
 * 与 main.js isValidSessionId 保持一致：sess_ + base36时间戳 + 8位hex。
 */
function isValidSessionId(id) {
  return typeof id === 'string' && /^sess_[A-Za-z0-9_-]+$/.test(id);
}

/**
 * 过滤 meta 中的非法 session.id，防止路径穿越写入 meta.json 后被 get-sessions 读取。
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const sanitized = { ...meta };
  if (Array.isArray(sanitized.sessions)) {
    sanitized.sessions = sanitized.sessions.filter((s) => s && isValidSessionId(s.id));
  }
  if (sanitized.activeId && !isValidSessionId(sanitized.activeId)) {
    delete sanitized.activeId;
  }
  return sanitized;
}

/**
 * 读取 ws token（agent 启动时写入 USER_DATA_DIR/.ws-token）
 */
function readWsToken() {
  if (!USER_DATA_DIR) return '';
  try {
    const tokenPath = path.join(USER_DATA_DIR, '.ws-token');
    return fs.readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    // token 文件尚未写入，返回空（连接会被拒绝，3 秒后重连重试）
    return '';
  }
}

/**
 * 连接 WebSocket 服务
 */
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  // 确保任何连接尝试（包括重连）都设置 shouldReconnect = true，
  // 避免在尚未触达 open 状态时 close 事件因 shouldReconnect 为 false 而跳过重连调度
  shouldReconnect = true;

  console.log('[AgentBridge] 正在连接 Agent...');
  // 携带 token 通过 ws-server 校验。优先走 x-ws-token header（避免 token 出现在
  // URL query 中被 HTTP 层/日志记录），服务端同时兼容两种传法。
  const token = readWsToken();
  const headers = token ? { 'x-ws-token': token } : {};
  ws = new WebSocket(WS_URL, { headers });

  ws.on('open', () => {
    console.log('[AgentBridge] 已连接到 Agent');
    shouldReconnect = true;
    reconnectAttempts = 0; // 连接成功，重置退避计数
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'session-meta-update') {
        if (USER_DATA_DIR) {
          const metaPath = path.join(USER_DATA_DIR, 'data', 'sessions', 'meta.json');
          try {
            fs.mkdirSync(path.dirname(metaPath), { recursive: true });
            // 过滤非法 session.id，防止路径穿越（攻击者可构造 session.id 读写任意文件）
            const safeMeta = sanitizeMeta(msg.meta);
            const tempFile = metaPath + '.tmp';
            const content = JSON.stringify(safeMeta, null, 2);
            let fd;
            try {
              fd = fs.openSync(tempFile, 'w');
              fs.writeSync(fd, content, 0, 'utf-8');
              fs.fsyncSync(fd);
              fs.closeSync(fd);
              fd = undefined;
              fs.renameSync(tempFile, metaPath);
            } catch (e) {
              if (fd !== undefined) {
                try {
                  fs.closeSync(fd);
                } catch {
                  /* 关闭 fd 失败时忽略，交给系统回收 */
                }
              }
              // fallback: copy + unlink
              try {
                fs.copyFileSync(tempFile, metaPath);
                fs.unlinkSync(tempFile);
              } catch {
                /* 兜底失败时由外层 throw 原始错误 */
              }
              throw e;
            }
            console.log('[AgentBridge] 会话元数据已更新');
            connectedWindows.forEach((win) => {
              if (!win.isDestroyed()) {
                win.webContents.send('session-updated');
              }
            });
          } catch (e) {
            console.error('[AgentBridge] 会话元数据保存失败:', e.message);
          }
        }
        return;
      }

      if (msg.type === 'persona-switched') {
        console.log('[AgentBridge] Persona 已切换:', msg.persona);
        connectedWindows.forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('persona-switched', { persona: msg.persona });
          }
        });
        return;
      }

      connectedWindows.forEach((win) => {
        if (!win.isDestroyed()) {
          if (msg.type === 'agent-state') {
            win.webContents.send('agent-state', msg.state);
          } else if (msg.type === 'thought-trace') {
            win.webContents.send('thought-trace', { type: msg.action, step: msg.step });
          } else if (msg.type === 'cluster-state') {
            win.webContents.send('cluster-state', msg);
          } else if (msg.type === 'wechat-state') {
            win.webContents.send('wechat-state', msg.data);
          } else if (msg.type === 'wechat-message') {
            win.webContents.send('wechat-message', {
              direction: msg.direction,
              from: msg.from,
              to: msg.to,
              text: msg.text,
              timestamp: msg.timestamp,
            });
          } else if (msg.type === 'wechat-qrcode') {
            win.webContents.send('wechat-qrcode', msg.data);
          } else if (msg.type === 'wechat-login-status') {
            win.webContents.send('wechat-login-status', msg.data);
          } else if (msg.type === 'token-usage') {
            win.webContents.send('token-usage', msg.data || msg);
          } else if (msg.type === 'confirmation-requested') {
            win.webContents.send('confirmation-requested', msg);
          } else if (msg.type === 'confirmation-resolved') {
            win.webContents.send('confirmation-resolved', msg);
          } else {
            win.webContents.send('agent-reply', msg);
          }
        }
      });
    } catch {
      // 忽略解析失败
    }
  });

  ws.on('close', () => {
    console.log('[AgentBridge] 连接断开');
    // 仅在一处调度重连：ws 库会先 emit error 再 emit close，若两处都设定时器，
    // 第二次赋值会覆盖引用，使第一个定时器成为孤儿无法清除，每次断线积累孤儿
    // 连接并重复转发消息。这里只在 close 中调度，且设新定时器前先清旧定时器。
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (shouldReconnect) {
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
      reconnectAttempts++;
      console.log(
        `[AgentBridge] ${(delay / 1000).toFixed(0)}秒后重连... (第${reconnectAttempts}次)`,
      );
      reconnectTimer = setTimeout(() => connect(), delay);
    }
  });

  ws.on('error', (err) => {
    // 仅记录日志，不在此调度重连：close 事件会随后触发并统一调度，
    // 避免与 close 回调重复设置定时器造成连接泄漏。
    console.log('[AgentBridge] 连接失败:', err.message);
  });
}

/**
 * 初始化 Agent 桥接
 * @param {BrowserWindow} win
 */
function initAgentBridge(win) {
  console.log('[AgentBridge] 窗口注册');

  // 注册窗口
  connectedWindows.add(win);

  // 连接 Agent WebSocket
  connect();

  // 窗口关闭时移除
  win.on('closed', () => {
    connectedWindows.delete(win);
    // 如果没有窗口了，关闭连接并停止重连
    if (connectedWindows.size === 0 && ws) {
      // 必须先置 false 再 close：ws.close() 会触发 'close' 事件，
      // 若 shouldReconnect 仍为 true 会调度重连定时器，导致无窗口时连接空转泄漏。
      shouldReconnect = false;
      ws.close();
      ws = null;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }
  });
}

// 处理来自渲染进程的用户消息，转发到 Agent（全局只注册一次）
let userMessageHandlerRegistered = false;
function ensureUserMessageHandler() {
  if (userMessageHandlerRegistered) return;
  userMessageHandlerRegistered = true;

  ipcMain.on('user-message', (_event, text) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'user-message', text }));
    }
  });

  // 危险操作确认：将前端的允许/拒绝转译为 Agent 可识别的 y/n 文本输入。
  // Agent 的 handleUserInput 在 AWAITING_CONFIRMATION 状态下按文本 y/n 处理。
  ipcMain.on('confirmation-response', (_event, confirmed) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'user-message', text: confirmed ? 'y' : 'n' }));
    }
  });

  // 请求历史（暂不支持，桌面端独立管理历史）
  ipcMain.on('request-history', (event) => {
    // event.reply 从 Electron v28 起已废弃，改用 event.sender.send
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('agent-history', []);
    }
  });

  // 请求 ID 生成器：单调递增，避免同毫秒并发请求（如监控页多个 widget 同时
  // 发起 stats-request）使用 Date.now() 碰撞导致响应串扰。
  let requestSeq = 0;
  function nextRequestId() {
    requestSeq += 1;
    return `${Date.now()}-${requestSeq}`;
  }

  // 统计数据与工具面板请求：使用单一消息处理器 + pending Map 管理，
  // 避免每次请求都注册新的 WS message 监听器导致累积泄漏。
  const pendingStatsRequests = new Map();
  const pendingToolsRequests = new Map();

  // 全局单一的 message 监听器，按 requestId 路由到对应调用方
  let globalStatsToolsHandler = null;
  function ensureGlobalStatsToolsHandler() {
    if (globalStatsToolsHandler) return;
    globalStatsToolsHandler = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (
          msg.type === 'stats-response' &&
          msg.requestId &&
          pendingStatsRequests.has(msg.requestId)
        ) {
          const entry = pendingStatsRequests.get(msg.requestId);
          clearTimeout(entry.timer);
          if (entry.sender && !entry.sender.isDestroyed()) {
            entry.sender.send('stats-response', msg);
          }
          pendingStatsRequests.delete(msg.requestId);
        } else if (
          msg.type === 'tools-response' &&
          msg.requestId &&
          pendingToolsRequests.has(msg.requestId)
        ) {
          const entry = pendingToolsRequests.get(msg.requestId);
          clearTimeout(entry.timer);
          if (entry.sender && !entry.sender.isDestroyed()) {
            entry.sender.send('tools-response', msg);
          }
          pendingToolsRequests.delete(msg.requestId);
        }
      } catch {
        // 消息解析失败时忽略
      }
    };
  }

  // 统计数据请求
  ipcMain.on('stats-request', (event, payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ensureGlobalStatsToolsHandler();
      if (!ws.listeners('message').includes(globalStatsToolsHandler)) {
        ws.on('message', globalStatsToolsHandler);
      }
      const requestId = nextRequestId();
      const timer = setTimeout(() => {
        pendingStatsRequests.delete(requestId);
      }, 30000);
      pendingStatsRequests.set(requestId, { sender: event.sender, timer });
      ws.send(JSON.stringify({ type: 'stats-request', payload, requestId }));
    } else {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('stats-response', { error: 'Agent 未连接' });
      }
    }
  });

  // 技能与工具面板数据请求
  ipcMain.on('tools-request', (event) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ensureGlobalStatsToolsHandler();
      if (!ws.listeners('message').includes(globalStatsToolsHandler)) {
        ws.on('message', globalStatsToolsHandler);
      }
      const requestId = nextRequestId();
      const timer = setTimeout(() => {
        pendingToolsRequests.delete(requestId);
      }, 30000);
      pendingToolsRequests.set(requestId, { sender: event.sender, timer });
      ws.send(JSON.stringify({ type: 'tools-request', requestId }));
    } else {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('tools-response', { error: 'Agent 未连接' });
      }
    }
  });
}

ensureUserMessageHandler();

/**
 * 发送消息给 Agent（供 main.js 调用）
 * @param {string} text
 */
function sendToAgent(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'user-message', text }));
    return true;
  }
  console.warn('[agent-bridge] sendToAgent 失败：WebSocket 未连接');
  return false;
}

/**
 * 发送原始消息给 Agent（用于非 user-message 类型）
 * @param {object} msg
 */
function sendToAgentRaw(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export { initAgentBridge, sendToAgent, setUserDataDir, sendToAgentRaw };
