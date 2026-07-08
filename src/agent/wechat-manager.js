import {
  loginWechat,
  logoutWechat,
  startWechatPolling,
  stopWechatPolling,
  getWechatStatus,
  sendWechatMessage,
  setWechatSessionId,
  wechatState
} from './tools/wechat.js';
import { handleUserInput, setReplyCallback } from './Agent.js';
import { getOrCreateWechatSession, switchSession, getCurrentSession } from './session.js';
import { broadcast } from '../io/ws-server.js';

const WECHAT_SESSIONS = new Map();

function ensureWechatSession() {
  const sessionId = getOrCreateWechatSession();
  setWechatSessionId(sessionId);
  const current = getCurrentSession();
  if (!current || current.id !== sessionId) {
    switchSession(sessionId);
  }
  return sessionId;
}

async function handleWechatMessage(message) {
  const { from, text } = message;

  broadcast('wechat-message', {
    direction: 'received',
    from,
    text,
    timestamp: new Date().toISOString()
  });

  if (text.trim() === '/new') {
    WECHAT_SESSIONS.delete(from);
    return;
  }

  const current = getCurrentSession();
  const wechatSid = wechatState.wechatSessionId;
  if (wechatSid && (!current || current.id !== wechatSid)) {
    switchSession(wechatSid);
    broadcast('wechat-state', {
      data: { connected: true, accountId: wechatState.accountId, polling: true, sessionId: wechatSid }
    });
  }

  let sessionData = WECHAT_SESSIONS.get(from);
  if (!sessionData) {
    sessionData = { messages: [], lastActive: Date.now() };
    WECHAT_SESSIONS.set(from, sessionData);
  }
  sessionData.messages.push({ role: 'user', content: text });
  sessionData.lastActive = Date.now();

  setReplyCallback(async (replyText) => {
    const result = await sendWechatMessage(from, replyText);
    if (result.success) {
      broadcast('wechat-message', {
        direction: 'sent',
        from,
        text: replyText,
        timestamp: new Date().toISOString()
      });
    }
  });

  const prompt = `[微信消息 来自 ${from}] ${text}`;
  handleUserInput(prompt);
}

async function initWechatChannel() {
  console.log('[微信通道] 初始化中...');

  const status = await getWechatStatus();

  if (status.success && status.data.loggedIn) {
    console.log(`[微信通道] 已登录账号: ${status.data.accountId}`);

    if (!wechatState.wechatSessionId) {
      const sid = getOrCreateWechatSession();
      setWechatSessionId(sid);
    }

    const result = await startWechatPolling(handleWechatMessage);
    if (result.success) {
      console.log('[微信通道] 消息轮询已启动');
      broadcast('wechat-state', {
        data: {
          connected: true,
          accountId: status.data.accountId,
          polling: true
        }
      });
    } else {
      console.error('[微信通道] 启动消息轮询失败:', result.error);
    }
  } else {
    console.log('[微信通道] 未登录，等待用户扫码登录');
    broadcast('wechat-state', {
      data: {
        connected: false,
        accountId: null,
        polling: false
      }
    });
  }
}

async function manualLoginWechat() {
  try {
    const result = await loginWechat();

    if (result.success) {
      const sessionId = ensureWechatSession();
      broadcast('wechat-state', {
        data: {
          connected: true,
          accountId: wechatState.accountId,
          polling: false,
          sessionId
        }
      });

      setTimeout(async () => {
        try {
          const pollResult = await startWechatPolling(handleWechatMessage);
          if (pollResult.success) {
            broadcast('wechat-state', {
              data: {
                connected: true,
                accountId: wechatState.accountId,
                polling: true,
                sessionId
              }
            });
          }
        } catch (e) {
          console.error('[微信通道] 启动轮询异常:', e.message);
        }
      }, 1000);
    } else {
      broadcast('wechat-state', {
        data: {
          connected: false,
          accountId: null,
          polling: false
        }
      });
    }

    return result;
  } catch (e) {
    console.error('[微信通道] 登录异常:', e.message);
    broadcast('wechat-state', {
      data: {
        connected: false,
        accountId: null,
        polling: false
      }
    });
    return { success: false, error: e.message };
  }
}

async function manualLogoutWechat() {
  await stopWechatPolling();
  const result = await logoutWechat();

  broadcast('wechat-state', {
    data: {
      connected: false,
      accountId: null,
      polling: false
    }
  });

  return result;
}

function getWechatSessionCount() {
  return WECHAT_SESSIONS.size;
}

function cleanupInactiveSessions(maxAgeMs = 30 * 60 * 1000) {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [from, data] of WECHAT_SESSIONS) {
    if (now - data.lastActive > maxAgeMs) {
      WECHAT_SESSIONS.delete(from);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[微信通道] 清理了 ${cleanedCount} 个过期会话`);
  }
}

setInterval(() => {
  cleanupInactiveSessions();
}, 5 * 60 * 1000);

export {
  initWechatChannel,
  manualLoginWechat,
  manualLogoutWechat,
  getWechatStatus,
  getWechatSessionCount,
  WECHAT_SESSIONS
};
