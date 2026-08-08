import fs from 'fs';
import path from 'path';
import os from 'os';

// Set COGITO_USER_DATA_DIR to a temp directory before importing the session module,
// so tests use isolated storage rather than the real data directory.
// Use a dynamic import so the env var is set before the module is evaluated
// (static imports are hoisted in ESM and would run before the assignment).
const TMP_DIR = path.join(os.tmpdir(), `cogito-session-test-${Date.now()}`);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;

const SESSIONS_DIR = path.join(TMP_DIR, 'data', 'sessions');
const META_FILE = path.join(SESSIONS_DIR, 'meta.json');

const {
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
  splitIntoChunks,
  getHistoryLength,
  resetConversation,
  updateSystemPrompt,
  setConversationHistory,
  estimateTokens,
  getContextTokenEstimate,
  isApproachingLimit,
  getCompressionAdvice,
} = await import('../../src/agent/session.ts');

function readMeta(): { sessions: any[]; activeId: string | null } {
  if (!fs.existsSync(META_FILE)) return { sessions: [], activeId: null };
  return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
}

function writeMeta(meta: { sessions: any[]; activeId: string | null }): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

describe('session.ts', () => {
  // Clear the temp directory before each test to isolate state where possible.
  beforeEach(() => {
    fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  describe('createNewSession', () => {
    it('should create a new session', () => {
      const session = createNewSession('Test Session');
      expect(session).toBeDefined();
      expect(session.name).toBe('Test Session');
      expect(session.id).toMatch(/^sess_/);
    });

    it('should generate default name if not provided', () => {
      const session = createNewSession();
      expect(session.name).toMatch(/^会话 \d+$/);
    });

    it('should persist the new session to meta file', () => {
      const session = createNewSession('Persisted Session');
      const meta = readMeta();
      const found = meta.sessions.find((s) => s.id === session.id);
      expect(found).toBeDefined();
      expect(found.name).toBe('Persisted Session');
      expect(meta.activeId).toBe(session.id);
    });

    it('should save session message file on disk', () => {
      const session = createNewSession('File Session');
      const file = path.join(SESSIONS_DIR, `${session.id}.json`);
      expect(fs.existsSync(file)).toBe(true);
      const messages = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(Array.isArray(messages)).toBe(true);
      expect(messages[0].role).toBe('system');
    });

    it('should archive the current session when creating a new one', () => {
      const first = createNewSession('First');
      addUserMessage('hello');
      addAssistantMessage('hi there');
      // Creating a second session should archive the first
      const second = createNewSession('Second');
      expect(second.id).not.toBe(first.id);
      const archiveFile = path.join(SESSIONS_DIR, `${first.id}_archive.json`);
      expect(fs.existsSync(archiveFile)).toBe(true);
    });
  });

  describe('listSessions', () => {
    it('should return sessions array', () => {
      createNewSession('List Test');
      const sessions = listSessions();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
    });

    it('should mark the current session as active', () => {
      createNewSession('Active One');
      const sessions = listSessions();
      const active = sessions.find((s) => s.isActive === true);
      expect(active).toBeDefined();
    });

    it('should include id, name, createdAt and lastActiveAt fields', () => {
      createNewSession('Fields Test');
      const sessions = listSessions();
      const s = sessions[0];
      expect(s.id).toMatch(/^sess_/);
      expect(typeof s.name).toBe('string');
      expect(typeof s.createdAt).toBe('string');
      expect(typeof s.lastActiveAt).toBe('string');
    });

    it('should recover sessions from disk when meta is empty', () => {
      const session = createNewSession('Recover Me');
      // Clear meta so listSessions triggers recovery from disk
      writeMeta({ sessions: [], activeId: null });
      const sessions = listSessions();
      const ids = sessions.map((s) => s.id);
      expect(ids).toContain(session.id);
    });
  });

  describe('switchSession', () => {
    it('should return error for non-existent session', () => {
      createNewSession('Switch Base');
      const result = switchSession('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('会话不存在');
    });

    it('should switch to an existing session', () => {
      const first = createNewSession('First');
      const second = createNewSession('Second');
      // Switch back to the first session
      const result = switchSession(first.id);
      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.id).toBe(first.id);
    });

    it('should update activeId in meta after switch', () => {
      const first = createNewSession('A');
      createNewSession('B');
      switchSession(first.id);
      const meta = readMeta();
      expect(meta.activeId).toBe(first.id);
    });
  });

  describe('deleteSession', () => {
    it('should return error for non-existent session', () => {
      createNewSession('Delete Base');
      const result = deleteSession('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('会话不存在');
    });

    it('should delete an existing non-current session', () => {
      const first = createNewSession('Keep');
      const second = createNewSession('Remove');
      const result = deleteSession(second.id);
      expect(result.success).toBe(true);
      const meta = readMeta();
      const ids = meta.sessions.map((s) => s.id);
      expect(ids).toContain(first.id);
      expect(ids).not.toContain(second.id);
    });

    it('should refuse to delete the last remaining session', () => {
      const only = createNewSession('Only One');
      const result = deleteSession(only.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe('至少保留一个会话');
    });

    it('should switch to another session when deleting the current one', () => {
      const first = createNewSession('First');
      const second = createNewSession('Second');
      // second is now the current session; deleting it should switch to first
      const result = deleteSession(second.id);
      expect(result.success).toBe(true);
      const current = getCurrentSession();
      expect(current?.id).toBe(first.id);
    });

    it('should remove the session file from disk', () => {
      const first = createNewSession('Keep');
      const second = createNewSession('Remove');
      const file = path.join(SESSIONS_DIR, `${second.id}.json`);
      expect(fs.existsSync(file)).toBe(true);
      deleteSession(second.id);
      expect(fs.existsSync(file)).toBe(false);
    });
  });

  describe('renameSession', () => {
    it('should return error for non-existent session', () => {
      createNewSession('Rename Base');
      const result = renameSession('non-existent', 'New Name');
      expect(result.success).toBe(false);
      expect(result.error).toBe('会话不存在');
    });

    it('should rename an existing session', () => {
      const session = createNewSession('Old Name');
      const result = renameSession(session.id, 'New Name');
      expect(result.success).toBe(true);
      expect(result.session?.name).toBe('New Name');
      const meta = readMeta();
      const found = meta.sessions.find((s) => s.id === session.id);
      expect(found.name).toBe('New Name');
    });
  });

  describe('initializeSession', () => {
    it('should initialize without sessionId', () => {
      const result = initializeSession();
      expect(result).toBe(true);
    });

    it('should create a new session when none exists', () => {
      const result = initializeSession();
      expect(result).toBe(true);
      // initializeSession sets up the conversation history with a system prompt
      const messages = getMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('system');
    });

    it('should return false for non-existent sessionId', () => {
      const result = initializeSession('sess_does_not_exist');
      expect(result).toBe(false);
    });

    it('should initialize with an existing sessionId', () => {
      const session = createNewSession('Init Target');
      const result = initializeSession(session.id);
      expect(result).toBe(true);
      const current = getCurrentSession();
      expect(current?.id).toBe(session.id);
    });

    it('should load existing messages when initializing', () => {
      const session = createNewSession('With Messages');
      addUserMessage('hello world');
      // Re-initialize to reload from disk
      const result = initializeSession(session.id);
      expect(result).toBe(true);
      const messages = getMessages();
      expect(messages.some((m) => m.role === 'user' && m.content === 'hello world')).toBe(true);
    });
  });

  describe('getCurrentSession', () => {
    it('should return session or null', () => {
      createNewSession('Current Test');
      const session = getCurrentSession();
      expect(session === null || typeof session === 'object').toBe(true);
    });

    it('should return the active session after creation', () => {
      const created = createNewSession('Active Session');
      const current = getCurrentSession();
      expect(current?.id).toBe(created.id);
    });
  });

  describe('getMessages', () => {
    it('should return messages array', () => {
      createNewSession('Messages Test');
      const messages = getMessages();
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should include the system prompt as first message', () => {
      createNewSession('System Prompt Test');
      const messages = getMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('system');
    });

    it('should reflect added user messages', () => {
      createNewSession('Add Test');
      addUserMessage('test message');
      const messages = getMessages();
      const userMsgs = messages.filter((m) => m.role === 'user');
      expect(userMsgs.some((m) => m.content === 'test message')).toBe(true);
    });
  });

  describe('addUserMessage', () => {
    it('should add a user message to history', () => {
      createNewSession('UserMsg');
      const before = getMessages().length;
      addUserMessage('user input');
      const after = getMessages().length;
      expect(after).toBe(before + 1);
    });

    it('should persist the message to the session file', () => {
      const session = createNewSession('Persist UserMsg');
      addUserMessage('persisted user input');
      const file = path.join(SESSIONS_DIR, `${session.id}.json`);
      const messages = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(messages.some((m) => m.role === 'user' && m.content === 'persisted user input')).toBe(
        true,
      );
    });
  });

  describe('addAssistantMessage', () => {
    it('should add an assistant message to history', () => {
      createNewSession('AssistantMsg');
      const before = getMessages().length;
      addAssistantMessage('assistant reply');
      const after = getMessages().length;
      expect(after).toBe(before + 1);
      const messages = getMessages();
      expect(messages.some((m) => m.role === 'assistant' && m.content === 'assistant reply')).toBe(
        true,
      );
    });
  });

  describe('addToolResultMessage', () => {
    it('should add a tool result message to history as user role', () => {
      createNewSession('ToolMsg');
      addToolResultMessage('[系统返回的工具执行结果] done');
      const messages = getMessages();
      expect(messages.some((m) => m.content === '[系统返回的工具执行结果] done')).toBe(true);
    });
  });

  describe('getOrCreateWechatSession', () => {
    it('should create a wechat session if none exists', () => {
      const id = getOrCreateWechatSession();
      expect(id).toMatch(/^sess_/);
      const meta = readMeta();
      const wechat = meta.sessions.find((s) => s.name === '微信通道');
      expect(wechat).toBeDefined();
      expect(wechat.id).toBe(id);
    });

    it('should return the existing wechat session id on subsequent calls', () => {
      const first = getOrCreateWechatSession();
      const second = getOrCreateWechatSession();
      expect(second).toBe(first);
    });
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for ascii text (ceil(length/4))', () => {
      const text = 'abcdefgh'; // 8 ascii chars => ceil(8/4) = 2
      expect(estimateTokens(text)).toBe(2);
    });

    it('should estimate tokens for chinese text (ceil(count/1.5))', () => {
      // 8 chinese chars => ceil(8/1.5) = ceil(5.33) = 6
      const text = '你好世界你好世界';
      expect(estimateTokens(text)).toBe(6);
    });

    it('should combine chinese and ascii estimates', () => {
      // 2 chinese (ceil(2/1.5)=2) + 2 ascii (ceil(2/4)=1) = 3
      const text = '你好ab';
      expect(estimateTokens(text)).toBe(3);
    });
  });

  describe('getContextTokenEstimate', () => {
    it('should return a non-negative number', () => {
      createNewSession('Token Estimate');
      expect(getContextTokenEstimate()).toBeGreaterThanOrEqual(0);
    });

    it('should increase when messages are added', () => {
      createNewSession('Token Increase');
      const before = getContextTokenEstimate();
      addUserMessage('a'.repeat(1000));
      const after = getContextTokenEstimate();
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('shouldCompress', () => {
    it('should return false for a fresh session', () => {
      createNewSession('Fresh');
      expect(shouldCompress()).toBe(false);
    });
  });

  describe('isApproachingLimit', () => {
    it('should return false for a small context', () => {
      createNewSession('Small Context');
      expect(isApproachingLimit()).toBe(false);
    });

    it('should return true when token estimate is in warning range', () => {
      createNewSession('Big Context');
      // Build a message large enough to cross WARN_TOKEN_THRESHOLD (80000)
      // ascii chars: 80000 tokens => ~320000 chars
      const big = 'a'.repeat(320000);
      setConversationHistory([{ role: 'user', content: big }]);
      expect(isApproachingLimit()).toBe(true);
    });

    it('should return false when token estimate exceeds max', () => {
      createNewSession('Huge Context');
      // ascii chars: 100000+ tokens => ~400000+ chars
      const huge = 'a'.repeat(400000);
      setConversationHistory([{ role: 'user', content: huge }]);
      expect(isApproachingLimit()).toBe(false);
    });
  });

  describe('getCompressionAdvice', () => {
    it('should return ok level for small context', () => {
      createNewSession('Advice Ok');
      const advice = getCompressionAdvice();
      expect(advice.level).toBe('ok');
      expect(typeof advice.usage).toBe('number');
      expect(typeof advice.message).toBe('string');
    });

    it('should return critical level when usage >= 100', () => {
      createNewSession('Advice Critical');
      const huge = 'a'.repeat(400000);
      setConversationHistory([{ role: 'user', content: huge }]);
      const advice = getCompressionAdvice();
      expect(advice.level).toBe('critical');
    });

    it('should return warning level when usage in [80, 100)', () => {
      createNewSession('Advice Warning');
      const big = 'a'.repeat(320000);
      setConversationHistory([{ role: 'user', content: big }]);
      const advice = getCompressionAdvice();
      expect(advice.level).toBe('warning');
    });
  });

  describe('compressHistory', () => {
    it('should not compress when there are few messages', async () => {
      createNewSession('Few Messages');
      addUserMessage('one');
      addAssistantMessage('two');
      const before = getMessages().length;
      await compressHistory();
      // Should not change since non-system messages <= KEEP_RECENT_TURNS
      const after = getMessages().length;
      expect(after).toBe(before);
    });

    it('should compress when there are more messages than KEEP_RECENT_TURNS', async () => {
      createNewSession('Many Messages');
      // Add more than KEEP_RECENT_TURNS (10) messages
      for (let i = 0; i < 15; i++) {
        addUserMessage(`user msg ${i}`);
        addAssistantMessage(`assistant msg ${i}`);
      }
      await compressHistory();
      const messages = getMessages();
      // After compression: system + summary + up to KEEP_RECENT_TURNS recent messages
      expect(messages[0].role).toBe('system');
      expect(messages.length).toBeLessThan(35);
    });

    it('should include a summary message after compression', async () => {
      createNewSession('Summary Test');
      for (let i = 0; i < 15; i++) {
        addUserMessage(`request ${i}`);
      }
      await compressHistory();
      const messages = getMessages();
      const summary = messages.find(
        (m) => m.role === 'user' && m.content.startsWith('[上下文摘要]'),
      );
      expect(summary).toBeDefined();
    });
  });

  describe('splitIntoChunks (R3.2)', () => {
    it('should keep each chunk under the token budget', () => {
      const msgs = Array.from({ length: 20 }, (_, i) => ({
        role: 'user' as const,
        content: `用户请求 ${i} `.repeat(50), // ~ 足够大以触发分块
      }));
      const chunks = splitIntoChunks(msgs, 200);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        const tokens = chunk.reduce((acc, m) => acc + estimateTokens(m.content), 0);
        expect(tokens).toBeLessThanOrEqual(200);
      }
    });

    it('should not split a single small message', () => {
      const msgs = [{ role: 'user' as const, content: 'short' }];
      const chunks = splitIntoChunks(msgs, 200);
      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(1);
    });
  });

  describe('compressHistory with summarizer injection (R3.2)', () => {
    it('should inject the LLM summary for archived (discarded) content', async () => {
      createNewSession('LLM Summary');
      for (let i = 0; i < 15; i++) {
        addUserMessage(`重要指示 ${i}`);
        addAssistantMessage(`回复 ${i}`);
      }
      // 注入一个返回富摘要的 summarizer，避免真实网络调用
      const rich = '【目标】完成数据迁移\n【决策】使用 PostgreSQL\n【待办】校验索引';
      await compressHistory(async () => rich);
      const messages = getMessages();
      const summary = messages.find(
        (m) => m.role === 'user' && m.content.startsWith('[上下文摘要]'),
      );
      expect(summary).toBeDefined();
      expect(summary!.content).toContain(rich);
      // 被丢弃的旧内容不应再以原文形式存在
      expect(messages.some((m) => m.content.includes('重要指示 0'))).toBe(false);
      // 近期 KEEP_RECENT_TURNS 条应保留
      expect(messages.some((m) => m.content.includes('重要指示 14'))).toBe(true);
    });

    it('should fall back to naive summary when summarizer throws', async () => {
      createNewSession('Fallback');
      for (let i = 0; i < 15; i++) {
        addUserMessage(`request ${i}`);
        addAssistantMessage(`[TOOL] search(${i})`);
      }
      await compressHistory(async () => {
        throw new Error('llm down');
      });
      const messages = getMessages();
      const summary = messages.find(
        (m) => m.role === 'user' && m.content.startsWith('[上下文摘要]'),
      );
      expect(summary).toBeDefined();
      // 朴素回退应保留工具名
      expect(summary!.content).toContain('search');
    });

    it('should fall back to naive summary when summarizer returns empty', async () => {
      createNewSession('EmptyFallback');
      for (let i = 0; i < 15; i++) {
        addUserMessage(`request ${i}`);
      }
      await compressHistory(async () => '');
      const messages = getMessages();
      const summary = messages.find(
        (m) => m.role === 'user' && m.content.startsWith('[上下文摘要]'),
      );
      expect(summary).toBeDefined();
      expect(summary!.content).toContain('request');
    });
  });

  describe('getHistoryLength', () => {
    it('should return total content length of all messages', () => {
      createNewSession('History Length');
      addUserMessage('hello');
      const length = getHistoryLength();
      expect(typeof length).toBe('number');
      expect(length).toBeGreaterThan(0);
    });

    it('should increase when a message is added', () => {
      createNewSession('History Increase');
      const before = getHistoryLength();
      addUserMessage('a meaningful message');
      const after = getHistoryLength();
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('resetConversation', () => {
    it('should reset history to a single system message', () => {
      createNewSession('Reset Test');
      addUserMessage('some content');
      addAssistantMessage('some reply');
      resetConversation();
      const messages = getMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('system');
    });
  });

  describe('updateSystemPrompt', () => {
    it('should keep a system message at index 0 after update', () => {
      createNewSession('Update Prompt');
      updateSystemPrompt();
      const messages = getMessages();
      expect(messages[0].role).toBe('system');
      expect(messages[0].content.length).toBeGreaterThan(0);
    });
  });

  describe('setConversationHistory', () => {
    it('should set history to system prompt plus provided messages', () => {
      createNewSession('Set History');
      const newMessages = [
        { role: 'user' as const, content: 'injected user' },
        { role: 'assistant' as const, content: 'injected assistant' },
      ];
      setConversationHistory(newMessages);
      const messages = getMessages();
      expect(messages[0].role).toBe('system');
      expect(messages.some((m) => m.content === 'injected user')).toBe(true);
      expect(messages.some((m) => m.content === 'injected assistant')).toBe(true);
    });

    it('should persist the new history to the session file', () => {
      const session = createNewSession('Persist History');
      setConversationHistory([{ role: 'user', content: 'persisted injected' }]);
      const file = path.join(SESSIONS_DIR, `${session.id}.json`);
      const messages = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(messages.some((m) => m.content === 'persisted injected')).toBe(true);
    });
  });
});
