import {
  recordToolCall,
  recordSession,
  recordMessage,
  recordTokenUsage,
  getToolStats,
  getSessionStats,
  getToolUsageByCategory,
  getTopUsedTools,
  resetStats,
} from '../../src/agent/stats.ts';

describe('stats.ts', () => {
  beforeEach(() => {
    resetStats();
  });

  describe('recordToolCall', () => {
    it('should record successful tool call', () => {
      recordToolCall('test-tool-1', 'file', true, 100);
      const stats = getToolStats();
      expect(stats.file.callCount).toBe(1);
      expect(stats.file.successCount).toBe(1);
      expect(stats.file.failCount).toBe(0);
    });

    it('should record failed tool call', () => {
      recordToolCall('test-tool-2', 'file', false, 50);
      const stats = getToolStats();
      expect(stats.file.failCount).toBe(1);
      expect(stats.file.successCount).toBe(0);
    });

    it('should record tool-specific stats', () => {
      recordToolCall('ls-test', 'file', true, 20);
      const stats = getToolStats();
      expect(stats.file.tools['ls-test']).toBeDefined();
      expect(stats.file.tools['ls-test'].callCount).toBe(1);
    });

    it('should handle unknown category', () => {
      recordToolCall('unknown-tool', 'unknown', true, 10);
      const stats = getToolStats();
      expect(stats.unknown).toBeDefined();
      expect(stats.unknown.callCount).toBe(1);
    });

    it('should increment totalToolCalls and todayToolCalls', () => {
      const before = getSessionStats().totalToolCalls;
      recordToolCall('test', 'file', true, 10);
      const after = getSessionStats();
      expect(after.totalToolCalls).toBe(before + 1);
      expect(after.todayToolCalls).toBe(1);
    });
  });

  describe('recordSession', () => {
    it('should increment session counts', () => {
      const before = getSessionStats().totalSessions;
      recordSession();
      const after = getSessionStats();
      expect(after.totalSessions).toBe(before + 1);
      expect(after.todaySessions).toBe(1);
    });
  });

  describe('recordMessage', () => {
    it('should increment message counts', () => {
      const before = getSessionStats().totalMessages;
      recordMessage();
      const after = getSessionStats();
      expect(after.totalMessages).toBe(before + 1);
      expect(after.todayMessages).toBe(1);
    });
  });

  describe('recordTokenUsage', () => {
    it('should record total and today token usage', () => {
      const before = getSessionStats();
      recordTokenUsage(100, 50);
      const after = getSessionStats();
      // total counters
      expect(after.totalTokens).toBe(before.totalTokens + 150);
      expect(after.totalInputTokens).toBe(before.totalInputTokens + 100);
      expect(after.totalOutputTokens).toBe(before.totalOutputTokens + 50);
      // today counters
      expect(after.todayTokens).toBe(150);
      expect(after.todayInputTokens).toBe(100);
      expect(after.todayOutputTokens).toBe(50);
    });

    it('should handle falsy input values', () => {
      recordTokenUsage(0, 0);
      const after = getSessionStats();
      expect(after.totalTokens).toBe(0);
      expect(after.todayTokens).toBe(0);
    });

    it('should handle NaN input values', () => {
      recordTokenUsage(NaN, undefined as unknown as number);
      const after = getSessionStats();
      expect(after.totalTokens).toBe(0);
      expect(after.todayTokens).toBe(0);
    });
  });

  describe('getToolUsageByCategory', () => {
    it('should return usage by category', () => {
      recordToolCall('ls-usage', 'file', true, 100);
      recordToolCall('read-usage', 'file', false, 50);
      const usage = getToolUsageByCategory();
      const fileUsage = usage.find((u) => u.category === 'file');
      expect(fileUsage).toBeDefined();
      expect(fileUsage?.callCount).toBe(2);
      expect(fileUsage?.successCount).toBe(1);
      expect(fileUsage?.failCount).toBe(1);
    });
  });

  describe('getTopUsedTools', () => {
    it('should return top used tools', () => {
      recordToolCall('top-ls', 'file', true, 100);
      recordToolCall('top-read', 'file', true, 50);
      const top = getTopUsedTools(10);
      expect(top.length).toBe(2);
      const lsTool = top.find((t) => t.toolName === 'top-ls');
      expect(lsTool).toBeDefined();
      expect(lsTool?.callCount).toBe(1);
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
