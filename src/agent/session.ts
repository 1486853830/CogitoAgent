import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildSystemPrompt } from './system-prompt.ts';
import type { Message, SessionMeta, SessionInfo } from '../types/index.ts';
import { broadcast } from '../io/ws-server.ts';
import { recordSession } from './stats.ts';
import { estimateTokens } from '../utils/token.ts';
import { applyPersona } from './persona.ts';

const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const SESSIONS_DIR = path.resolve(DATA_DIR, 'data', 'sessions');
const META_FILE = path.join(SESSIONS_DIR, 'meta.json');

function generateId(): string {
  return 'sess_' + Date.now().toString(36) + crypto.randomUUID().split('-')[0];
}

function ensureDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function loadMeta(): SessionMeta {
  ensureDir();
  try {
    if (existsSync(META_FILE)) {
      const data = readFileSync(META_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`[会话] 元数据加载失败: ${(e as Error).message}`);
  }
  return { sessions: [], activeId: null };
}

function saveMeta(meta: SessionMeta): void {
  try {
    broadcast('session-meta-update', { meta });
    console.log('[会话] 元数据已广播给主进程');
  } catch (e) {
    console.error(`[会话] 元数据广播失败: ${(e as Error).message}`);
  }

  try {
    ensureDir();
    writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (e) {
    console.warn(`[会话] 本地元数据保存失败（主进程会处理）: ${(e as Error).message}`);
  }
}

/**
 * 校验 sessionId 是否包含路径遍历字符（.. 或路径分隔符）
 */
function isValidSessionId(sessionId: string): boolean {
  return (
    !sessionId.includes('..') &&
    !sessionId.includes('/') &&
    !sessionId.includes(path.sep) &&
    !sessionId.includes('\\')
  );
}

function loadSession(sessionId: string): Message[] {
  if (!isValidSessionId(sessionId)) {
    console.error(`[会话] 非法 sessionId: ${sessionId}`);
    return [];
  }
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`[会话] 加载会话 ${sessionId} 失败: ${(e as Error).message}`);
  }
  return [];
}

function saveSession(sessionId: string, messages: Message[]): void {
  if (!isValidSessionId(sessionId)) {
    console.error(`[会话] 非法 sessionId: ${sessionId}`);
    return;
  }
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 保存会话 ${sessionId} 失败: ${(e as Error).message}`);
  }
}

let currentSessionId: string | null = null;
let conversationHistory: Message[] = [];
let turnCount = 0;
const COMPRESS_TURNS = 150;
const KEEP_RECENT_TURNS = 10;
const ARCHIVE_SUFFIX = '_archive';

const MAX_TOKEN_ESTIMATE = 100000;
const WARN_TOKEN_THRESHOLD = 80000;

function initializeSession(sessionId?: string | null): boolean {
  const meta = loadMeta();

  if (sessionId) {
    if (!meta.sessions.find((s) => s.id === sessionId)) {
      console.error(`[会话] 会话 ${sessionId} 不存在`);
      return false;
    }
    currentSessionId = sessionId;
  } else if (meta.activeId && meta.sessions.find((s) => s.id === meta.activeId)) {
    currentSessionId = meta.activeId;
  } else {
    createNewSession();
  }

  const messages = loadSession(currentSessionId!);
  if (messages.length === 0) {
    conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
  } else {
    conversationHistory = messages;
    conversationHistory[0] = { role: 'system', content: buildSystemPrompt() };
  }

  turnCount = conversationHistory.filter((m) => m.role !== 'system').length;
  meta.activeId = currentSessionId;
  saveMeta(meta);

  console.log(`[会话] 已加载会话: ${currentSessionId} (${turnCount} 条消息)`);
  return true;
}

function getOrCreateWechatSession(): string {
  const meta = loadMeta();
  const existing = meta.sessions.find((s) => s.name === '微信通道');
  if (existing) {
    return existing.id;
  }

  const id = generateId();
  const session: SessionInfo = {
    id,
    name: '微信通道',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  meta.sessions.push(session);
  saveMeta(meta);

  const messages: Message[] = [{ role: 'system', content: buildSystemPrompt() }];
  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  ensureDir();
  writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf-8');

  console.error(`[会话] 已创建微信专属会话: ${session.name}`);
  return id;
}

function createNewSession(name?: string | null, persona?: string | null) {
  if (currentSessionId) {
    archiveCurrentSession();
  }

  const meta = loadMeta();
  const id = generateId();
  const session: SessionInfo = {
    id,
    name: name || `会话 ${meta.sessions.length + 1}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    persona: persona || undefined,
  };

  meta.sessions.push(session);
  meta.activeId = id;
  saveMeta(meta);

  currentSessionId = id;
  conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
  turnCount = 0;
  saveSession(id, conversationHistory);
  recordSession();

  console.log(`[会话] 已创建新会话: ${session.name}`);
  return session;
}

