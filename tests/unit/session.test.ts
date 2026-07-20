import {
  createNewSession,
  switchSession,
  listSessions,
  deleteSession,
  renameSession,
  initializeSession,
} from '../../src/agent/session.ts';

describe('Session Manager', () => {
  beforeEach(() => {
    process.env.COGITO_USER_DATA_DIR = process.env.TEMP || '/tmp';
  });

  it('should create a new session', () => {
    const session = createNewSession('测试会话');
    expect(session).toBeDefined();
    expect(session.name).toBe('测试会话');
    expect(session.id).toBeDefined();
    expect(session.createdAt).toBeDefined();
  });

  it('should create a new session with default name', () => {
    const session = createNewSession();
    expect(session).toBeDefined();
    expect(session.name).toMatch(/^会话 \d+/);
  });

  it('should list all sessions', () => {
    createNewSession('会话A');
    createNewSession('会话B');
    const sessions = listSessions();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it('should switch to existing session', () => {
    const session = createNewSession('切换测试会话');
    const result = switchSession(session.id);
    expect(result.success).toBe(true);
    expect(result.session?.id).toBe(session.id);
  });

  it('should return error when switching to non-existent session', () => {
    const result = switchSession('non_existent_id');
    expect(result.success).toBe(false);
    expect(result.error).toBe('会话不存在');
  });

  it('should rename a session', () => {
    const session = createNewSession('原名称');
    const result = renameSession(session.id, '新名称');
    expect(result.success).toBe(true);
    expect(result.session?.name).toBe('新名称');
  });

  it('should return error when renaming non-existent session', () => {
    const result = renameSession('non_existent_id', '新名称');
    expect(result.success).toBe(false);
    expect(result.error).toBe('会话不存在');
  });

  it('should delete a session', () => {
    const session = createNewSession('删除测试会话');
    const result = deleteSession(session.id);
    expect(result.success).toBe(true);
  });

  it('should return error when deleting non-existent session', () => {
    const result = deleteSession('non_existent_id');
    expect(result.success).toBe(false);
    expect(result.error).toBe('会话不存在');
  });

  it('should initialize a session', () => {
    const result = initializeSession();
    expect(result).toBe(true);
  });
});
