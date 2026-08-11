import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_DIR = path.join(os.tmpdir(), `cogito-session-notes-${Date.now()}`);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;

const {
  initializeSession,
  createNewSession,
  getMessages,
  addUserMessage,
  addAssistantNativeMessage,
  addToolResultMessage,
  saveSessionNote,
  listSessionNotes,
  getSessionNote,
  deleteSessionNote,
  addContextMarker,
  getPartitionedMessages,
  addSystemMessage,
  getMidTurnSystemMessages,
  stashJitToolData,
  getJitToolData,
  getJitDataCount,
  clearJitData,
  summarizePartitions,
  getPartitionStats,
  updateSystemPrompt,
  setConversationHistory,
  flushSessionWrites,
} = await import('../../src/agent/session.ts');

/**
 * session.ts 的 add* 系列是 fire-and-forget 异步写入（saveSessionAsync）。
 * flushSessionWrites() 只保证写队列 settle，Windows 上底层文件句柄可能稍后才释放，
 * 此时 rmSync 会抛 EPERM。测试清理必须「先 flush，再带退避重试删除」，
 * 否则在全量串行运行（机器更繁忙）时会随机失败——单跑却能通过，极具迷惑性。
 */
async function flushAndRemove(target: string, attempts = 8): Promise<void> {
  try {
    await flushSessionWrites?.();
  } catch {
    /* 忽略 flush 异常，继续清理 */
  }
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i === attempts - 1) {
        throw new Error(`无法删除测试临时目录 ${target}: ${(e as Error).message}`, { cause: e });
      }
      // 退避等待，给操作系统释放文件句柄的时间
      await new Promise((resolve) => setTimeout(resolve, 50 * (i + 1)));
    }
  }
}