function archiveCurrentSession(): void {
  if (!currentSessionId) return;

  const messages = conversationHistory.filter((m) => m.role !== 'system');
  if (messages.length === 0) return;

  const archiveFile = path.join(SESSIONS_DIR, `${currentSessionId}${ARCHIVE_SUFFIX}.json`);
  try {
    let archives: Array<{ timestamp: string; messages: Message[] }> = [];
    if (existsSync(archiveFile)) {
      archives = JSON.parse(readFileSync(archiveFile, 'utf-8'));
    }

    archives.push({
      timestamp: new Date().toISOString(),
      messages: messages.slice(0, -KEEP_RECENT_TURNS),
    });

    if (archives.length > 3) {
      archives = archives.slice(-3);
    }

    writeFileSync(archiveFile, JSON.stringify(archives, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 归档失败: ${(e as Error).message}`);
  }
}

function switchSession(sessionId: string): {
  success: boolean;
  error?: string;
  session?: SessionInfo;
} {
  if (!isValidSessionId(sessionId)) {
    return { success: false, error: '非法的会话 ID' };
  }
  const meta = loadMeta();
  const session = meta.sessions.find((s) => s.id === sessionId);

  if (!session) {
    return { success: false, error: '会话不存在' };
  }

  archiveCurrentSession();
  if (currentSessionId) {
    saveSession(currentSessionId, conversationHistory);
  }

  currentSessionId = sessionId;
  meta.activeId = sessionId;
  session.lastActiveAt = new Date().toISOString();
  saveMeta(meta);

  // 如果会话绑定了人设，切换到对应人设
  if (session.persona) {
    if (applyPersona(session.persona as string)) {
      console.log(`[会话] 切换到人设: ${session.persona}`);
    }
  }

  const messages = loadSession(sessionId);
  conversationHistory =
    messages.length > 0 ? messages : [{ role: 'system', content: buildSystemPrompt() }];
  turnCount = conversationHistory.filter((m) => m.role !== 'system').length;

  return { success: true, session };
}

function deleteSession(sessionId: string): { success: boolean; error?: string } {
  if (!isValidSessionId(sessionId)) {
    return { success: false, error: '非法的会话 ID' };
  }
  const meta = loadMeta();
  const index = meta.sessions.findIndex((s) => s.id === sessionId);

  if (index === -1) {
    return { success: false, error: '会话不存在' };
  }

  if (meta.sessions.length <= 1) {
    return { success: false, error: '至少保留一个会话' };
  }

  if (currentSessionId === sessionId) {
    const nextSession = meta.sessions.find((s) => s.id !== sessionId);
    if (nextSession) {
      switchSession(nextSession.id);
    }
  }

  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
  const archiveFile = path.join(SESSIONS_DIR, `${sessionId}${ARCHIVE_SUFFIX}.json`);

  try {
    if (existsSync(sessionFile)) {
      unlinkSync(sessionFile);
    }
    if (existsSync(archiveFile)) {
      unlinkSync(archiveFile);
    }
  } catch {
    // 忽略删除失败
  }

  meta.sessions.splice(index, 1);
  saveMeta(meta);

  return { success: true };
}

function renameSession(
  sessionId: string,
  newName: string,
): { success: boolean; error?: string; session?: SessionInfo } {
  if (!isValidSessionId(sessionId)) {
    return { success: false, error: '非法的会话 ID' };
  }
  const meta = loadMeta();
  const session = meta.sessions.find((s) => s.id === sessionId);

  if (!session) {
    return { success: false, error: '会话不存在' };
  }

  session.name = newName;
  saveMeta(meta);

  return { success: true, session };
}

function listSessions() {
  const meta = loadMeta();

  if (meta.sessions.length === 0) {
    recoverSessionsFromDisk(meta);
  }

  return meta.sessions.map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt || s.createdAt,
    isActive: s.id === currentSessionId,
  }));
}

function recoverSessionsFromDisk(meta: SessionMeta): void {
  try {
    const files = readdirSync(SESSIONS_DIR);
    const recovered: SessionInfo[] = [];

    for (const file of files) {
      if (!file.match(/^sess_[^_]+\.json$/)) continue;
      const sessionId = file.replace('.json', '');
      try {
        const content = JSON.parse(readFileSync(path.join(SESSIONS_DIR, file), 'utf-8'));
        const messageCount = Array.isArray(content)
          ? content.filter(
              (m: Message) =>
                m.role !== 'system' &&
                !(m.role === 'user' && m.content.startsWith('[系统返回的工具执行结果]')),
            ).length
          : 0;
        recovered.push({
          id: sessionId,
          name: `会话 ${recovered.length + 1}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.log(`[会话] 已恢复会话: ${sessionId} (${messageCount} 条消息)`);
      } catch {
        // 跳过损坏的文件
      }
    }

    if (recovered.length > 0) {
      meta.sessions = recovered;
      if (!meta.activeId || !meta.sessions.find((s) => s.id === meta.activeId)) {
        meta.activeId = recovered[0].id;
      }
      if (!currentSessionId) {
        currentSessionId = meta.activeId;
      }
      saveMeta(meta);
      console.log(`[会话] 已从磁盘恢复 ${recovered.length} 个会话`);
    }
  } catch {
    // 目录不存在时忽略
  }
}

