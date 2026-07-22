import {
  createNewSession,
  listSessions,
  switchSession,
  deleteSession,
  renameSession,
  initializeSession,
  getCurrentSession,
  getMessages,
} from '../../src/agent/session.ts';

describe('session.ts', () => {
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
  });

  describe('listSessions', () => {
    it('should return sessions array', () => {
      const sessions = listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });
  });

  describe('switchSession', () => {
    it('should return error for non-existent session', () => {
      const result = switchSession('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('会话不存在');
    });
  });

  describe('deleteSession', () => {
    it('should return error for non-existent session', () => {
      const result = deleteSession('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('会话不存在');
    });
  });

  describe('renameSession', () => {
    it('should return error for non-existent session', () => {
      const result = renameSession('non-existent', 'New Name');
      expect(result.success).toBe(false);
      expect(result.error).toBe('会话不存在');
    });
  });

  describe('initializeSession', () => {
    it('should initialize without sessionId', () => {
      const result = initializeSession();
      expect(result).toBe(true);
    });
  });

  describe('getCurrentSession', () => {
    it('should return session or null', () => {
      const session = getCurrentSession();
      expect(session === null || typeof session === 'object').toBe(true);
    });
  });

  describe('getMessages', () => {
    it('should return messages array', () => {
      const messages = getMessages();
      expect(Array.isArray(messages)).toBe(true);
    });
  });
});
