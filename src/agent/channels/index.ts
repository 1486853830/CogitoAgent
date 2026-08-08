import { EventEmitter } from 'events';

/**
 * 通道适配层 —— 把所有外部通道（微信、CLI、WebSocket、未来扩展的
 * Telegram/飞书/钉钉等）归一成统一的 ChannelAdapter 接口与 UnifiedMessage。
 * Agent 只面向这一个接入点，通道本身无状态，状态统一收敛到 Gateway。
 */

export interface UnifiedMedia {
  kind: 'image' | 'audio' | 'video' | 'file';
  mime?: string;
  localPath?: string;
  url?: string;
  title?: string;
  size?: number;
}

export interface ChannelMessage {
  channelId: string;
  senderId: string;
  text: string;
  media?: UnifiedMedia[];
  /** 回复目标（如微信发送方 ID），发送回复时回填到这条消息 */
  replyTo?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelSendResult {
  success: boolean;
  error?: string;
}

export interface ChannelStatus {
  connected: boolean;
  details?: Record<string, unknown>;
}

export interface ConfirmationPayload {
  toolName: string;
  hint?: string;
  argsText?: string;
  timeoutMs?: number;
}

export interface ChannelAdapter {
  readonly id: string;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(target: string, text: string): Promise<ChannelSendResult>;
  getStatus(): ChannelStatus;
}

/**
 * ChannelManager：注册/查询通道适配器、向 Agent 转发归一化消息、
 * 向通道推送跨通道审批请求。
 */
class ChannelManager {
  private adapters = new Map<string, ChannelAdapter>();
  private incomingEmitter = new EventEmitter();
  private confirmationHandler: ((payload: ConfirmationPayload) => void) | null = null;

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  unregister(id: string): void {
    this.adapters.delete(id);
  }

  get(id: string): ChannelAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  statusSnapshot(): Record<string, ChannelStatus> {
    const snapshot: Record<string, ChannelStatus> = {};
    for (const [id, adapter] of this.adapters.entries()) {
      snapshot[id] = adapter.getStatus();
    }
    return snapshot;
  }

  /** 由具体通道（如微信轮询）把收到的原始消息归一化后转交给 Agent */
  dispatch(msg: ChannelMessage): void {
    this.incomingEmitter.emit('message', msg);
  }

  /** Agent 注册统一的消息入口（内部由 Lane 串行化后调用 handleUserInput） */
  onIncoming(handler: (msg: ChannelMessage) => void): void {
    this.incomingEmitter.removeAllListeners('message');
    this.incomingEmitter.on('message', handler);
  }

  /** 跨通道审批：把危险操作确认请求推送到所有在线通道（如微信） */
  pushConfirmation(payload: ConfirmationPayload): void {
    if (this.confirmationHandler) {
      try {
        this.confirmationHandler(payload);
      } catch (e) {
        console.error('[Channels] 审批推送失败:', (e as Error).message);
      }
    }
  }

  setConfirmationHandler(handler: ((payload: ConfirmationPayload) => void) | null): void {
    this.confirmationHandler = handler;
  }
}

export const channelManager = new ChannelManager();
