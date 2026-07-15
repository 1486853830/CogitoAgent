import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { loginWithQR, sendImage, bodyFromItemList, setContextToken, getContextToken } from '@pawastation/ilink-bot-sdk';
import { broadcast } from '../../io/ws-server.ts';

const STATE_DIR = path.resolve(process.cwd(), 'data', 'wechat');
const STATE_FILE = path.join(STATE_DIR, 'wechat-state.json');
const MESSAGES_FILE = path.join(STATE_DIR, 'weichat.json');

let wechatState: any = {
  loggedIn: false,
  accountId: null,
  botToken: null,
  baseUrl: null,
  userId: null,
  polling: false,
  qrCodeUrl: null,
  sessionKey: null,
  wechatSessionId: null
};

let messageHandler: any = null;
let pollingActive = false;

/**
 * Custom API POST — bypasses SDK's apiFetch which sets Content-Length
 * header that breaks Node.js 22's fetch (undici).
 */
function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

async function wechatApiPost(endpoint: string, body: any): Promise<any> {
  const base = wechatState.baseUrl.replace(/\/$/, '');
  const url = `${base}/${endpoint}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WECHAT-UIN': randomWechatUin(),
      AuthorizationType: 'ilink_bot_token',
      Authorization: `Bearer ${wechatState.botToken}`,
    },
    body: JSON.stringify({ ...body, base_info: { channel_version: 'ilink-bot-sdk' } })
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${endpoint} ${resp.status}: ${text}`);
  }
  const data: any = await resp.json();
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
      const saved = JSON.parse(data);
      wechatState = { ...wechatState, ...saved };
    }
  } catch (e: any) {
    console.error('[微信] 加载状态失败:', e.message);
  }
}

async function saveState(): Promise<void> {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(wechatState, null, 2), 'utf-8');
  } catch (e: any) {
    console.error('[微信] 保存状态失败:', e.message);
  }
}

function loadWechatMessages(): any {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e: any) {
    console.error('[微信] 加载消息失败:', e.message);
  }
  return { messages: [] };
}

function saveWechatMessages(messages: any): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages }, null, 2), 'utf-8');
  } catch (e: any) {
    console.error('[微信] 保存消息失败:', e.message);
  }
}

function addWechatMessage(msg: any): any {
  const data = loadWechatMessages();
  const newMsg = {
    id: Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
    timestamp: new Date().toISOString(),
    ...msg
  };
  data.messages.push(newMsg);
  saveWechatMessages(data.messages);
  return newMsg;
}

function getWechatMessages(limit: number = 100): any[] {
  const data = loadWechatMessages();
  if (limit && data.messages.length > limit) {
    return data.messages.slice(-limit);
  }
  return data.messages;
}

async function loginWechat(): Promise<any> {
  await loadState();

  if (wechatState.loggedIn) {
    return {
      success: true,
      data: `已登录账号: ${wechatState.accountId}`
    };
  }

  try {
    const result = await loginWithQR({
      apiBaseUrl: 'https://ilinkai.weixin.qq.com',
      callbacks: {
        onQRCode: async (content: any) => {
          wechatState.qrCodeUrl = content;
          await saveState();
          try {
            const dataUrl = await QRCode.toDataURL(content, { width: 280, margin: 2 });
            broadcast('wechat-qrcode', { data: { qrCode: dataUrl } });
          } catch (e: any) {
            console.error('[微信] 生成二维码失败:', e.message);
          }
        },
        onStatus: (status: any) => {
          console.log('[微信] 登录状态:', status);
          broadcast('wechat-login-status', { data: { status } });
        }
      }
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
      accountId: result.accountId,
      botToken: result.botToken,
      baseUrl: result.baseUrl,
      userId: result.userId,
      polling: false,
      qrCodeUrl: null,
      sessionKey: null,
      wechatSessionId: wechatState.wechatSessionId
    };

    await saveState();

    return {
      success: true,
      data: `微信登录成功！账号: ${result.accountId}`
    };
  } catch (error: any) {
    wechatState.loggedIn = false;
    await saveState();
    return {
      success: false,
      error: `微信登录失败: ${error.message}`
    };
  }
}

async function logoutWechat(): Promise<any> {
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
    wechatSessionId: wechatState.wechatSessionId
  };

  await saveState();

  return {
    success: true,
    data: '微信已退出登录'
  };
}

