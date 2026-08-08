import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import http from 'http';

let wss: WebSocketServer | null = null;
let healthServer: http.Server | null = null;
let messageHandler: ((msg: Record<string, unknown>, ws: WebSocket) => void) | null = null;

type AliveSocket = WebSocket & { __isAlive?: boolean };
let statsHandler:
  | ((
      payload: Record<string, unknown>,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>)
  | null = null;

let toolsHandler: (() => Record<string, unknown> | Promise<Record<string, unknown>>) | null = null;

let statusSnapshotHandler: (() => Record<string, unknown>) | null = null;

const SERVER_START_TIME = Date.now();

function getServerUptimeMs(): number {
  return Date.now() - SERVER_START_TIME;
}

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

/** 监听地址是否为回环（决定是否强制"只允许本地连接"）。 */
function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h.startsWith('127.');
}

/**
 * 是否允许非回环来源的连接。
 * 由启动时的监听地址推导：绑定 0.0.0.0（容器/无头部署，见 Dockerfile
 * COGITO_WS_HOST=0.0.0.0）时，来源必然是网桥 IP 而非 127.0.0.1；
 * 若仍强制回环校验，容器里的所有连接都会被 403，WS 服务等于没启动。
 * 放开地址校验后，访问控制完全由 ws token 承担（token 始终强制校验）。
 */
let allowRemoteConnections = false;

