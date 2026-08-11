import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Webhook 外部触发器 —— 供第三方服务（邮件、GitHub Actions、智能家居等）
 * 通过 HTTP POST 把事件注入 Agent。与 scheduler 的 cron 主动触发互补，
 * 提供"被动接收外部事件"的能力，事件统一进入 Lane 消费。
 */

export interface WebhookTriggerPayload {
  text: string;
  sessionKey?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

interface WebhookOptions {
  port?: number;
  host?: string;
  token?: string;
  onTrigger: (payload: WebhookTriggerPayload) => void | Promise<void>;
}

let server: http.Server | null = null;
let generatedToken = '';

/** 自动生成的 webhook token 文件路径（与 ws-server 的 .ws-token 同目录）。 */
function getWebhookTokenPath(): string {
  const dataDir = process.env.COGITO_USER_DATA_DIR || process.cwd();
  return path.join(dataDir, '.webhook-token');
}

/**
 * 生成随机 webhook token 并写入文件（权限 600）。
 * 之前未配置 token 时 isAuthorized 会无条件放行，等于把 Agent 的完整工具能力
 * 暴露给任意能访问该端口的进程；自动生成可在保持开箱可用的同时消除这一敞口。
 */
function ensureWebhookToken(): string {
  if (generatedToken) return generatedToken;
  generatedToken = crypto.randomBytes(32).toString('hex');
  try {
    const tokenPath = getWebhookTokenPath();
    fs.writeFileSync(tokenPath, generatedToken, 'utf-8');
    try {
      fs.chmodSync(tokenPath, 0o600);
    } catch {
      // Windows 上 chmod 无效，忽略
    }
    console.log(`[Webhook] 已生成访问 token，见 ${tokenPath}`);
  } catch (e: unknown) {
    console.error('[Webhook] 写入 token 文件失败:', (e as Error).message);
  }
  return generatedToken;
}

/** 供外部（测试/集成方）读取当前生效的 webhook token。 */
export function getWebhookToken(): string {
  return generatedToken;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  const MAX_BODY_BYTES = 256 * 1024;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf-8');
      if (data.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(Object.assign(new Error('请求体过大'), { code: 'PAYLOAD_TOO_LARGE' }));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', () => reject(new Error('请求读取失败')));
  });
}

function sendJSON(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function isAuthorized(req: http.IncomingMessage, token: string | undefined): boolean {
  // 无 token 时必须拒绝，绝不能放行：webhook 的 text 会直接进入 handleUserInput，
  // 等价于把 Agent 的全套文件/shell 工具暴露给任意能访问该端口的进程。
  // 正常情况下 startWebhookServer 会自动生成 token，此分支只在生成失败时兜底。
  if (!token) return false;
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return timingSafeEqual(header.slice(7), token);
  }
  const xToken = req.headers['x-webhook-token'];
  if (typeof xToken === 'string') {
    return timingSafeEqual(xToken, token);
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function startWebhookServer(opts: WebhookOptions): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(server);
      return;
    }
    const port = opts.port ?? Number(process.env.COGITO_WEBHOOK_PORT || 9529);
    const host = opts.host || process.env.COGITO_WEBHOOK_HOST || '127.0.0.1';
    // 未显式配置 token 时自动生成一个并落盘（参照 ws-server 的 .ws-token 机制），
    // 而不是退化为"无鉴权放行"。调用方可从 .webhook-token 读取。
    const token = opts.token || process.env.COGITO_WEBHOOK_TOKEN || ensureWebhookToken();

    server = http.createServer(async (req, res) => {
      try {
        // S24: 健康检查端点放行鉴权，供容器/负载均衡的 HEALTHCHECK 无 token 探测，
        // 否则未携带 token 的探针会被 401 拒绝，导致实例被误判不健康。
        if (req.url === '/health') {
          sendJSON(res, 200, { status: 'ok' });
          return;
        }

        if (!isAuthorized(req, token)) {
          sendJSON(res, 401, { ok: false, error: '未授权' });
          return;
        }

        if (req.method === 'POST' && req.url === '/webhook/trigger') {
          let raw: string;
          try {
            raw = await readBody(req);
          } catch (e: unknown) {
            const err = e as Error & { code?: string };
            if (err.code === 'PAYLOAD_TOO_LARGE') {
              sendJSON(res, 413, { ok: false, error: '请求体过大（超过 256KB）' });
            } else {
              sendJSON(res, 400, { ok: false, error: '读取请求体失败' });
            }
            return;
          }
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw);
          } catch {
            sendJSON(res, 400, { ok: false, error: '无效的 JSON 请求体' });
            return;
          }
          const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
          if (!text) {
            sendJSON(res, 400, { ok: false, error: '缺少 text 字段' });
            return;
          }
          const payload: WebhookTriggerPayload = {
            text,
            sessionKey: typeof parsed.sessionKey === 'string' ? parsed.sessionKey : undefined,
            channel: typeof parsed.channel === 'string' ? parsed.channel : 'webhook',
            metadata:
              parsed.metadata && typeof parsed.metadata === 'object'
                ? (parsed.metadata as Record<string, unknown>)
                : undefined,
          };
          await opts.onTrigger(payload);
          sendJSON(res, 200, { ok: true, queued: true });
          return;
        }

        sendJSON(res, 404, { ok: false, error: '未找到路由' });
      } catch (e) {
        sendJSON(res, 500, { ok: false, error: (e as Error).message });
      }
    });

    server.on('error', (err) => {
      console.error('[Webhook] 服务错误:', err.message);
      reject(err);
    });

    server.listen(port, host, () => {
      console.log(
        `[Webhook] 触发器已启动: http://${host}:${port}/webhook/trigger${token ? '（带 token 鉴权）' : '（无鉴权）'}`,
      );
      resolve(server!);
    });
  });
}

async function stopWebhookServer(): Promise<void> {
  if (server) {
    // 先强制关闭所有保持连接（keep-alive 空闲连接会让 close() 回调
    // 挂起到超时，导致优雅停机迟迟不完成），再等待 close 完成。
    try {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      } else if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
    } catch {
      // 忽略关闭连接失败
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 5000);
      try {
        server!.close(() => {
          clearTimeout(timer);
          resolve();
        });
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
    server = null;
  }
  // S7: 退出时清理 token 文件，避免遗留明文凭据文件
  try {
    const tokenPath = getWebhookTokenPath();
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  } catch {
    // 忽略清理失败
  }
}

export { startWebhookServer, stopWebhookServer };
