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
const connectedWindows = new Set();
let USER_DATA_DIR = '';

function setUserDataDir(dir) {
  USER_DATA_DIR = dir;
}

/**
 * 连接 WebSocket 服务
 */
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log('[AgentBridge] 正在连接 Agent...');
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[AgentBridge] 已连接到 Agent');
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
            if (fs.existsSync(metaPath)) {
              fs.unlinkSync(metaPath);
            }
            fs.renameSync(tempFile, metaPath);
            console.log('[AgentBridge] 会话元数据已更新');
            connectedWindows.forEach(win => {
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
        connectedWindows.forEach(win => {
          if (!win.isDestroyed()) {
            win.webContents.send('persona-switched', { persona: msg.persona });
          }
        });
        return;
      }
      
      connectedWindows.forEach(win => {
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
              timestamp: msg.timestamp
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
    console.log('[AgentBridge] 连接断开，3秒后重连...');
    reconnectTimer = setTimeout(() => connect(), 3000);
  });

  ws.on('error', (err) => {
    console.log('[AgentBridge] 连接失败:', err.message);
    reconnectTimer = setTimeout(() => connect(), 3000);
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
          if (msg.type === 'stats-response') {
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