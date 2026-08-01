import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import QRCode from 'qrcode';
import {
  loginWithQR,
  sendImage,
  bodyFromItemList,
  setContextToken,
  getContextToken,
} from '@pawastation/ilink-bot-sdk';
import { broadcast } from '../../io/ws-server.ts';

const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const STATE_DIR = path.resolve(DATA_DIR, 'data', 'wechat');
const STATE_FILE = path.join(STATE_DIR, 'wechat-state.json');
const MESSAGES_FILE = path.join(STATE_DIR, 'weichat.json');

interface WechatState {
  loggedIn: boolean;
  accountId: string | null;
  botToken: string | null;
  baseUrl: string | null;
  userId: string | null;
  polling: boolean;
  qrCodeUrl: string | null;
  sessionKey: string | null;
  wechatSessionId: string | null;
}

let wechatState: WechatState = {
  loggedIn: false,
  accountId: null,
  botToken: null,
  baseUrl: null,
  userId: null,
  polling: false,
  qrCodeUrl: null,
  sessionKey: null,
  wechatSessionId: null,
};

let messageHandler:
  ((msg: { from: string; text: string; contextToken: string; raw: unknown }) => void) | null = null;
let pollingActive = false;
let pollingGeneration = 0;

/**
 * Custom API POST — bypasses SDK's apiFetch which sets Content-Length
 * header that breaks Node.js 22's fetch (undici).
 */
function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

async function wechatApiPost(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const base = wechatState.baseUrl!.replace(/\/$/, '');
  const url = `${base}/${endpoint}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WECHAT-UIN': randomWechatUin(),
      AuthorizationType: 'ilink_bot_token',
      Authorization: `Bearer ${wechatState.botToken}`,
    },
    body: JSON.stringify({ ...body, base_info: { channel_version: 'ilink-bot-sdk' } }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${endpoint} ${resp.status}: ${text}`);
  }
  const data = (await resp.json()) as Record<string, unknown>;
  if (data.ret !== undefined && data.ret !== 0) {
    throw new Error(`${endpoint} API error: ret=${data.ret} errmsg=${data.errmsg || ''}`);
  }
  if (data.errcode !== undefined && data.errcode !== 0) {
    throw new Error(`${endpoint} API error: errcode=${data.errcode} errmsg=${data.errmsg || ''}`);
  }
  return data;
}

async function loadState(): Promise<void> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const saved = JSON.parse(data) as Partial<WechatState>;
      wechatState = { ...wechatState, ...saved };
    }
  } catch (e: unknown) {
    console.error('[微信] 加载状态失败:', (e as Error).message);
  }
}

async function saveState(): Promise<void> {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(wechatState, null, 2), 'utf-8');
  } catch (e: unknown) {
    console.error('[微信] 保存状态失败:', (e as Error).message);
  }
}

function loadWechatMessages(): { messages: unknown[] } {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e: unknown) {
    console.error('[微信] 加载消息失败:', (e as Error).message);
  }
  return { messages: [] };
}

function saveWechatMessages(messages: unknown[]): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages }, null, 2), 'utf-8');
  } catch (e: unknown) {
    console.error('[微信] 保存消息失败:', (e as Error).message);
  }
}

function addWechatMessage(msg: Record<string, unknown>): Record<string, unknown> {
  const data = loadWechatMessages();
  const newMsg = {
    id: Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
    timestamp: new Date().toISOString(),
    ...msg,
  };
  data.messages.push(newMsg);
  saveWechatMessages(data.messages);
  return newMsg;
}

function getWechatMessages(limit: number = 100): unknown[] {
  const data = loadWechatMessages();
  if (limit && data.messages.length > limit) {
    return data.messages.slice(-limit);
  }
  return data.messages;
}

async function loginWechat(): Promise<{ success: boolean; data?: string; error?: string }> {
  await loadState();

  if (wechatState.loggedIn) {
    return {
      success: true,
      data: `已登录账号: ${wechatState.accountId}`,
    };
  }

  try {
    const result = await loginWithQR({
      apiBaseUrl: 'https://ilinkai.weixin.qq.com',
      callbacks: {
        onQRCode: async (content: unknown) => {
          wechatState.qrCodeUrl = content as string;
          await saveState();
          try {
            const dataUrl = await QRCode.toDataURL(content as string, { width: 280, margin: 2 });
            broadcast('wechat-qrcode', { data: { qrCode: dataUrl } });
          } catch (e: unknown) {
            console.error('[微信] 生成二维码失败:', (e as Error).message);
          }
        },
        onStatus: (status: unknown) => {
          console.log('[微信] 登录状态:', status);
          broadcast('wechat-login-status', { data: { status } });
        },
      },
    });

    if (!result.connected) {
      wechatState.loggedIn = false;
      await saveState();
      console.error('[微信] 登录失败:', result.message);
      return { success: false, error: result.message || '微信登录失败' };
    }

    console.log('[微信] 登录成功:', result.accountId);
    wechatState = {
      loggedIn: true,
      accountId: result.accountId || null,
      botToken: result.botToken || null,
      baseUrl: result.baseUrl || null,
      userId: result.userId || null,
      polling: false,
      qrCodeUrl: null,
      sessionKey: null,
      wechatSessionId: wechatState.wechatSessionId,
    };

    await saveState();

    return {
      success: true,
      data: `微信登录成功！账号: ${result.accountId}`,
    };
  } catch (error: unknown) {
    wechatState.loggedIn = false;
    await saveState();
    return {
      success: false,
      error: `微信登录失败: ${(error as Error).message}`,
    };
  }
}