function getCurrentSession(): SessionInfo | null {
  if (!currentSessionId) return null;
  const meta = loadMeta();
  return meta.sessions.find((s) => s.id === currentSessionId) || null;
}

function getMessages(): Message[] {
  return [...conversationHistory];
}

function addUserMessage(content: string): void {
  conversationHistory.push({ role: 'user', content });
  turnCount++;
  saveSession(currentSessionId!, conversationHistory);

  const meta = loadMeta();
  const session = meta.sessions.find((s) => s.id === currentSessionId);
  if (session) {
    session.lastActiveAt = new Date().toISOString();
    session.messageCount = turnCount;
    saveMeta(meta);
  }
}

function addAssistantMessage(content: string): void {
  conversationHistory.push({ role: 'assistant', content });
  turnCount++;
  saveSession(currentSessionId!, conversationHistory);
}

function addToolResultMessage(content: string): void {
  conversationHistory.push({ role: 'user', content });
  saveSession(currentSessionId!, conversationHistory);
}

function getContextTokenEstimate(): number {
  let totalTokens = 0;
  for (const msg of conversationHistory) {
    totalTokens += estimateTokens(msg.content);
  }
  return totalTokens;
}

function shouldCompress(): boolean {
  if (turnCount >= COMPRESS_TURNS) {
    return true;
  }

  const tokenEstimate = getContextTokenEstimate();
  if (tokenEstimate >= MAX_TOKEN_ESTIMATE) {
    return true;
  }

  return false;
}

function isApproachingLimit(): boolean {
  const tokenEstimate = getContextTokenEstimate();
  return tokenEstimate >= WARN_TOKEN_THRESHOLD && tokenEstimate < MAX_TOKEN_ESTIMATE;
}

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

function compressHistory(): void {
  const nonSystemMessages = conversationHistory.filter((m) => m.role !== 'system');

  if (nonSystemMessages.length <= KEEP_RECENT_TURNS) {
    return;
  }

  const toArchive = nonSystemMessages.slice(0, -KEEP_RECENT_TURNS);
  if (toArchive.length > 0) {
    archiveCurrentSession();
  }

  const recentMessages = nonSystemMessages.slice(-KEEP_RECENT_TURNS);
  const summary = generateSummary(recentMessages);

  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `[上下文摘要] ${summary}` },
    ...recentMessages,
  ];

  turnCount = recentMessages.length;
  saveSession(currentSessionId!, conversationHistory);
}

function generateSummary(messages: Message[]): string {
  const tools = new Set<string>();
  const requests: string[] = [];

  for (const msg of messages) {
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

function getHistoryLength(): number {
  return conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);
}

function resetConversation(): void {
  conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
  turnCount = 0;
  if (currentSessionId) {
    saveSession(currentSessionId, conversationHistory);
  }
}

function updateSystemPrompt(): void {
  if (conversationHistory.length > 0 && conversationHistory[0].role === 'system') {
    conversationHistory[0].content = buildSystemPrompt();
    if (currentSessionId) {
      saveSession(currentSessionId, conversationHistory);
    }
    console.log(`[会话] System prompt 已更新`);
  }
}

function setConversationHistory(messages: Message[]): void {
  conversationHistory = [{ role: 'system', content: buildSystemPrompt() }, ...messages];
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
  updateSystemPrompt,
  setConversationHistory,
  estimateTokens,
  getContextTokenEstimate,
  isApproachingLimit,
  getCompressionAdvice,
};
