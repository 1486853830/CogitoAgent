/**
 * 回复投递子系统 - 管理按来源隔离的回复回调与回复文本清洗/展示。
 * 从 Agent.ts 抽出，职责单一：不依赖 Agent 的状态机，只依赖终端输出。
 */

import { printContent, printToolBlock } from '../io/terminal.ts';

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

export function extractCleanReply(text: string): string {
  return text
    .replace(/\[TOOL\][\s\S]*?\[\/TOOL\]/g, '')
    .replace(/\[WAIT\]/g, '')
    .split('\n')
    .filter(
      (line) => !line.trim().startsWith('[工具结果]:') && !line.trim().startsWith('[工具错误]:'),
    )
    .join('\n')
    .trim();
}

export function parseAndPrintResponse(text: string): void {
  const regex = /\[TOOL\]([\s\S]*?)\[\/TOOL\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      const cleaned = before
        .split('\n')
        .filter(
          (line) =>
            !line.trim().startsWith('[工具结果]:') && !line.trim().startsWith('[工具错误]:'),
        )
        .join('\n');
      if (cleaned.trim()) {
        printContent(cleaned);
      }
    }

    const toolContent = match[1].trim();
    printToolBlock(`[TOOL] ${toolContent} [/TOOL]`);

    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    const cleaned = remaining
      .split('\n')
      .filter(
        (line) => !line.trim().startsWith('[工具结果]:') && !line.trim().startsWith('[工具错误]:'),
      )
      .join('\n');
    if (cleaned.trim()) {
      printContent(cleaned);
    }
  }
}