describe('session.ts notes / markers / partitioning (R3)', () => {
  beforeEach(async () => {
    const dataDir = path.join(TMP_DIR, 'data');
    await flushAndRemove(dataDir);
    fs.mkdirSync(dataDir, { recursive: true });
    initializeSession();
  });

  afterAll(async () => {
    await flushAndRemove(TMP_DIR);
  });

  describe('session notes (R3.6)', () => {
    it('should create a note and persist it', () => {
      const note = saveSessionNote({ title: 'Todo', body: 'Finish MCP', tags: ['mcp'] });
      expect(note.id).toMatch(/^note_/);
      expect(note.createdAt).toBeDefined();
      expect(note.updatedAt).toBeDefined();
      expect(getSessionNote(note.id)).toEqual(note);
    });

    it('should update an existing note by title', () => {
      saveSessionNote({ title: 'Idea', body: 'v1' });
      const updated = saveSessionNote({ title: 'idea', body: 'v2', tags: ['x'] });
      const all = listSessionNotes();
      expect(all).toHaveLength(1);
      expect(updated.body).toBe('v2');
      expect(all[0].updatedAt).toBeDefined();
    });

    it('should list and delete notes', () => {
      saveSessionNote({ title: 'A', body: 'a' });
      saveSessionNote({ title: 'B', body: 'b' });
      expect(listSessionNotes()).toHaveLength(2);
      const id = listSessionNotes()[0].id;
      expect(deleteSessionNote(id)).toBe(true);
      expect(deleteSessionNote(id)).toBe(false);
      expect(listSessionNotes()).toHaveLength(1);
    });

    it('should return null for missing note', () => {
      expect(getSessionNote('note_missing')).toBeNull();
    });
  });

  describe('context markers & partitioning (R3.5/3.7)', () => {
    it('should push a context marker into history', () => {
      createNewSession();
      addUserMessage('hello');
      addContextMarker('记忆：用户喜欢 TypeScript');
      const messages = getMessages();
      const marker = messages.find((m) => m.content.includes('上下文补充'));
      expect(marker).toBeDefined();
    });

    it('should partition messages into workingMemory and dialogue', () => {
      createNewSession();
      updateSystemPrompt('sys');
      addUserMessage('hi');
      addAssistantNativeMessage('ok', { budget: { planningIterations: 1 } } as never);
      addToolResultMessage('ls', 'result');
      addContextMarker('jwt info');

      const { system, workingMemory, dialogue } = getPartitionedMessages();
      expect(system).toBeDefined();
      // 摘要类 / JIT / 工具结果进 workingMemory，对话进 dialogue
      const all = getMessages();
      expect(workingMemory.length + dialogue.length + system.length).toBe(all.length);
      expect(workingMemory.some((m) => m.content.includes('上下文补充'))).toBe(true);
      expect(dialogue.some((m) => m.content === 'hi')).toBe(true);
    });

    it('native messages and tool results use correct roles', () => {
      createNewSession();
      addAssistantNativeMessage('native reply', { id: 'call_1' } as never);
      addToolResultMessage('file content', { toolCallId: 'call_1' });
      const msgs = getMessages();
      expect(msgs.find((m) => m.content === 'native reply')?.role).toBe('assistant');
      expect(msgs.find((m) => m.role === 'tool')).toBeDefined();
    });
  });

  describe('setConversationHistory', () => {
    it('should replace history with native-shaped messages', () => {
      createNewSession();
      setConversationHistory([
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'tool', toolName: 'ls', content: 'out' },
      ]);
      const nonSystem = getMessages().filter((m) => m.role !== 'system');
      expect(nonSystem).toHaveLength(3);
      expect(nonSystem[2].role).toBe('tool');
      expect(nonSystem[2].toolName).toBe('ls');
    });
  });

  describe('mid-turn system messages (R3.9)', () => {
    it('should append system messages after user turns', () => {
      createNewSession();
      updateSystemPrompt('sys');
      addUserMessage('hi');
      addSystemMessage('从现在起，请遵守新约束 X');
      addUserMessage('继续');
      const msgs = getMessages();
      const systemAdded = msgs.filter((m) => m.role === 'system');
      expect(systemAdded).toHaveLength(2);
      expect(systemAdded[1].content).toContain('新约束');
      const mid = getMidTurnSystemMessages();
      expect(mid).toHaveLength(1);
      expect(mid[0].content).toContain('新约束');
    });

    it('should keep mid-turn system messages out of turn count', () => {
      createNewSession();
      addUserMessage('a');
      addSystemMessage('约束');
      addUserMessage('b');
      const userTurns = getMessages().filter((m) => m.role === 'user');
      expect(userTurns).toHaveLength(2);
    });
  });

  describe('JIT on-demand tool data (R3.5)', () => {
    beforeEach(() => clearJitData());

    it('should stash large tool data by id and fetch later', () => {
      createNewSession();
      const big = 'LONG_CONTENT_'.repeat(1000);
      const id = stashJitToolData('readFile', big, '文件内容已缓存');
      expect(id).toMatch(/^jit_/);
      const msgs = getMessages();
      expect(msgs.some((m) => m.content.includes('[JIT]') && m.content.includes(id))).toBe(true);
      expect(getJitToolData(id)).toBe(big);
      expect(getJitToolData('jit_missing')).toBeNull();
      expect(getJitDataCount()).toBe(1);
    });

    it('should clear all JIT data', () => {
      stashJitToolData('ls', 'out');
      expect(getJitDataCount()).toBe(1);
      clearJitData();
      expect(getJitDataCount()).toBe(0);
    });
  });

  describe('partition summarization & stats (R3.7)', () => {
    it('should summarize each partition independently', async () => {
      createNewSession();
      updateSystemPrompt('sys');
      addUserMessage('问题：1+1');
      addAssistantNativeMessage('答 2', { budget: { planningIterations: 1 } } as never);
      addToolResultMessage('result', { toolCallId: 'call_1' });
      addContextMarker('jwt info');
      const result = await summarizePartitions();
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('workingMemory');
      expect(result).toHaveProperty('dialogue');
      // 摘要逐区独立不为空
      expect(result.workingMemory).toContain('上下文补充');
      expect(result.dialogue).toContain('问题：1+1');
    });

    it('should allow injecting a summarizer per partition', async () => {
      createNewSession();
      addUserMessage('hello');
      const result = await summarizePartitions(async (_msgs, partition) => `S-${partition}`);
      expect(result.system).toBe('S-system');
      expect(result.workingMemory).toBe('S-workingMemory');
      expect(result.dialogue).toBe('S-dialogue');
    });

    it('should compute partition token stats', () => {
      createNewSession();
      updateSystemPrompt('sys');
      addUserMessage('hi there');
      addUserMessage('how are you');
      const stats = getPartitionStats();
      expect(stats.system.count).toBeGreaterThan(0);
      expect(stats.dialogue.count).toBe(2);
      expect(stats.workingMemory.count).toBe(0);
      expect(stats.total).toBeGreaterThan(0);
    });
  });
});