async function startWechatPolling(handler: any): Promise<any> {
  await loadState();

  if (!wechatState.loggedIn) {
    return {
      success: false,
      error: '请先登录微信'
    };
  }

  if (wechatState.polling && pollingActive) {
    return {
      success: true,
      data: '消息轮询已在运行中'
    };
  }

  messageHandler = handler;
  pollingActive = true;
  let getUpdatesBuf = '';

  const pollLoop = async () => {
    if (!pollingActive) return;

    try {
      const data = await wechatApiPost('ilink/bot/getupdates', {
        get_updates_buf: getUpdatesBuf,
      });

      if (data.get_updates_buf) {
        getUpdatesBuf = data.get_updates_buf;
      }

      const msgs = data.msgs || [];

      for (const msg of msgs) {
        const from = msg.from_user_id || '';
        if (msg.context_token) {
          setContextToken(wechatState.accountId, from, msg.context_token);
        }
        const text = bodyFromItemList(msg.item_list);
        if (text && messageHandler) {
          await messageHandler({
            from,
            text,
            contextToken: getContextToken(wechatState.accountId, from),
            raw: msg
          });
        }
      }
    } catch (e: any) {
      console.error('[微信轮询] 错误:', e.message);
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

async function stopWechatPolling(): Promise<any> {
  pollingActive = false;
  wechatState.polling = false;
  await saveState();

  return {
    success: true,
    data: '消息轮询已停止'
  };
}

async function sendWechatMessage(to: string, text: string): Promise<any> {
  await loadState();

  if (!wechatState.loggedIn) {
    return {
      success: false,
      error: '请先登录微信'
    };
  }

  try {
    const ctxToken = getContextToken(wechatState.accountId, to);
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
      data: `消息发送成功`
    };
  } catch (error: any) {
    return {
      success: false,
      error: `发送消息失败: ${error.message}`
    };
  }
}

async function sendWechatImage(to: string, imagePath: string): Promise<any> {
  await loadState();

  if (!wechatState.loggedIn) {
    return {
      success: false,
      error: '请先登录微信'
    };
  }

  try {
    const fullPath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `图片文件不存在: ${fullPath}`
      };
    }

    await sendImage({
      to,
      filePath: fullPath,
      opts: {
        baseUrl: wechatState.baseUrl,
        token: wechatState.botToken,
        contextToken: getContextToken(wechatState.accountId, to)
      }
    } as any);

    return {
      success: true,
      data: `图片发送成功: ${imagePath}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: `发送图片失败: ${error.message}`
    };
  }
}

async function getWechatStatus(): Promise<any> {
  await loadState();

  return {
    success: true,
    data: {
      loggedIn: wechatState.loggedIn,
      accountId: wechatState.accountId,
      userId: wechatState.userId,
      polling: wechatState.polling,
      qrCodeUrl: wechatState.qrCodeUrl
    }
  };
}

async function generateWechatQRCode(): Promise<any> {
  try {
    const result = await loginWithQR({
      apiBaseUrl: 'https://ilinkai.weixin.qq.com',
      callbacks: {
        onQRCode: (url: any) => {
          wechatState.qrCodeUrl = url;
        },
        onStatus: () => {}
      }
    });

    wechatState.sessionKey = (result as any).sessionKey;

    return {
      success: true,
      data: {
        qrCodeUrl: (result as any).qrCodeUrl,
        sessionKey: (result as any).sessionKey
      }
    };
  } catch (error: any) {
    return {
      success: false,
      error: `生成二维码失败: ${error.message}`
    };
  }
}

function setWechatSessionId(id: any): void {
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
  wechatState
};
