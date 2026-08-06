import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let wss: WebSocketServer | null = null;
let messageHandler: ((msg: Record<string, unknown>, ws: WebSocket) => void) | null = null;

type AliveSocket = WebSocket & { __isAlive?: boolean };
let statsHandler:
  | ((
      payload: Record<string, unknown>,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>)
  | null = null;

// 每次启动生成随机 token，非浏览器客户端（如 agent-bridge）连接时必须携带。
// 浏览器客户端仍靠 Origin 白名单校验（前端无法安全存储 token）。
// 此前仅校验回环地址，本机任意进程都能连 9527 端口伪装 Agent 推送恶意 session-meta-update。
let wsToken: string = '';

function getWsToken(): string {
  return wsToken;
}

function getTokenFilePath(): string {
  const dataDir = process.env.COGITO_USER_DATA_DIR || process.cwd();
  return path.join(dataDir, '.ws-token');
}

function writeTokenFile(): void {
  try {
    const tokenPath = getTokenFilePath();
    fs.writeFileSync(tokenPath, wsToken, 'utf-8');
    // 限制文件权限仅当前用户可读
    try {
      fs.chmodSync(tokenPath, 0o600);
    } catch {
      // Windows 上 chmod 无效，忽略
    }
  } catch (e: unknown) {
    console.error('[WS] 写入 token 文件失败:', (e as Error).message);
  }
}

function readTokenFromRequest(req: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
}): string | null {
  // 优先从 header 读取，其次从 URL query 读取
  const headerToken = req?.headers?.['x-ws-token'];
  if (typeof headerToken === 'string' && headerToken.length > 0) return headerToken;
  const url = req?.url || '';
  try {
    const idx = url.indexOf('?');
    if (idx >= 0) {
      const params = new URLSearchParams(url.slice(idx + 1));
      const t = params.get('token');
      if (t) return t;
    }
  } catch {
    // URL 解析失败，忽略
  }
  return null;
}

function isLocalRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  // 本机回环地址：IPv4 127.0.0.1 / IPv6 ::1
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress.startsWith('127.') ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}

function isValidOrigin(origin: string | undefined): boolean {
  const localhostPatterns = [
    /^http:\/\/localhost(:\d+)?$/,
    /^https:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https:\/\/127\.0\.0\.1(:\d+)?$/,
  ];
  return !!origin && localhostPatterns.some((pattern) => pattern.test(origin));
}

