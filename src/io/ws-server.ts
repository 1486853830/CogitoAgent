import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
let messageHandler: ((msg: any, ws: WebSocket) => void) | null = null;
let statsHandler: ((payload: any) => any) | null = null;

function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const localhostPatterns = [
    /^http:\/\/localhost(:\d+)?$/,
    /^https:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https:\/\/127\.0\.0\.1(:\d+)?$/,
    /^file:\/\//
  ];
  return localhostPatterns.some(pattern => pattern.test(origin));
}

function startWsServer(port = 9527): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    try {
      wss = new WebSocketServer({ 
        port,
        host: '127.0.0.1',
        verifyClient: (info, callback) => {
          if (!isValidOrigin(info.origin)) {
            console.log('[WS] 拒绝非本地连接:', info.origin);
            callback(false, 403, '只允许本地连接');
            return;
          }
          callback(true);
        }
      }, () => {
        console.log(`[WS] WebSocket 服务已启动: ws://localhost:${port}`);
        resolve(wss!);
      });

      wss.on('error', (err) => {
        reject(err);
      });

      wss.on('connection', (ws, req) => {
        console.log('[WS] 客户端已连接:', req.socket.remoteAddress);

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'stats-request' && statsHandler) {
              const result = statsHandler(msg.payload);
              if (result && typeof result.then === 'function') {
                result.then((data: any) => {
                  ws.send(JSON.stringify({ type: 'stats-response', ...data }));
                });
              } else if (result) {
                ws.send(JSON.stringify({ type: 'stats-response', ...result }));
              }
            } else if (messageHandler) {
              messageHandler(msg, ws);
            }
          } catch {
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

function onMessage(handler: (msg: any, ws: WebSocket) => void): void {
  messageHandler = handler;
}

function onStatsRequest(handler: (payload: any) => any): void {
  statsHandler = handler;
}

function broadcast(type: string, data: Record<string, unknown>): void {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...data });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

function stopWsServer(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
}

export { startWsServer, broadcast, onMessage, onStatsRequest, stopWsServer };