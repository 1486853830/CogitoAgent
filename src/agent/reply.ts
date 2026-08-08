/**
 * 回复投递子系统 - 管理按来源隔离的回复回调与回复投递。
 * 从 Agent.ts 抽出，职责单一：不依赖 Agent 的状态机。
 */

// 按来源（如微信发送方）隔离的回复回调，避免多消息互相覆盖：
// 之前 _replyCallback 是全局单例，A 来消息设了回调、B 来消息覆盖之，A 的回复就丢了。
const _replyCallbacks = new Map<string, (reply: string) => void>();
let _currentReplyKey: string | null = null;

const MAX_REPLY_CALLBACKS = 100;

export function setReplyCallback(key: string, cb: (reply: string) => void): void {
  if (_replyCallbacks.size >= MAX_REPLY_CALLBACKS) {
    // 超过上限时删除最早设置的条目，防止内存泄漏
    const firstKey = _replyCallbacks.keys().next().value;
    if (firstKey !== undefined) _replyCallbacks.delete(firstKey);
  }
  _replyCallbacks.set(key, cb);
}

/** 投递回复到当前回复目标（若有），投递后清除该目标的回调 */
export function deliverReply(reply: string): void {
  if (!_currentReplyKey) return;
  const cb = _replyCallbacks.get(_currentReplyKey);
  if (cb) {
    cb(reply);
    _replyCallbacks.delete(_currentReplyKey);
  }
}

export function setCurrentReplyKey(key: string | null): void {
  _currentReplyKey = key;
}

export function getCurrentReplyKey(): string | null {
  return _currentReplyKey;
}