function startWsServer(port = 9527): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    try {
      // 启动时生成随机 token 并写入文件，供 agent-bridge 读取
      wsToken = crypto.randomUUID();
      writeTokenFile();

      wss = new WebSocketServer(
        {
          port,
          host: '127.0.0.1',
          verifyClient: (info, callback) => {
            // 双重校验：
            // 1. Origin 头（浏览器客户端）必须命中本地白名单；
            // 2. 非浏览器客户端（如 Electron agent-bridge 的 Node ws 客户端，
            //    它不发送 Origin 头）必须来自本机回环地址且携带正确 token。
            //
            // 注：ws 库的 info 对象只有 origin / secure / req 三个属性，
            // 没有 info.socket。remoteAddress 必须从 info.req.socket 取。
            const remoteAddress = info.req?.socket?.remoteAddress;
            const originOk = isValidOrigin(info.origin);
            const addrOk = isLocalRemoteAddress(remoteAddress);

            // 浏览器客户端：靠 Origin 白名单放行（前端无法安全存储 token）
            if (originOk) {
              callback(true);
              return;
            }

            // 非浏览器客户端：必须来自回环地址且携带正确 token
            if (addrOk) {
              const clientToken = readTokenFromRequest(info.req);
              if (!wsToken || clientToken === wsToken) {
                callback(true);
                return;
              }
              console.warn('[WS] 拒绝无 token 的本地连接');
              callback(false, 403, '缺少有效的 ws token');
              return;
            }

            // 兜底：服务绑定在 127.0.0.1，能连上来的请求必然来自本机。
            // 当 remoteAddress 取不到时（理论上不应发生），放行以避免误杀。
            if (!remoteAddress && !info.origin) {
              console.warn('[WS] remoteAddress 未知，但 Origin 也为空，按本机连接放行');
              callback(true);
              return;
            }

            console.log('[WS] 拒绝非本地连接:', { origin: info.origin, remoteAddress });
            callback(false, 403, '只允许本地连接');
          },
        },
        () => {
          console.log(`[WS] WebSocket 服务已启动: ws://localhost:${port}`);
          resolve(wss!);
        },
      );

      wss.on('error', (err) => {
        // Promise 已 resolve 后 reject 是 no-op；此处始终记日志，避免运行期
        // error 事件被静默吞没（启动期错误仍会 reject 让调用方感知）。
        console.error('[WS] 服务错误:', err.message);
        reject(err);
      });

      wss.on('connection', (ws, req) => {
        console.log('[WS] 客户端已连接:', req.socket.remoteAddress);

        // 必须为每个连接注册 error 监听器：Node EventEmitter 规则下，
        // 若 error 事件无监听器会抛出并导致进程退出。ws 库在底层 socket
        // 异常时会向 ws 对象 emit error，缺监听器即崩溃整个 Agent。
        ws.on('error', (err) => {
          console.error('[WS] 连接错误:', err.message);
        });

        // 心跳检测：每 30 秒 ping 一次，若 10 秒内未收到 pong 则断开
        const alive = ws as AliveSocket;
        alive.__isAlive = true;
        ws.on('pong', () => {
          alive.__isAlive = true;
        });
        const heartbeatInterval = setInterval(() => {
          if (alive.__isAlive === false) {
            console.log('[WS] 心跳超时，断开连接');
            clearInterval(heartbeatInterval);
            if (typeof alive.terminate === 'function') {
              alive.terminate();
            }
            return;
          }
          alive.__isAlive = false;
          ws.ping();
        }, 30000);
        // 心跳定时器不应阻止进程退出（服务停止后残留的连接不应挂住进程）
        const looseInterval = heartbeatInterval as unknown as { unref?: () => void };
        if (typeof looseInterval.unref === 'function') {
          looseInterval.unref();
        }

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'stats-request' && statsHandler) {
              const result = statsHandler(msg.payload);
              if (result && typeof result.then === 'function') {
                // Promise 结果必须带 .catch，否则 rejection 成为 unhandledRejection；
                // ws.send 失败也需吞错避免抛出。
                result
                  .then((data: Record<string, unknown>) => {
                    try {
                      ws.send(
                        JSON.stringify({
                          type: 'stats-response',
                          requestId: msg.requestId,
                          ...data,
                        }),
                      );
                    } catch (e: unknown) {
                      console.error('[WS] stats-response 发送失败:', (e as Error).message);
                    }
                  })
                  .catch((err: unknown) => {
                    console.error('[WS] stats 处理失败:', (err as Error)?.message || String(err));
                    try {
                      ws.send(
                        JSON.stringify({
                          type: 'stats-response',
                          requestId: msg.requestId,
                          error: 'stats 处理失败',
                        }),
                      );
                    } catch {
                      /* 忽略 */
                    }
                  });
              } else if (result) {
                try {
                  ws.send(
                    JSON.stringify({ type: 'stats-response', requestId: msg.requestId, ...result }),
                  );
                } catch (e: unknown) {
                  console.error('[WS] stats-response 发送失败:', (e as Error).message);
                }
              }
            } else if (messageHandler) {
              // messageHandler 可能是 async，其返回的 Promise rejection 不会被
              // 上面的 try-catch 捕获，需显式接住，否则成为 unhandledRejection。
              // 其类型签名声明返回 void，但运行时可能返回 Promise，故此处用 any 断言以支持 then/catch。
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const r = messageHandler(msg, ws) as any;
              if (r && typeof r.then === 'function') {
                r.catch((e: unknown) =>
                  console.error('[WS] 消息处理错误:', (e as Error)?.message || e),
                );
              }
            }
          } catch (e: unknown) {
            console.error('[WS] 消息解析失败:', (e as Error).message);
          }
        });

        ws.on('close', () => {
          console.log('[WS] 客户端已断开');
          clearInterval(heartbeatInterval);
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

function onMessage(handler: (msg: Record<string, unknown>, ws: WebSocket) => void): void {
  messageHandler = handler;
}

function onStatsRequest(
  handler: (
    payload: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>,
): void {
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

async function stopWsServer(): Promise<void> {
  if (wss) {
    // 先关闭已有连接（1001=Going Away），仅 wss.close() 不会主动断开 clients
    wss.clients.forEach((c) => c.close(1001));
    await new Promise<void>((resolve) => wss!.close(() => resolve()));
    wss = null;
  }
}

export { startWsServer, broadcast, onMessage, onStatsRequest, stopWsServer, getWsToken };
