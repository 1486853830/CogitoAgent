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
// 是否应当重连。窗口全部关闭后置为 false，避免 ws.close() 触发 close 事件
// 又调度重连，导致连接空转泄漏。
let shouldReconnect = true;
const connectedWindows = new Set();
let USER_DATA_DIR = '';

function setUserDataDir(dir) {
  USER_DATA_DIR = dir;
}

/**
 * 连接 WebSocket 服务
 */
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  console.log('[AgentBridge] 正在连接 Agent...');
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[AgentBridge] 已连接到 Agent');
    shouldReconnect = true;
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
            const tempFile = metaPath + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(msg.meta, null, 2), 'utf-8');
            try {
              fs.renameSync(tempFile, metaPath);
            } catch {
              fs.copyFileSync(tempFile, metaPath);
              fs.unlinkSync(tempFile);
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
      console.log('[AgentBridge] 3秒后重连...');
      reconnectTimer = setTimeout(() => connect(), 3000);
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
    // 如果没有窗口了，关闭连接
    if (connectedWindows.size === 0 && ws) {
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

  // 请求历史（暂不支持，桌面端独立管理历史）
  ipcMain.on('request-history', (event) => {
    event.reply('agent-history', []);
  });

  // 统计数据请求
  ipcMain.on('stats-request', (event, payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const requestId = Date.now();
      const handler = (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          // 必须匹配 requestId：多窗口并发请求时，若不校验会让第一个到达的
          // stats-response 错误地回复给所有等待中的 handler，造成串扰。
          if (msg.type === 'stats-response' && msg.requestId === requestId) {
            event.reply('stats-response', msg);
            ws.removeListener('message', handler);
          }
        } catch {}
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ type: 'stats-request', payload, requestId }));

      setTimeout(() => {
        ws.removeListener('message', handler);
      }, 30000);
    } else {
      event.reply('stats-response', { error: 'Agent 未连接' });
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
  return false;
}

export { initAgentBridge, sendToAgent, setUserDataDir };
