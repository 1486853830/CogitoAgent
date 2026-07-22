import {
  recordToolCall,
  recordSession,
  recordMessage,
  recordThinkingTime,
  recordTokenUsage,
  getToolStats,
  getSessionStats,
  getToolUsageByCategory,
  getTopUsedTools,
} from '../../src/agent/stats.ts';

describe('stats.ts', () => {
  describe('recordToolCall', () => {
    it('should record successful tool call', () => {
      recordToolCall('test-tool-1', 'file', true, 100);
      const stats = getToolStats();
      expect(stats.file.callCount).toBeGreaterThanOrEqual(1);
      expect(stats.file.successCount).toBeGreaterThanOrEqual(1);
    });

    it('should record failed tool call', () => {
      recordToolCall('test-tool-2', 'file', false, 50);
      const stats = getToolStats();
      expect(stats.file.failCount).toBeGreaterThanOrEqual(1);
    });

    it('should record tool-specific stats', () => {
      recordToolCall('ls-test', 'file', true, 20);
      const stats = getToolStats();
      expect(stats.file.tools['ls-test']).toBeDefined();
    });

    it('should handle unknown category', () => {
      recordToolCall('unknown-tool', 'unknown', true, 10);
      const stats = getToolStats();
      expect(stats.unknown).toBeDefined();
    });
  });

  describe('recordSession', () => {
    it('should increment session counts', () => {
      const before = getSessionStats().totalSessions;
      recordSession();
      const after = getSessionStats().totalSessions;
      expect(after).toBe(before + 1);
    });
  });

  describe('recordMessage', () => {
    it('should increment message counts', () => {
      const before = getSessionStats().totalMessages;
      recordMessage();
      const after = getSessionStats().totalMessages;
      expect(after).toBe(before + 1);
    });
  });

  describe('recordThinkingTime', () => {
    it('should accumulate thinking time', () => {
      const before = getSessionStats().totalThinkingTime;
      recordThinkingTime(100);
      const after = getSessionStats().totalThinkingTime;
      expect(after).toBe(before + 100);
    });
  });

  describe('recordTokenUsage', () => {
    it('should record token usage', () => {
      const before = getSessionStats().totalTokens;
      recordTokenUsage(100, 50);
      const after = getSessionStats().totalTokens;
      expect(after).toBe(before + 150);
    });
  });

  describe('getToolUsageByCategory', () => {
    it('should return usage by category', () => {
      recordToolCall('ls-usage', 'file', true, 100);
      recordToolCall('read-usage', 'file', false, 50);
      const usage = getToolUsageByCategory();
      const fileUsage = usage.find((u) => u.category === 'file');
      expect(fileUsage).toBeDefined();
      expect(fileUsage?.callCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getTopUsedTools', () => {
    it('should return top used tools', () => {
      recordToolCall('top-ls', 'file', true, 100);
      recordToolCall('top-read', 'file', true, 50);
      const top = getTopUsedTools(10);
      expect(top.length).toBeGreaterThanOrEqual(2);
      const lsTool = top.find((t) => t.toolName === 'top-ls');
      expect(lsTool).toBeDefined();
    });
  });

  describe('getToolStats', () => {
    it('should return tool stats', () => {
      const stats = getToolStats();
      expect(typeof stats).toBe('object');
    });
  });

  describe('getSessionStats', () => {
    it('should return session stats', () => {
      const stats = getSessionStats();
      expect(typeof stats).toBe('object');
      expect(typeof stats.totalSessions).toBe('number');
    });
  });
});
