/**
 * 会话管理模块 - 支持多会话
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildSystemPrompt } from './system-prompt.js';

const SESSIONS_DIR = path.resolve(process.cwd(), 'data', 'sessions');
const META_FILE = path.join(SESSIONS_DIR, 'meta.json');

// 生成唯一 ID
function generateId() {
  return 'sess_' + Date.now().toString(36) + crypto.randomUUID().split('-')[0];
}

// 确保目录存在
function ensureDir() {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * 加载会话元数据
 */
function loadMeta() {
  ensureDir();
  try {
    if (existsSync(META_FILE)) {
      const data = readFileSync(META_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`[会话] 元数据加载失败: ${e.message}`);
  }
  return { sessions: [], activeId: null };
}

/**
 * 保存会话元数据
 */
function saveMeta(meta) {
  try {
    ensureDir();
    writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 元数据保存失败: ${e.message}`);
  }
}

/**
 * 加载单个会话历史
 */
function loadSession(sessionId) {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`[会话] 加载会话 ${sessionId} 失败: ${e.message}`);
  }
  return [];
}

/**
 * 保存单个会话历史
 */
function saveSession(sessionId, messages) {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 保存会话 ${sessionId} 失败: ${e.message}`);
  }
}

// 当前会话状态
let currentSessionId = null;
let conversationHistory = [];
let turnCount = 0;
const COMPRESS_TURNS = 150;
const KEEP_RECENT_TURNS = 10;
const ARCHIVE_SUFFIX = '_archive';

// 上下文长度限制（Token 估算，约 128K 上下文）
const MAX_TOKEN_ESTIMATE = 100000;
const WARN_TOKEN_THRESHOLD = 80000;  // 80% 时发出警告

// buildSystemPrompt / buildToolList 已移动到 system-prompt.js

/**
 * 初始化或加载会话
 */
function initializeSession(sessionId = null) {
  const meta = loadMeta();

  if (sessionId) {
    // 切换到指定会话
    if (!meta.sessions.find(s => s.id === sessionId)) {
      console.error(`[会话] 会话 ${sessionId} 不存在`);
      return false;
    }
    currentSessionId = sessionId;
  } else if (meta.activeId && meta.sessions.find(s => s.id === meta.activeId)) {
    // 恢复上次会话
    currentSessionId = meta.activeId;
  } else {
    // 创建新会话
    createNewSession();
  }

  // 加载会话历史
  const messages = loadSession(currentSessionId);
  if (messages.length === 0) {
    conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
  } else {
    conversationHistory = messages;
    // 重新构建系统提示（路径可能变化）
    conversationHistory[0] = { role: 'system', content: buildSystemPrompt() };
  }

  turnCount = conversationHistory.filter(m => m.role !== 'system').length;
  meta.activeId = currentSessionId;
  saveMeta(meta);

  console.error(`[会话] 已加载会话: ${currentSessionId} (${turnCount} 条消息)`);
  return true;
}

/**
 * 获取或创建微信专属会话（不切换当前会话）
 */
function getOrCreateWechatSession() {
  const meta = loadMeta();
  const existing = meta.sessions.find(s => s.name === '微信通道');
  if (existing) {
    return existing.id;
  }

  const id = generateId();
  const session = {
    id,
    name: '微信通道',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    messageCount: 0
  };

  meta.sessions.push(session);
  saveMeta(meta);

  const messages = [{ role: 'system', content: buildSystemPrompt() }];
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  ensureDir();
  writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf-8');

  console.error(`[会话] 已创建微信专属会话: ${session.name}`);
  return id;
}

/**
 * 创建新会话
 */
function createNewSession(name = null) {
  // 归档当前会话
  if (currentSessionId) {
    archiveCurrentSession();
  }

  const meta = loadMeta();
  const id = generateId();
  const session = {
    id,
    name: name || `会话 ${meta.sessions.length + 1}`,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    messageCount: 0
  };

  meta.sessions.push(session);
  meta.activeId = id;
  saveMeta(meta);

  currentSessionId = id;
  conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
  turnCount = 0;
  saveSession(id, conversationHistory);

  console.error(`[会话] 已创建新会话: ${session.name}`);
  return session;
}

/**
 * 归档当前会话
 */
