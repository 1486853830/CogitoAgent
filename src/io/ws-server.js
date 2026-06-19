/**
 * WebSocket 服务模块
 * 让 Electron 桌面端可以通过 WebSocket 连接终端 Agent
 */

import { WebSocketServer } from 'ws';

let wss = null;
let messageHandler = null;

/**
 * 启动 WebSocket 服务
 */
function startWsServer(port = 9527) {
  return new Promise((resolve, reject) => {
    try {
      wss = new WebSocketServer({ port }, () => {
        console.log(`[WS] WebSocket 服务已启动: ws://localhost:${port}`);
        resolve(wss);
      });

      wss.on('error', (err) => {
        reject(err);
      });

      wss.on('connection', (ws) => {
        console.log('[WS] 客户端已连接');

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (messageHandler) {
              messageHandler(msg, ws);
            }
          } catch {
            // 忽略解析失败的消息
          }
        });

        ws.on('close', () => {
          console.log('[WS] 客户端已断开');
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 设置消息处理器
 * @param {function} handler - 处理来自客户端的消息
 */
function onMessage(handler) {
  messageHandler = handler;
}

/**
 * 广播消息给所有已连接的客户端
 */
function broadcast(type, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...data });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

/**
 * 停止 WebSocket 服务
 */
function stopWsServer() {
  if (wss) {
    wss.close();
    wss = null;
  }
}

export { startWsServer, broadcast, onMessage, stopWsServer };