function startWsServer(port = 9527): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    try {
      // 启动时生成随机 token 并写入文件，供 agent-bridge 读取。
      // 容器部署下客户端读不到宿主机的 .ws-token 文件，故支持 COGITO_WS_TOKEN
      // 显式注入固定 token（否则远程部署每次重启 token 都变，无法接入）。
      const envToken = (process.env.COGITO_WS_TOKEN || '').trim();
      wsToken = envToken || crypto.randomUUID();
      writeTokenFile();

      // 默认仅绑定回环地址（桌面场景安全默认）。容器/无头部署可用
      // COGITO_WS_HOST=0.0.0.0 放开监听（端口映射由 docker-compose 控制）。
      const host = process.env.COGITO_WS_HOST || '127.0.0.1';
      allowRemoteConnections = !isLoopbackHost(host);
      if (allowRemoteConnections) {
        if (!envToken) {
          console.warn(
            `[WS] 已绑定非回环地址 ${host}，但未设置 COGITO_WS_TOKEN；` +
              `token 为本次启动随机生成，远程客户端需自行读取 ${getTokenFilePath()}`,
          );
        }
        console.warn(`[WS] 监听 ${host}:${port}，非本机连接需携带正确的 ws token 才能接入`);
      }

      wss = new WebSocketServer(
        {
          port,
          host,
          // 限制单条消息大小，避免恶意客户端发送超大 payload 撑爆内存
          maxPayload: 1024 * 1024, // 1MB
          verifyClient: (info, callback) => {
            // 两道校验，顺序固定：
            // 1. token 永远强制（agent-bridge 通过 x-ws-token header 或 ?token= 传递）。
            //    不对 Origin 头放行——任何本机进程都可伪造 Origin；
            //    浏览器渲染进程也不直连 WS（均经 main 进程的 agent-bridge 转发）。
            // 2. 来源地址校验仅在"绑定回环"时生效。绑定 0.0.0.0 属于运维显式
            //    选择的远程部署，此时来源必为网桥/外网 IP，再做回环校验会把
            //    容器内所有连接一律 403（与 Dockerfile 的 COGITO_WS_HOST=0.0.0.0 直接冲突）。
            const clientToken = readTokenFromRequest(info.req);
            if (!wsToken || clientToken !== wsToken) {
              console.warn('[WS] 拒绝缺少有效 token 的连接');
              callback(false, 403, '缺少有效的 ws token');
              return;
            }

            if (allowRemoteConnections) {
              callback(true);
              return;
            }

            const remoteAddress = info.req?.socket?.remoteAddress;
            // remoteAddress 取不到时（理论上不应发生）按本地放行：
            // 服务此时绑定在回环地址上，能连上来的请求必然来自本机，且 token 已校验通过。
            if (!remoteAddress || isLocalRemoteAddress(remoteAddress)) {
              callback(true);
              return;
            }

            console.log('[WS] 拒绝非本地连接:', { remoteAddress });
            callback(false, 403, '只允许本地连接');
          },
        },
        () => {
          console.log(`[WS] WebSocket 服务已启动: ws://localhost:${port}`);
          resolve(wss!);
        },
      );

      // Docker/容器部署时启用 /health HTTP 端点供 HEALTHCHECK 探测。
      // 默认关闭：桌面场景不需要额外监听端口，避免引入非预期攻击面。
      if (process.env.COGITO_WS_HEALTH === 'true') {
        const healthPort = Number(process.env.COGITO_WS_HEALTH_PORT || 9528);
        healthServer = http.createServer((req, res) => {
          if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        healthServer.listen(healthPort, '0.0.0.0', () => {
          console.log(`[WS] 健康检查服务已启动: http://0.0.0.0:${healthPort}/health`);
        });
        healthServer.on('error', (err) => {
          console.error('[WS] 健康检查服务错误:', err.message);
        });
      }

      wss.on('error', (err) => {
        // Promise 已 resolve 后 reject 是 no-op；此处始终记日志，避免运行期
        // error 事件被静默吞没（启动期错误仍会 reject 让调用方感知）。
        console.error('[WS] 服务错误:', err.message);
        reject(err);
      });

      wss.on('connection', (ws, req) => {
        console.log('[WS] 客户端已连接:', req.socket.remoteAddress);

        // hello-ok 握手：连接建立后推送状态快照（presence/health/uptime/rate limit），
        // 让客户端立即知道 Agent 的整体运行状态（对齐 OpenClaw 的 hello-ok 协议）。
        sendToClient(ws, {
          type: 'hello-ok',
          presence: statusSnapshotHandler ? statusSnapshotHandler() : { state: 'unknown' },
          uptime: getServerUptimeMs(),
          rateLimit: { maxMessagesPerMinute: 60, windowMs: 60000 },
          serverTime: new Date().toISOString(),
        });

        // 每连接简单限流：60 秒内最多 60 条消息，超出则提示并忽略，防止失控客户端打爆主循环
        let msgCount = 0;
        let windowStart = Date.now();

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
          if (typeof (ws as AliveSocket & { ping?: () => void }).ping === 'function') {
            ws.ping();
          }
        }, 30000);
        // 心跳定时器不应阻止进程退出（服务停止后残留的连接不应挂住进程）
        const looseInterval = heartbeatInterval as unknown as { unref?: () => void };
        if (typeof looseInterval.unref === 'function') {
          looseInterval.unref();
        }

        ws.on('message', (raw) => {
          try {
            // 限流检查：重置窗口 & 计数
            const now = Date.now();
            if (now - windowStart >= 60000) {
              windowStart = now;
              msgCount = 0;
            }
            msgCount++;
            if (msgCount > 60) {
              sendToClient(ws, { type: 'rate-limit', message: '消息过于频繁，请稍后再试' });
              return;
            }

            const msg = JSON.parse(raw.toString());
            if (msg.type === 'stats-request' && statsHandler) {
              handlePayloadRequest(ws, msg, 'stats-response', statsHandler(msg.payload));
            } else if (msg.type === 'tools-request' && toolsHandler) {
              handlePayloadRequest(ws, msg, 'tools-response', toolsHandler());
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

function onToolsRequest(
  handler: () => Record<string, unknown> | Promise<Record<string, unknown>>,
): void {
  toolsHandler = handler;
}

/** Agent 注册 hello-ok 状态快照提供者（presence 数据） */
function onStatusSnapshot(handler: () => Record<string, unknown>): void {
  statusSnapshotHandler = handler;
}

function sendToClient(ws: WebSocket, payload: Record<string, unknown>): void {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  } catch {
    // 忽略发送错误
  }
}

/**
 * 统一处理「请求/响应」类消息（stats-request、tools-request 等）：
 * 等待 handler 结果（可能为 Promise），带 requestId 回包，并吞掉 reject 与发送异常。
 */
function handlePayloadRequest(
  ws: WebSocket,
  msg: { type?: string; requestId?: unknown },
  responseType: string,
  result: Record<string, unknown> | Promise<Record<string, unknown>> | undefined,
): void {
  const reply = (data: Record<string, unknown>, failedLabel: string) => {
    try {
      ws.send(JSON.stringify({ type: responseType, requestId: msg.requestId, ...data }));
    } catch (e: unknown) {
      console.error(`[WS] ${failedLabel} 发送失败:`, (e as Error).message);
    }
  };
  if (result && typeof (result as Promise<unknown>).then === 'function') {
    (result as Promise<Record<string, unknown>>)
      .then((data) => reply(data, responseType))
      .catch((err: unknown) => {
        console.error(`[WS] ${responseType} 处理失败:`, (err as Error)?.message || String(err));
        reply({ error: '请求处理失败' }, responseType);
      });
  } else if (result) {
    // 前面基于 result.then 判定过非 Promise，此处窄化不失真，直接断言同步结果
    reply(result as Record<string, unknown>, responseType);
  }
}

function broadcast(type: string, data: Record<string, unknown>): void {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...data });
  wss.clients.forEach((client) => {
    // 单个客户端发送失败（如对端已死但 readyState 尚未更新）不应中断其余客户端，
    // 也不应把异常抛进调用方（agent 循环）导致消息处理中断。
    try {
      if (client.readyState === 1) {
        client.send(msg);
      }
    } catch {
      // 忽略单个客户端的发送错误
    }
  });
}

async function stopWsServer(): Promise<void> {
  if (healthServer) {
    // 强制关闭健康检查端口的 keep-alive 空闲连接，避免 close() 回调挂起
    try {
      if (typeof healthServer.closeAllConnections === 'function') {
        healthServer.closeAllConnections();
      } else if (typeof healthServer.closeIdleConnections === 'function') {
        healthServer.closeIdleConnections();
      }
    } catch {
      // 忽略
    }
    await new Promise<void>((resolve) => {
      healthServer!.close(() => resolve());
    });
    healthServer = null;
  }
  if (wss) {
    // 先关闭已有连接（1001=Going Away），仅 wss.close() 不会主动断开 clients
    wss.clients.forEach((c) => c.close(1001));
    await new Promise<void>((resolve) => wss!.close(() => resolve()));
    wss = null;
  }
}

export {
  startWsServer,
  broadcast,
  onMessage,
  onStatsRequest,
  onToolsRequest,
  onStatusSnapshot,
  stopWsServer,
  getWsToken,
};
