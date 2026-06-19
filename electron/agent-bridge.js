/**
 * Agent 桥接模块
 * WebSocket 客户端，连接终端 Agent 的 WebSocket 服务
 * 将 Electron IPC 消息转发到 Agent，将 Agent 消息转发到渲染进程
 */

import { ipcMain } from 'electron';
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:9527';
let ws = null;
let reconnectTimer = null;

/**
 * 连接 WebSocket 服务
 */
function connect(mainWindow) {
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        // 状态变化走 agent-state 通道
        if (msg.type === 'agent-state') {
          mainWindow.webContents.send('agent-state', msg.state);
        } else {
          mainWindow.webContents.send('agent-reply', msg);
        }
      }
    } catch {
      // 忽略解析失败
    }
  });

  ws.on('close', () => {
    console.log('[AgentBridge] 连接断开，3秒后重连...');
    reconnectTimer = setTimeout(() => connect(mainWindow), 3000);
  });

  ws.on('error', (err) => {
    console.log('[AgentBridge] 连接失败:', err.message);
    reconnectTimer = setTimeout(() => connect(mainWindow), 3000);
  });
}

/**
 * 初始化 Agent 桥接
 * @param {BrowserWindow} mainWindow
 */
function initAgentBridge(mainWindow) {
  console.log('[AgentBridge] 已初始化');

  // 连接 Agent WebSocket
  connect(mainWindow);

  // 处理来自渲染进程的用户消息，转发到 Agent
  ipcMain.on('user-message', (_event, text) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'user-message', text }));
    }
  });

  // 请求历史（暂不支持，桌面端独立管理历史）
  ipcMain.on('request-history', (event) => {
    event.reply('agent-history', []);
  });

  // 窗口关闭时清理
  mainWindow.on('closed', () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
  });
}

export { initAgentBridge };