function archiveCurrentSession() {
  if (!currentSessionId) return;

  const messages = conversationHistory.filter(m => m.role !== 'system');
  if (messages.length === 0) return;

  const archiveFile = path.join(SESSIONS_DIR, `${currentSessionId}${ARCHIVE_SUFFIX}.json`);
  try {
    let archives = [];
    if (existsSync(archiveFile)) {
      archives = JSON.parse(readFileSync(archiveFile, 'utf-8'));
    }

    archives.push({
      timestamp: new Date().toISOString(),
      messages: messages.slice(0, -KEEP_RECENT_TURNS)
    });

    // 只保留最近 3 个归档
    if (archives.length > 3) {
      archives = archives.slice(-3);
    }

    writeFileSync(archiveFile, JSON.stringify(archives, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 归档失败: ${e.message}`);
  }
}

/**
 * 切换会话
 */
function switchSession(sessionId) {
  const meta = loadMeta();
  const session = meta.sessions.find(s => s.id === sessionId);

  if (!session) {
    return { success: false, error: '会话不存在' };
  }

  // 归档当前会话
  archiveCurrentSession();
  saveSession(currentSessionId, conversationHistory);

  // 切换
  currentSessionId = sessionId;
  meta.activeId = sessionId;
  session.lastActiveAt = new Date().toISOString();
  saveMeta(meta);

  // 加载新会话
  const messages = loadSession(sessionId);
  conversationHistory = messages.length > 0 ? messages : [{ role: 'system', content: buildSystemPrompt() }];
  turnCount = conversationHistory.filter(m => m.role !== 'system').length;

  return { success: true, session };
}

/**
 * 删除会话
 */
function deleteSession(sessionId) {
  const meta = loadMeta();
  const index = meta.sessions.findIndex(s => s.id === sessionId);

  if (index === -1) {
    return { success: false, error: '会话不存在' };
  }

  // 不能删除最后一个会话
  if (meta.sessions.length <= 1) {
    return { success: false, error: '至少保留一个会话' };
  }

  // 如果删除的是当前会话，先切换
  if (currentSessionId === sessionId) {
    const nextSession = meta.sessions.find(s => s.id !== sessionId);
    if (nextSession) {
      switchSession(nextSession.id);
    }
  }

  // 删除文件和元数据
  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
  const archiveFile = path.join(SESSIONS_DIR, `${sessionId}${ARCHIVE_SUFFIX}.json`);

  try {
    if (existsSync(sessionFile)) {
      unlinkSync(sessionFile);
    }
    if (existsSync(archiveFile)) {
      unlinkSync(archiveFile);
    }
  } catch (e) {
    // 忽略删除失败
  }

  meta.sessions.splice(index, 1);
  saveMeta(meta);

  return { success: true };
}

/**
 * 重命名会话
 */
function renameSession(sessionId, newName) {
  const meta = loadMeta();
  const session = meta.sessions.find(s => s.id === sessionId);

  if (!session) {
    return { success: false, error: '会话不存在' };
  }

  session.name = newName;
  saveMeta(meta);

  return { success: true, session };
}

/**
 * 获取所有会话列表
 */
function listSessions() {
  const meta = loadMeta();

  // 如果 meta 中没有会话但磁盘上有会话文件，自动恢复
  if (meta.sessions.length === 0) {
    recoverSessionsFromDisk(meta);
  }

  return meta.sessions.map(s => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    isActive: s.id === currentSessionId
  }));
}

/**
 * 从磁盘恢复丢失的会话元数据
 */
function recoverSessionsFromDisk(meta) {
  try {
    const files = readdirSync(SESSIONS_DIR);
    const recovered = [];

    for (const file of files) {
      if (!file.match(/^sess_[^_]+\.json$/)) continue;
      const sessionId = file.replace('.json', '');
      try {
        const content = JSON.parse(readFileSync(path.join(SESSIONS_DIR, file), 'utf-8'));
        // 统计真实消息数（排除 system prompt 和系统注入的工具结果消息）
        const messageCount = Array.isArray(content) ? content.filter(m =>
          m.role !== 'system' &&
          !(m.role === 'user' && m.content.startsWith('[系统返回的工具执行结果]'))
        ).length : 0;
        recovered.push({
          id: sessionId,
          name: `会话 ${recovered.length + 1}`,
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          messageCount
        });
        console.error(`[会话] 已恢复会话: ${sessionId} (${messageCount} 条消息)`);
      } catch (e) {
        // 跳过损坏的文件
      }
    }

    if (recovered.length > 0) {
      meta.sessions = recovered;
      if (!meta.activeId || !meta.sessions.find(s => s.id === meta.activeId)) {
        meta.activeId = recovered[0].id;
      }
      if (!currentSessionId) {
        currentSessionId = meta.activeId;
      }
      saveMeta(meta);
      console.error(`[会话] 已从磁盘恢复 ${recovered.length} 个会话`);
    }
  } catch (e) {
    // 目录不存在时忽略
  }
}

/**
 * 获取当前会话信息
 */
function getCurrentSession() {
  if (!currentSessionId) return null;
  const meta = loadMeta();
  return meta.sessions.find(s => s.id === currentSessionId);
}

/**
 * 获取消息历史
 */
function getMessages() {
  return [...conversationHistory];
}

/**
 * 添加用户消息
 */
function addUserMessage(content) {
  conversationHistory.push({ role: 'user', content });
  turnCount++;
  saveSession(currentSessionId, conversationHistory);

  // 更新元数据
  const meta = loadMeta();
  const session = meta.sessions.find(s => s.id === currentSessionId);
  if (session) {
    session.lastActiveAt = new Date().toISOString();
    session.messageCount = turnCount;
    saveMeta(meta);
  }
}

/**
 * 添加助手消息
 */
function addAssistantMessage(content) {
  conversationHistory.push({ role: 'assistant', content });
  turnCount++;
  saveSession(currentSessionId, conversationHistory);
}

/**
 * 添加工具结果消息（作为 user 角色注入，但不计入轮次）
 * 工具结果由系统注入，不是真实用户输入，不影响 turnCount 和会话活跃时间
 */
function addToolResultMessage(content) {
  conversationHistory.push({ role: 'user', content });
  saveSession(currentSessionId, conversationHistory);
}

/**
 * 估算 Token 数量（简单估算）
 * 中文字符约 1 token ≈ 1.5 字符
 * 英文字符约 1 token ≈ 4 字符
 */
function estimateTokens(text) {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5) + Math.ceil(otherChars / 4);
}

/**
 * 获取当前上下文 Token 估算
 */
function getContextTokenEstimate() {
  let totalTokens = 0;
  for (const msg of conversationHistory) {
    totalTokens += estimateTokens(msg.content);
  }
  return totalTokens;
}

/**
 * 检查是否需要压缩（基于轮数和 Token 数量）
 */
function shouldCompress() {
  // 超过轮数限制
  if (turnCount >= COMPRESS_TURNS) {
    return true;
  }

  // 超过 Token 限制
  const tokenEstimate = getContextTokenEstimate();
  if (tokenEstimate >= MAX_TOKEN_ESTIMATE) {
    return true;
  }

  return false;
}

/**
 * 检查是否接近限制（用于警告）
 */
function isApproachingLimit() {
  const tokenEstimate = getContextTokenEstimate();
  return tokenEstimate >= WARN_TOKEN_THRESHOLD && tokenEstimate < MAX_TOKEN_ESTIMATE;
}

/**
 * 获取压缩建议
 */
function getCompressionAdvice() {
  const tokenEstimate = getContextTokenEstimate();
  const usage = Math.round((tokenEstimate / MAX_TOKEN_ESTIMATE) * 100);

  if (usage >= 100) {
    return { level: 'critical', usage, message: '上下文即将爆满，建议压缩' };
  } else if (usage >= 80) {
    return { level: 'warning', usage, message: '上下文使用率较高，建议适时压缩' };
  } else if (usage >= 50) {
    return { level: 'info', usage, message: '上下文使用适中' };
  }
  return { level: 'ok', usage, message: '上下文充足' };
}

/**
 * 压缩历史记录
 */
function compressHistory() {
  const nonSystemMessages = conversationHistory.filter(m => m.role !== 'system');

  if (nonSystemMessages.length <= KEEP_RECENT_TURNS) {
    return;
  }

  // 归档到文件
  const toArchive = nonSystemMessages.slice(0, -KEEP_RECENT_TURNS);
  if (toArchive.length > 0) {
    archiveCurrentSession();
  }

  // 保留最近对话
  const recentMessages = nonSystemMessages.slice(-KEEP_RECENT_TURNS);

  // 生成摘要
  const summary = generateSummary(recentMessages);

  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `[上下文摘要] ${summary}` },
    ...recentMessages
  ];

  turnCount = recentMessages.length;
  saveSession(currentSessionId, conversationHistory);
}

/**
 * 生成上下文摘要
 */
function generateSummary(messages) {
  const tools = new Set();
  const requests = [];

  for (const msg of messages) {
    // 跳过系统注入的工具结果消息，只统计真实用户请求
    if (msg.role === 'user' && !msg.content.startsWith('[系统返回的工具执行结果]')) {
      requests.push(msg.content.slice(0, 80));
    }
    const matches = msg.content.matchAll(/\[TOOL\]\s*(\w+)/g);
    for (const match of matches) {
      tools.add(match[1]);
    }
  }

  let summary = `最近 ${messages.length} 轮对话摘要：\n`;
  if (tools.size > 0) {
    summary += `- 使用工具: ${[...tools].join(', ')}\n`;
  }
  if (requests.length > 0) {
    summary += `- 用户请求: ${requests.slice(-3).join(' | ')}`;
  }

  return summary;
}

/**
 * 获取历史长度
 */
function getHistoryLength() {
  return conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);
}

/**
 * 重置对话历史（切换 persona 时调用）
 */
function resetConversation() {
  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() }
  ];
  turnCount = 0;
  // 保存重置后的会话
  if (currentSessionId) {
    saveSession(currentSessionId, conversationHistory);
  }
}

function setConversationHistory(messages) {
  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() },
    ...messages
  ];
  turnCount = messages.length;
  if (currentSessionId) {
    saveSession(currentSessionId, conversationHistory);
  }
}

export {
  initializeSession,
  createNewSession,
  getOrCreateWechatSession,
  switchSession,
  deleteSession,
  renameSession,
  listSessions,
  getCurrentSession,
  getMessages,
  addUserMessage,
  addAssistantMessage,
  addToolResultMessage,
  shouldCompress,
  compressHistory,
  getHistoryLength,
  resetConversation,
  setConversationHistory,
  estimateTokens,
  getContextTokenEstimate,
  isApproachingLimit,
  getCompressionAdvice
};
