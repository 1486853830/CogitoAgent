import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
  statSync,
} from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildSystemPrompt } from './system-prompt.ts';
import type { Message, SessionMeta, SessionInfo, SessionNote } from '../types/index.ts';
import { broadcast } from '../io/ws-server.ts';
import { recordSession } from './stats.ts';
import { estimateTokens } from '../utils/token.ts';
import { applyPersona } from './persona.ts';
import { loadConfig } from '../config.ts';
import { chatText } from '../api/client.ts';

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
  } catch (e) {
    console.error(`[会话] 元数据广播失败: ${(e as Error).message}`);
  }

  // CLI 模式下没有 Electron 主进程兜底，本地持久化是唯一的元数据保存路径。
  // 失败时必须记录为 error——否则用户创建的会话在重启后可能全部消失。
  try {
    ensureDir();
    writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 元数据本地保存失败！会话列表可能在重启后丢失: ${(e as Error).message}`);
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

/**
 * 非阻塞持久化路径（R3.3）：同一会话的写操作串行排队，不阻塞思考循环。
 * 与同步版 saveSession 并存：关键原子操作（创建/切换/清空）仍走同步路径，
 * 高频的对话流式写入走此队列。
 */
let saveQueue: Promise<void> = Promise.resolve();

/** 异步写入连续失败计数：连续 5 次失败后发出用户可见警告（通过 console.error + broadcast）。 */
let saveAsyncFailures = 0;
const SAVE_ASYNC_FAILURE_THRESHOLD = 5;

function saveSessionAsync(sessionId: string, messages: Message[]): Promise<void> {
  if (!isValidSessionId(sessionId)) {
    return Promise.resolve();
  }
  // 确保会话目录存在。若磁盘满或权限不足，ensureDir 内的 mkdirSync 会同步抛出；
  // 但 saveSessionAsync 对外声明返回 Promise，调用方用 await/catch 处理，
  // 将无法捕获同步异常（unhandledRejection）。因此包装 try-catch 转为 rejected Promise。
  try {
    ensureDir();
  } catch (e: unknown) {
    console.error(`[会话] 创建会话目录失败: ${(e as Error).message}`);
    return Promise.reject(e);
  }
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  const payload = JSON.stringify(messages, null, 2);
  // 将写入任务串联到队列尾部：即使前一个任务失败，后续任务仍可继续执行。
  // 使用 .then() 而非链式 .catch() 吞掉错误，确保持久化链不会因单次失败而断裂。
  const task: Promise<void> = saveQueue.then(() => fsp.writeFile(filePath, payload, 'utf-8'));
  saveQueue = task.then(
    () => {
      saveAsyncFailures = 0; // 成功写入，重置失败计数
    },
    (e: Error) => {
      saveAsyncFailures++;
      console.error(`[会话] 异步保存会话 ${sessionId} 失败: ${e.message}`);
      // 连续多次写入失败时发出用户可见警告：用户可能在进程重启后丢失数据
      if (saveAsyncFailures >= SAVE_ASYNC_FAILURE_THRESHOLD) {
        const alertMsg =
          `[会话] ⚠️ 会话数据连续 ${saveAsyncFailures} 次写入失败！` +
          ' 请检查磁盘空间与权限，重启后可能丢失最近对话。';
        console.error(alertMsg);
        try {
          broadcast('agent-reply', { type: 'error', data: alertMsg });
        } catch {
          /* ignore */
        }
      }
    },
  );
  return task;
}

/**
 * 等待所有排队的会话写操作完成（R3.1）。
 * 热路径的 add* 函数为 fire-and-forget 异步写入，不阻塞调用方；
 * 测试与优雅退出前可 await 此方法确保落盘。
 */
export function flushSessionWrites(): Promise<void> {
  return saveQueue;
}

let currentSessionId: string | null = null;
let conversationHistory: Message[] = [];
let turnCount = 0;
const COMPRESS_TURNS = 150;
const KEEP_RECENT_TURNS = 10;
const ARCHIVE_SUFFIX = '_archive';

/**
 * 依据模型上下文窗口推导压缩阈值（R3.4）。
 * 未识别模型时回退默认 100K / 80K，保证既有行为与测试稳定。
 */
const MODEL_CONTEXT_WINDOWS: Array<{ pattern: RegExp; tokens: number }> = [
  { pattern: /gpt-4\.1|gpt-5/i, tokens: 1000000 },
  { pattern: /gpt-4o|gpt-4-turbo/i, tokens: 128000 },
  { pattern: /claude|haiku|opus/i, tokens: 200000 },
  { pattern: /gemini/i, tokens: 1000000 },
  { pattern: /deepseek/i, tokens: 65536 },
  { pattern: /moonshot|kimi/i, tokens: 128000 },
  { pattern: /moark|qwen|internlm/i, tokens: 100000 },
];

function getModelContextWindow(): number {
  const model = loadConfig().api?.model || '';
  for (const { pattern, tokens } of MODEL_CONTEXT_WINDOWS) {
    if (pattern.test(model)) return tokens;
  }
  return 100000;
}

/** 上下文上限 / 预警阈值（R3.4）。 */
function getContextLimits(): { max: number; warn: number } {
  const max = getModelContextWindow();
  return { max, warn: Math.round(max * 0.8) };
}

function initializeSession(sessionId?: string | null): boolean {
  const meta = loadMeta();

  if (sessionId) {
    if (!meta.sessions.find((s) => s.id === sessionId)) {
      console.error(`[会话] 会话 ${sessionId} 不存在`);
      return false;
    }
    currentSessionId = sessionId;
  } else {
    // 启动时（无显式 sessionId）不自动加载上次的活跃会话，也不自动创建新会话，
    // 保持"未选中任何对话"状态，等待用户在欢迎页发消息或点击新建任务后再创建。
    // 同时清除 meta.activeId，避免前端会话列表默认高亮选中某个会话。
    currentSessionId = null;
    meta.activeId = null;
    saveMeta(meta);
  }

  if (currentSessionId) {
    const messages = loadSession(currentSessionId);
    if (messages.length === 0) {
      conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
    } else {
      conversationHistory = messages;
      conversationHistory[0] = { role: 'system', content: buildSystemPrompt() };
    }
    meta.activeId = currentSessionId;
    saveMeta(meta);
    turnCount = conversationHistory.filter((m) => m.role !== 'system').length;
    console.log(`[会话] 已加载会话: ${currentSessionId} (${turnCount} 条消息)`);
  } else {
    // 无会话：仅初始化系统提示词（含默认人设），不写入 meta，也不创建会话文件
    conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
    turnCount = 0;
    console.log('[会话] 启动：未选中任何会话，等待创建');
  }
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
        // 使用文件的修改时间而非当前时间，使恢复的会话保留原始时间戳
        let fileMtime: string;
        try {
          fileMtime = statSync(path.join(SESSIONS_DIR, file)).mtime.toISOString();
        } catch {
          fileMtime = new Date().toISOString();
        }
        recovered.push({
          id: sessionId,
          name: `会话 ${recovered.length + 1}`,
          createdAt: fileMtime,
          updatedAt: fileMtime,
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
  // 无会话时懒创建（首次发消息自动建会话，应用默认人设）
  if (!currentSessionId) {
    createNewSession();
  }
  conversationHistory.push({ role: 'user', content });
  turnCount++;
  // R3.1：热路径走异步写队列，避免每次消息同步落盘阻塞思考循环
  saveSessionAsync(currentSessionId!, conversationHistory);

  const meta = loadMeta();
  const session = meta.sessions.find((s) => s.id === currentSessionId);
  if (session) {
    session.lastActiveAt = new Date().toISOString();
    session.messageCount = turnCount;
    saveMeta(meta);
  }
}

function addAssistantMessage(content: string): void {
  // 无会话时懒创建（理论上先有用户消息，兜底保护）
  if (!currentSessionId) {
    createNewSession();
  }
  conversationHistory.push({ role: 'assistant', content });
  turnCount++;
  // R3.1：热路径走异步写队列
  saveSessionAsync(currentSessionId!, conversationHistory);
}

/**
 * 原生协议：助手消息内嵌 tool_calls（R1.3）。
 * 下一轮请求时这些 calls 会随 assistant 消息回传，tool 结果以 role=tool 消息续接。
 */
function addAssistantNativeMessage(
  content: string,
  tool_calls: NonNullable<Message['tool_calls']>,
): void {
  if (!currentSessionId) {
    createNewSession();
  }
  conversationHistory.push({ role: 'assistant', content, tool_calls });
  turnCount++;
  // R3.1：热路径走异步写队列
  saveSessionAsync(currentSessionId!, conversationHistory);
}

function addToolResultMessage(content: string, options?: { toolCallId?: string }): void {
  // 无会话时懒创建（工具结果必然发生在会话中，兜底保护）
  if (!currentSessionId) {
    createNewSession();
  }
  // 原生 function calling 协议要求工具结果必须以 role='tool' + tool_call_id 形式
  // 回传，否则 API 收到 orphan user 消息夹在 assistant(tool_calls) 之间会 400。
  // 未传 toolCallId 时使用哨兵值避免破坏协议，同时记录告警以便追踪调用方遗漏。
  const toolCallId = options?.toolCallId;
  if (!toolCallId || typeof toolCallId !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(toolCallId)) {
    console.warn(
      `[会话] addToolResultMessage 缺少合法 toolCallId（got: ${String(toolCallId)}），` +
        '跳过注入以避免破坏原生工具调用协议。调用方应在 executeNativeToolCallsServer 中提供有效 toolCallId。',
    );
    return;
  }
  const message: Message = { role: 'tool', content, tool_call_id: toolCallId };
  conversationHistory.push(message);
  // R3.1：热路径统一走异步写队列
  saveSessionAsync(currentSessionId!, conversationHistory);
}

function getContextTokenEstimate(): number {
  let totalTokens = 0;
  for (const msg of conversationHistory) {
    totalTokens += estimateTokens(msg.content);
  }
  return totalTokens;
}

function shouldCompress(): boolean {
  const { max } = getContextLimits();
  if (turnCount >= COMPRESS_TURNS) {
    return true;
  }

  const tokenEstimate = getContextTokenEstimate();
  if (tokenEstimate >= max) {
    return true;
  }

  return false;
}

function isApproachingLimit(): boolean {
  const { max, warn } = getContextLimits();
  const tokenEstimate = getContextTokenEstimate();
  return tokenEstimate >= warn && tokenEstimate < max;
}

function getCompressionAdvice() {
  const { max } = getContextLimits();
  const tokenEstimate = getContextTokenEstimate();
  const usage = Math.round((tokenEstimate / max) * 100);

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
 * 单次摘要请求承载的目标 token 上限。超过则切块，避免超出模型上下文窗口。
 */
const COMPRESS_CHUNK_TOKENS = 3000;

/**
 * 压缩摘要系统提示：要求模型保留目标、决策、关键数据/代码/路径、待办与进度，
 * 丢弃寒暄与冗余（R3.2 智能压缩）。
 */
const COMPRESS_SUMMARY_SYSTEM =
  '你是 CogitoAgent 的对话历史压缩器。下面是被归档的一段对话（含用户请求、助手回复、' +
  '工具调用与执行结果）。请生成一份结构化摘要，作为后续对话的上下文。必须保留：' +
  '1) 用户的总体目标与当前意图；2) 已作出的关键决策与结论；' +
  '3) 重要的数据、数值、文件绝对路径、关键代码片段（保留关键几行，不要全文）；' +
  '4) 已创建/修改/删除的文件及其作用；5) 待办事项与未决问题；' +
  '6) 当前进度状态（已完成/进行中/卡住）。' +
  '删除寒暄、重复与冗余。用中文分条列出，长度控制在原文的 20% 以内。';

/**
 * 将待归档消息按 token 估算切块，保证单块不超过 maxTokens（R3.2）。
 * 纯函数，便于单测。
 */
export function splitIntoChunks(
  messages: Message[],
  maxTokens = COMPRESS_CHUNK_TOKENS,
): Message[][] {
  const chunks: Message[][] = [];
  let current: Message[] = [];
  let currentTokens = 0;
  for (const m of messages) {
    const t = estimateTokens(m.content || '');
    if (current.length > 0 && currentTokens + t > maxTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(m);
    currentTokens += t;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * 用 LLM 对归档消息做分级摘要（R3.2）。多块时逐块摘要后再合并为一份。
 * 返回空串表示未产出有效摘要（调用方应回退朴素摘要），不会抛错。
 */
async function summarizeConversation(messages: Message[]): Promise<string> {
  const cfg = loadConfig();
  // 显式关闭时直接不调 LLM，回退朴素摘要（离线 / 省成本场景）
  if (cfg.chat?.compressionSummary === false) return '';

  const chunks = splitIntoChunks(messages);
  const parts: string[] = [];
  for (const chunk of chunks) {
    const transcript = chunk.map((m) => `【${m.role}】\n${m.content}`).join('\n\n');
    const text = await chatText(
      [
        { role: 'system', content: COMPRESS_SUMMARY_SYSTEM },
        { role: 'user', content: transcript },
      ],
      { maxTokens: 1024, temperature: 0.2 },
    );
    if (text) parts.push(text);
  }
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];

  // 多块：合并为一份连贯去重的摘要
  const merged = await chatText(
    [
      {
        role: 'system',
        content: '将以下多段对话摘要合并为一份连贯、去重的结构化摘要，保留全部关键信息点。',
      },
      { role: 'user', content: parts.join('\n\n---\n\n') },
    ],
    { maxTokens: 1200, temperature: 0.2 },
  );
  return merged || parts.join('\n\n');
}

/**
 * 朴素摘要（回退路径）：仅枚举工具名与最近几条用户请求。
 * 作为 LLM 摘要失败时的兜底，保证压缩不丢「上下文摘要」占位。
 */
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

/**
 * 压缩对话历史（R3.2 智能压缩）。
 * 仅对「真正被丢弃的旧内容」(toArchive) 做 LLM 分级摘要并注入为 [上下文摘要]，
 * 近期 KEEP_RECENT_TURNS 条消息原样保留。LLM 摘要失败则回退朴素摘要。
 *
 * @param summarizer 可选注入的摘要器（测试用）；缺省走 summarizeConversation（真实 LLM）。
 */
/**
 * 把压缩切点对齐到完整的工具调用边界。
 *
 * 保留区的第一条消息若是 role='tool'，说明发起它的 assistant(tool_calls) 已被
 * 归档，该 tool 消息就成了带着悬空 tool_call_id 的孤儿，会让 API 直接 400。
 *
 * 优先向后推进切点（多归档几条，压缩效果不打折）；若向后会把保留区清空，
 * 则改为向前回退，宁可少压一点也不能产生孤儿消息。
 *
 * @param messages 已剔除 system 的消息序列
 * @param desiredCut 期望切点（该索引及之后的消息保留）
 * @returns 对齐后的安全切点
 */
function alignCutToToolBoundary(messages: Message[], desiredCut: number): number {
  const clamped = Math.max(0, Math.min(desiredCut, messages.length));
  if (clamped >= messages.length) return clamped;
  if (messages[clamped]?.role !== 'tool') return clamped;

  // 向后找第一个非 tool 消息
  let forward = clamped;
  while (forward < messages.length && messages[forward].role === 'tool') forward++;
  if (forward < messages.length) return forward;

  // 尾部全是 tool 消息：向前回退到第一个非 tool 消息
  let backward = clamped;
  while (backward > 0 && messages[backward].role === 'tool') backward--;
  return backward;
}

async function compressHistory(summarizer?: (m: Message[]) => Promise<string>): Promise<void> {
  const nonSystemMessages = conversationHistory.filter((m) => m.role !== 'system');

  if (nonSystemMessages.length <= KEEP_RECENT_TURNS) {
    return;
  }

  // 切点必须对齐到完整的工具调用边界：assistant(tool_calls) 与其后续 role='tool'
  // 结果消息是不可分割的整体。若从中间切断，保留下来的孤儿 tool 消息会带着
  // tool_call_id 原样回传给 API，OpenAI 兼容端直接返回 400，且此后每轮都失败，
  // 该会话再也无法恢复。
  const cutIndex = alignCutToToolBoundary(
    nonSystemMessages,
    nonSystemMessages.length - KEEP_RECENT_TURNS,
  );

  const toArchive = nonSystemMessages.slice(0, cutIndex);
  if (toArchive.length > 0) {
    archiveCurrentSession();
  }

  const recentMessages = nonSystemMessages.slice(cutIndex);

  // 对将被丢弃的旧内容做摘要；失败/为空则回退朴素摘要
  let summary = '';
  try {
    summary =
      (summarizer ? await summarizer(toArchive) : await summarizeConversation(toArchive)) || '';
  } catch (e) {
    console.error(`[压缩] LLM 摘要失败，回退朴素摘要: ${(e as Error).message}`);
  }
  if (!summary) summary = generateSummary(toArchive);

  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `[上下文摘要] ${summary}` },
    ...recentMessages,
  ];

  turnCount = recentMessages.length;
  if (currentSessionId) {
    saveSession(currentSessionId, conversationHistory);
  }
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

// =============================================================
// 会话笔记（R3.6）：结构化长期记忆，独立于对话历史持久化
// =============================================================

const NOTES_DIR = path.join(SESSIONS_DIR, 'notes');

function ensureNotesDir(): void {
  if (!existsSync(NOTES_DIR)) {
    mkdirSync(NOTES_DIR, { recursive: true });
  }
}

function noteFile(id: string): string {
  return path.join(NOTES_DIR, `${id}.json`);
}

function loadNotes(): SessionNote[] {
  ensureNotesDir();
  const notes: SessionNote[] = [];
  try {
    for (const file of readdirSync(NOTES_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const note = JSON.parse(readFileSync(path.join(NOTES_DIR, file), 'utf-8')) as SessionNote;
        if (note && note.id) notes.push(note);
      } catch {
        // 跳过损坏笔记
      }
    }
  } catch {
    // 目录不存在时忽略
  }
  return notes.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function saveSessionNote(note: { title: string; body: string; tags?: string[] }): SessionNote {
  ensureNotesDir();
  const now = new Date().toISOString();
  const existing = loadNotes().find(
    (n) => n.title.toLowerCase() === note.title.trim().toLowerCase(),
  );
  const saved: SessionNote = existing
    ? { ...existing, body: note.body, tags: note.tags || existing.tags, updatedAt: now }
    : {
        id: 'note_' + Date.now().toString(36) + crypto.randomUUID().split('-')[0],
        title: note.title,
        body: note.body,
        tags: note.tags || [],
        createdAt: now,
        updatedAt: now,
      };
  writeFileSync(noteFile(saved.id), JSON.stringify(saved, null, 2), 'utf-8');
  return saved;
}

function listSessionNotes(): SessionNote[] {
  return loadNotes();
}

function getSessionNote(id: string): SessionNote | null {
  const file = noteFile(id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as SessionNote;
  } catch {
    return null;
  }
}

function deleteSessionNote(id: string): boolean {
  const file = noteFile(id);
  if (!existsSync(file)) return false;
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

// =============================================================
// 上下文分区 / JIT 标记（R3.5 / R3.7）
// =============================================================

/**
 * JIT（Just-In-Time）上下文注入：把检索到的记忆/信息以标记消息注入历史，
 * 无需用户输入，下一轮思考即可感知。内容与对话历史一起持久化。
 */
function addContextMarker(content: string): void {
  if (!currentSessionId) {
    createNewSession();
  }
  const marker = `[上下文补充] ${content}`;
  conversationHistory.push({ role: 'user', content: marker });
  saveSession(currentSessionId!, conversationHistory);
}

// --------------------------------------------------------------
// R3.9 会话中途系统消息
// --------------------------------------------------------------
/**
 * 在任意轮次后追加一条 `role: "system"` 消息，动态调整 prompt
 * （如按工具执行结果注入新约束）。多条 system 消息由兼容 OpenAI 的 API
 * 顺序拼接，最新约束排在最后生效。
 */
function addSystemMessage(content: string): void {
  if (!currentSessionId) {
    createNewSession();
  }
  conversationHistory.push({ role: 'system', content });
  saveSession(currentSessionId!, conversationHistory);
}

/** 取出历史中所有中途追加的 system 消息（首条固定系统提示之外）。 */
function getMidTurnSystemMessages(): Message[] {
  return conversationHistory.filter((m, i) => m.role === 'system' && i > 0);
}

// --------------------------------------------------------------
// R3.5 运行时按需工具数据加载（JIT 深化）
// --------------------------------------------------------------
/**
 * 工具在运行时请求按需加载数据：把大体积结果存入 JIT 数据存储并注入
 * 轻量标记（不展开正文），需要完整数据时再按 id 取回。
 */
const jitDataStore = new Map<string, unknown>();
let jitDataSeq = 0;

/**
 * 把一个工具返回的大体积数据暂存在 JIT 存储，并注入一个「按需取回」标记。
 * 返回数据 id；模型后续用 getJitData(id) 取回完整内容。
 */
function stashJitToolData(toolName: string, data: unknown, summary?: string): string {
  const id = `jit_${Date.now().toString(36)}_${++jitDataSeq}_${toolName}`;
  jitDataStore.set(id, data);
  addContextMarker(
    `[JIT] ${toolName} 的完整结果已缓存（id: ${id}）${summary ? `——${summary}` : ''}；需要时用 getJitData 按需取回`,
  );
  return id;
}

/** 按 id 取回 JIT 缓存数据（不存在返回 null）。 */
function getJitToolData(id: string): unknown {
  return jitDataStore.has(id) ? jitDataStore.get(id) : null;
}

/** 当前 JIT 缓存条目数（测试用）。 */
function getJitDataCount(): number {
  return jitDataStore.size;
}

/** 清空 JIT 缓存（测试用）。 */
function clearJitData(): void {
  jitDataStore.clear();
  jitDataSeq = 0;
}

/**
 * 上下文分区（R3.7）：把会话划分为 system / workingMemory / dialogue 三段。
 * workingMemory 包含摘要、JIT 标记、工具结果等支撑信息；dialogue 为纯对话。
 * 供按分区剪裁上下文长度或做层级压缩。
 */
function getPartitionedMessages(): {
  system: Message[];
  workingMemory: Message[];
  dialogue: Message[];
} {
  const system: Message[] = [];
  const workingMemory: Message[] = [];
  const dialogue: Message[] = [];
  for (const msg of conversationHistory) {
    if (msg.role === 'system') {
      system.push(msg);
    } else if (
      msg.role === 'tool' ||
      (msg.role === 'user' &&
        (msg.content.startsWith('[上下文摘要]') ||
          msg.content.startsWith('[上下文补充]') ||
          msg.content.startsWith('[系统返回的工具执行结果]')))
    ) {
      workingMemory.push(msg);
    } else {
      dialogue.push(msg);
    }
  }
  return { system, workingMemory, dialogue };
}

/**
 * R3.7 每区独立摘要：为 system / workingMemory / dialogue 三个分区分别生成
 * 紧凑摘要，供「重摘要 workingMemory 而保留对话」的分层压缩策略使用。
 * 断言词：摘要仅统计内容，逐区去重；既不丢失其它区数据，也不合并。
 */
async function summarizePartitions(
  summarizer?: (
    messages: Message[],
    partition: 'system' | 'workingMemory' | 'dialogue',
  ) => Promise<string>,
): Promise<{
  system: string;
  workingMemory: string;
  dialogue: string;
}> {
  const { system, workingMemory, dialogue } = getPartitionedMessages();
  const fallback = (msgs: Message[]): string => {
    const texts = msgs
      .map((m) => m.content)
      .filter(Boolean)
      .slice(-8);
    if (texts.length === 0) return '';
    const line = texts.join(' | ');
    return line.length > 500 ? `${line.slice(0, 500)}…` : line;
  };
  const invoke = (
    partition: 'system' | 'workingMemory' | 'dialogue',
    msgs: Message[],
  ): Promise<string> => {
    try {
      if (summarizer) {
        const resolved = summarizer(msgs, partition);
        return Promise.resolve(resolved).then((s) => s || fallback(msgs));
      }
    } catch {
      /* 摘要器异常时回退朴素摘要 */
    }
    return Promise.resolve(fallback(msgs));
  };
  const [systemSummary, wmSummary, dialogueSummary] = await Promise.all([
    invoke('system', system),
    invoke('workingMemory', workingMemory),
    invoke('dialogue', dialogue),
  ]);
  return { system: systemSummary, workingMemory: wmSummary, dialogue: dialogueSummary };
}

/** R3.7 各分区 token 统计，供触发分区级压缩。 */
function getPartitionStats(): {
  system: { count: number; tokens: number };
  workingMemory: { count: number; tokens: number };
  dialogue: { count: number; tokens: number };
  total: number;
} {
  const { system, workingMemory, dialogue } = getPartitionedMessages();
  const tokens = (msgs: Message[]) =>
    msgs.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);
  const s = { count: system.length, tokens: tokens(system) };
  const w = { count: workingMemory.length, tokens: tokens(workingMemory) };
  const d = { count: dialogue.length, tokens: tokens(dialogue) };
  return { system: s, workingMemory: w, dialogue: d, total: s.tokens + w.tokens + d.tokens };
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
  addAssistantNativeMessage,
  addToolResultMessage,
  saveSessionAsync,
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
  saveSessionNote,
  listSessionNotes,
  getSessionNote,
  deleteSessionNote,
  addContextMarker,
  addSystemMessage,
  getMidTurnSystemMessages,
  stashJitToolData,
  getJitToolData,
  getJitDataCount,
  clearJitData,
  getPartitionedMessages,
  summarizePartitions,
  getPartitionStats,
};
