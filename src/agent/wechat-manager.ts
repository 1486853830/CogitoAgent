import {
  loginWechat,
  logoutWechat,
  startWechatPolling,
  stopWechatPolling,
  getWechatStatus,
  sendWechatMessage,
  setWechatSessionId,
  addWechatMessage,
  getWechatMessages,
  wechatState,
} from './tools/wechat.ts';
import { handleUserInput, setReplyCallback } from './Agent.ts';
import {
  getOrCreateWechatSession,
  switchSession,
  getCurrentSession,
  setConversationHistory,
} from './session.ts';
import { laneQueue, AGENT_LANE_KEY } from './lane.ts';
import { channelManager } from './channels/index.ts';
import type { ChannelAdapter, ChannelStatus } from './channels/index.ts';
import { broadcast } from '../io/ws-server.ts';
import type { Message } from '../types/index.ts';

interface WechatMessage {
  from: string;
  text: string;
}

interface SessionData {
  messages: Array<{ role: string; content: string }>;
  lastActive: number;
}

const WECHAT_SESSIONS = new Map<string, SessionData>();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let lastChatSender: string | null = null;

/** 最近一位微信互动者（用于微信信道界面输入时，将回复发回微信手机） */
export function getLastChatSender(): string | null {
  return lastChatSender;
}

function syncWechatHistoryToSession(): void {
  const msgs = getWechatMessages();
  const history: Array<{ role: string; content: string }> = [];
  for (const msgRaw of msgs) {
    const msg = msgRaw as Record<string, unknown>;
    if (msg.direction === 'received') {
      history.push({
        role: 'user',
        content: `[微信消息 来自 ${msg.from}] ${msg.text}`,
      });
    } else if (msg.direction === 'sent') {
      history.push({
        role: 'assistant',
        content: msg.text as string,
      });
    }
  }
  setConversationHistory(history as Message[]);
}

function ensureWechatSession(): string {
  const sessionId = getOrCreateWechatSession();
  setWechatSessionId(sessionId);
  const current = getCurrentSession();
  if (!current || current.id !== sessionId) {
    switchSession(sessionId);
  }
  syncWechatHistoryToSession();
  return sessionId;
}

async function handleWechatMessage(message: WechatMessage): Promise<void> {
  const { from, text } = message;
  const timestamp = new Date().toISOString();
  lastChatSender = from;

  addWechatMessage({ direction: 'received', from, text, timestamp });

  broadcast('wechat-message', {
    direction: 'received',
    from,
    text,
    timestamp,
  });

  if (text.trim() === '/new') {
    WECHAT_SESSIONS.delete(from);
    return;
  }

  const current = getCurrentSession();
  const wechatSid = wechatState.wechatSessionId;
  if (wechatSid && (!current || current.id !== wechatSid)) {
    switchSession(wechatSid);
    syncWechatHistoryToSession();
    broadcast('wechat-state', {
      data: {
        connected: true,
        accountId: wechatState.accountId,
        polling: true,
        sessionId: wechatSid,
      },
    });
  }

  let sessionData = WECHAT_SESSIONS.get(from);
  if (!sessionData) {
    sessionData = { messages: [], lastActive: Date.now() };
    WECHAT_SESSIONS.set(from, sessionData);
  }
  sessionData.messages.push({ role: 'user', content: text });
  sessionData.lastActive = Date.now();

  setReplyCallback(from, async (replyText: string) => {
    const result = await sendWechatMessage(from, replyText);
    if (result.success) {
      const replyTimestamp = new Date().toISOString();
      addWechatMessage({ direction: 'sent', to: from, text: replyText, timestamp: replyTimestamp });
      broadcast('wechat-message', {
        direction: 'sent',
        from,
        text: replyText,
        timestamp: replyTimestamp,
      });
    }
  });

  const prompt = `[微信消息 来自 ${from}] ${text}`;
  // 通过 Lane 串行化进入 Agent，与桌面 WebSocket/CLI 共用同一处理管线，
  // 同一发送者的多条消息不会并发踩踏，多发送者之间互不阻塞。
  laneQueue.enqueue(AGENT_LANE_KEY, () => handleUserInput(prompt, from));
}

async function initWechatChannel(): Promise<void> {
  console.log('[微信通道] 初始化中...');
  channelManager.register(getWechatAdapter());
  channelManager.setConfirmationHandler(pushConfirmationToWechat);

  const status = await getWechatStatus();

  if (status.success && status.data!.loggedIn) {
    console.log(`[微信通道] 已登录账号: ${status.data!.accountId}`);

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
          accountId: status.data!.accountId,
          polling: true,
        },
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
        polling: false,
      },
    });
  }
}

async function manualLoginWechat(): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const result = await loginWechat();

    if (result.success) {
      const sessionId = ensureWechatSession();
      broadcast('wechat-state', {
        data: {
          connected: true,
          accountId: wechatState.accountId,
          polling: false,
          sessionId,
        },
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
                sessionId,
              },
            });
          }
        } catch (e) {
          console.error('[微信通道] 启动轮询异常:', (e as Error).message);
        }
      }, 1000);
    } else {
      broadcast('wechat-state', {
        data: {
          connected: false,
          accountId: null,
          polling: false,
        },
      });
    }

    return result;
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[微信通道] 登录异常:', msg);
    broadcast('wechat-state', {
      data: {
        connected: false,
        accountId: null,
        polling: false,
      },
    });
    return { success: false, error: msg };
  }
}

async function manualLogoutWechat(): Promise<{ success: boolean; data?: string; error?: string }> {
  await stopWechatPolling();
  const result = await logoutWechat();

  broadcast('wechat-state', {
    data: {
      connected: false,
      accountId: null,
      polling: false,
    },
  });

  return result;
}

function getWechatSessionCount(): number {
  return WECHAT_SESSIONS.size;
}

function cleanupInactiveSessions(maxAgeMs = 30 * 60 * 1000): void {
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

/**
 * 把危险操作确认请求推送到微信通道：发给最近活跃的发送者，对方可直接回复
 * y/n 完成跨通道审批（handleUserInput 的 AWAITING_CONFIRMATION 分支统一兜底）。
 */
function pushConfirmationToWechat(payload: {
  toolName: string;
  hint?: string;
  argsText?: string;
  timeoutMs?: number;
}): void {
  const target = lastChatSender;
  if (!target) return;
  const timeoutNote = payload.timeoutMs
    ? `（${Math.round(payload.timeoutMs / 60000)} 分钟内有效）`
    : '';
  void sendWechatMessage(
    target,
    `⚠️ 需要您确认的操作：${payload.toolName}\n${payload.hint || ''}\n参数：${payload.argsText || '(无)'}${timeoutNote}\n回复 y 确认，n 拒绝。`,
  );
}

function getWechatAdapter(): ChannelAdapter {
  return {
    id: 'wechat',
    name: '微信通道',
    connect: async () => {
      await initWechatChannel();
    },
    disconnect: async () => {
      await stopWechatPolling();
    },
    send: async (target: string, text: string) => {
      return sendWechatMessage(target, text);
    },
    getStatus: (): ChannelStatus => {
      return {
        connected: wechatState.loggedIn,
        details: { accountId: wechatState.accountId, polling: wechatState.polling },
      };
    },
  };
}

cleanupInterval = setInterval(
  () => {
    cleanupInactiveSessions();
  },
  5 * 60 * 1000,
);
cleanupInterval.unref();

export function stopWechatCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export {
  initWechatChannel,
  manualLoginWechat,
  manualLogoutWechat,
  getWechatStatus,
  getWechatSessionCount,
  getWechatAdapter,
  WECHAT_SESSIONS,
};
