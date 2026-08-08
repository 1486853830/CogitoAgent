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
  updateSystemPrompt,
  setConversationHistory,
} = await import('../../src/agent/session.ts');

describe('session.ts notes / markers / partitioning (R3)', () => {
  beforeEach(() => {
    const dataDir = path.join(TMP_DIR, 'data');
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.mkdirSync(dataDir, { recursive: true });
    initializeSession();
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
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
});