async function logoutWechat(): Promise<{ success: boolean; data?: string; error?: string }> {
  pollingActive = false;

  wechatState = {
    loggedIn: false,
    accountId: null,
    botToken: null,
    baseUrl: null,
    userId: null,
    polling: false,
    qrCodeUrl: null,
    sessionKey: null,
    wechatSessionId: wechatState.wechatSessionId,
  };

  await saveState();

  return {
    success: true,
    data: '微信已退出登录',
  };
}

async function startWechatPolling(
  handler: (msg: { from: string; text: string; contextToken: string; raw: unknown }) => void,
): Promise<{ success: boolean; data?: string; error?: string }> {
  await loadState();

  if (!wechatState.loggedIn) {
    return {
      success: false,
      error: '请先登录微信',
    };
  }

  if (wechatState.polling && pollingActive) {
    return {
      success: true,
      data: '消息轮询已在运行中',
    };
  }

  messageHandler = handler;
  pollingActive = true;
  pollingGeneration++;
  const currentGeneration = pollingGeneration;
  let getUpdatesBuf = '';

  const pollLoop = async () => {
    if (!pollingActive || currentGeneration !== pollingGeneration) return;

    try {
      const data = await wechatApiPost('ilink/bot/getupdates', {
        get_updates_buf: getUpdatesBuf,
      });

      if (data.get_updates_buf) {
        getUpdatesBuf = data.get_updates_buf as string;
      }

      const msgs = (data.msgs || []) as Record<string, unknown>[];

      for (const msg of msgs) {
        const from = (msg.from_user_id as string) || '';
        if (msg.context_token) {
          setContextToken(wechatState.accountId as string, from, msg.context_token as string);
        }
        const text = bodyFromItemList(msg.item_list as any);
        if (text && messageHandler) {
          await messageHandler({
            from,
            text: text as string,
            contextToken: getContextToken(wechatState.accountId as string, from) as string,
            raw: msg,
          });
        }
      }
    } catch (e: unknown) {
      console.error('[微信轮询] 错误:', (e as Error).message);
    }

    if (pollingActive) {
      setTimeout(pollLoop, 1000);
    }
  };

  wechatState.polling = true;
  await saveState();
  pollLoop();

  return { success: true, data: '消息轮询已启动' };
}

async function stopWechatPolling(): Promise<{ success: boolean; data?: string; error?: string }> {
  pollingActive = false;
  wechatState.polling = false;
  await saveState();

  return {
    success: true,
    data: '消息轮询已停止',
  };
}

async function sendWechatMessage(
  to: string,
  text: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  await loadState();

  if (!wechatState.loggedIn) {
    return {
      success: false,
      error: '请先登录微信',
    };
  }

  try {
    const ctxToken = getContextToken(wechatState.accountId as string, to);
    const clientId = `ilink-bot-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await wechatApiPost('ilink/bot/sendmessage', {
      msg: {
        from_user_id: '',
        to_user_id: to,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        item_list: [{ type: 1, text_item: { text } }],
        context_token: ctxToken,
      },
    });

    return {
      success: true,
      data: `消息发送成功`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `发送消息失败: ${(error as Error).message}`,
    };
  }
}

async function sendWechatImage(
  to: string,
  imagePath: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  await loadState();

  if (!wechatState.loggedIn) {
    return {
      success: false,
      error: '请先登录微信',
    };
  }

  try {
    const fullPath = path.isAbsolute(imagePath)
      ? imagePath
      : path.resolve(process.cwd(), imagePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `图片文件不存在: ${fullPath}`,
      };
    }

    await sendImage({
      to,
      filePath: fullPath,
      opts: {
        baseUrl: wechatState.baseUrl as string,
        token: wechatState.botToken as string,
        contextToken: getContextToken(wechatState.accountId as string, to),
      },
    } as any);

    return {
      success: true,
      data: `图片发送成功: ${imagePath}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `发送图片失败: ${(error as Error).message}`,
    };
  }
}

async function getWechatStatus(): Promise<{
  success: boolean;
  data?: {
    loggedIn: boolean;
    accountId: string | null;
    userId: string | null;
    polling: boolean;
    qrCodeUrl: string | null;
  };
  error?: string;
}> {
  await loadState();

  return {
    success: true,
    data: {
      loggedIn: wechatState.loggedIn,
      accountId: wechatState.accountId,
      userId: wechatState.userId,
      polling: wechatState.polling,
      qrCodeUrl: wechatState.qrCodeUrl,
    },
  };
}

async function generateWechatQRCode(): Promise<{
  success: boolean;
  data?: { qrCodeUrl: string; sessionKey: string };
  error?: string;
}> {
  try {
    const result = await loginWithQR({
      apiBaseUrl: 'https://ilinkai.weixin.qq.com',
      callbacks: {
        onQRCode: (url: unknown) => {
          wechatState.qrCodeUrl = url as string;
        },
        onStatus: () => {},
      },
    });

    wechatState.sessionKey = (result as unknown as Record<string, string>).sessionKey;

    return {
      success: true,
      data: {
        qrCodeUrl: (result as unknown as Record<string, string>).qrCodeUrl,
        sessionKey: (result as unknown as Record<string, string>).sessionKey,
      },
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: `生成二维码失败: ${(error as Error).message}`,
    };
  }
}

function setWechatSessionId(id: string): void {
  wechatState.wechatSessionId = id;
  saveState();
}

export {
  loginWechat,
  logoutWechat,
  startWechatPolling,
  stopWechatPolling,
  sendWechatMessage,
  sendWechatImage,
  getWechatStatus,
  generateWechatQRCode,
  setWechatSessionId,
  addWechatMessage,
  getWechatMessages,
  wechatState,
};
