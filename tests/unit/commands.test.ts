import { jest } from '@jest/globals';

const mockPrintln = jest.fn();
const mockPrintDivider = jest.fn();
const mockPrintTag = jest.fn((text: string) => `[${text}]`);
const mockLoadConfig = jest.fn(() => ({
  persona: 'default',
  api: { model: 'gpt-4', baseURL: 'https://api.example.com', apiKey: 'sk-1234567890' },
  chat: {},
  workspace: './',
  database: { path: './data' },
  email: { smtpHost: 'smtp.example.com' },
}));
const mockGetToolNames = jest.fn(() => ['ls', 'read', 'search']);
const mockGetToolsByCategory = jest.fn(() => ({
  file: ['ls', 'read'],
  web: ['search'],
}));
const mockGetBasePath = jest.fn(() => '/test/workspace');
const mockListSessions = jest.fn(() => []);
const mockGetCurrentSession = jest.fn(() => ({ id: 'test-id', name: 'test-session' }));
const mockCreateNewSession = jest.fn(() => ({ id: 'new-session', name: 'new' }));
const mockSwitchSession = jest.fn((id: string) => ({
  success: id === 'valid',
  session: id === 'valid' ? { name: 'valid-session', persona: 'test' } : null,
  error: id === 'valid' ? undefined : '会话不存在',
}));
const mockDeleteSession = jest.fn((id: string) => ({ success: id === 'valid' }));
const mockRenameSession = jest.fn((id: string, name: string) => ({ success: true }));
const mockResetConversation = jest.fn();
const mockUpdateSystemPrompt = jest.fn();
const mockManualLoginWechat = jest.fn(() => Promise.resolve());
const mockManualLogoutWechat = jest.fn(() => Promise.resolve());
const mockGetWechatStatus = jest.fn(() =>
  Promise.resolve({ success: true, data: { loggedIn: true, accountId: 'test@example.com' } }),
);
const mockGetSessionStats = jest.fn(() => ({
  totalInputTokens: 1000,
  totalOutputTokens: 2000,
  totalTokens: 3000,
  todayInputTokens: 100,
  todayOutputTokens: 200,
  todayTokens: 300,
}));
const mockBroadcast = jest.fn();
const mockPrintClusterStatus = jest.fn();
const mockHandleSpawnCommand = jest.fn();
const mockHandleDelegateCommand = jest.fn();

jest.unstable_mockModule('../../src/io/terminal', () => ({
  println: mockPrintln,
  printDivider: mockPrintDivider,
  printTag: mockPrintTag,
}));

jest.unstable_mockModule('../../src/config', () => ({
  loadConfig: mockLoadConfig,
}));

jest.unstable_mockModule('../../src/agent/registry', () => ({
  getToolNames: mockGetToolNames,
  getToolsByCategory: mockGetToolsByCategory,
}));

jest.unstable_mockModule('../../src/agent/tools/index', () => ({
  getBasePath: mockGetBasePath,
}));

jest.unstable_mockModule('../../src/agent/session', () => ({
  listSessions: mockListSessions,
  getCurrentSession: mockGetCurrentSession,
  createNewSession: mockCreateNewSession,
  switchSession: mockSwitchSession,
  deleteSession: mockDeleteSession,
  renameSession: mockRenameSession,
  resetConversation: mockResetConversation,
  updateSystemPrompt: mockUpdateSystemPrompt,
}));

jest.unstable_mockModule('../../src/agent/orchestrator', () => ({
  orchestrator: {
    stopAgent: jest.fn((id: string) => ({
      success: id === 'valid',
      data: { name: 'test-agent' },
      error: id === 'valid' ? undefined : '智能体不存在',
    })),
    stopAllAgents: jest.fn(() => ({ success: true, data: { stoppedCount: 2 } })),
    getClusterStatus: jest.fn(() => ({ totalAgents: 0, byState: {} })),
  },
}));

jest.unstable_mockModule('../../src/agent/wechat-manager', () => ({
  manualLoginWechat: mockManualLoginWechat,
  manualLogoutWechat: mockManualLogoutWechat,
  getWechatStatus: mockGetWechatStatus,
}));

jest.unstable_mockModule('../../src/agent/stats', () => ({
  getSessionStats: mockGetSessionStats,
}));

jest.unstable_mockModule('../../src/io/ws-server', () => ({
  broadcast: mockBroadcast,
}));

jest.unstable_mockModule('../../src/agent/cluster-commands', () => ({
  printClusterStatus: mockPrintClusterStatus,
  handleSpawnCommand: mockHandleSpawnCommand,
  handleDelegateCommand: mockHandleDelegateCommand,
}));

const { handleCommand, printHelp, toggleDebug } = await import('../../src/agent/commands');

describe('commands.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleCommand', () => {
    it('should handle /help command', () => {
      const result = handleCommand('/help');
      expect(result).toBe(true);
    });

    it('should handle /? command', () => {
      const result = handleCommand('/?');
      expect(result).toBe(true);
    });

    it('should handle /status command', () => {
      const result = handleCommand('/status');
      expect(result).toBe(true);
    });

    it('should handle /clear command', () => {
      const result = handleCommand('/clear');
      expect(result).toBe(true);
    });

    it('should handle /persona command with name', () => {
      const result = handleCommand('/persona test');
      expect(result).toBe(true);
    });

    it('should not handle /persona command without name (requires argument)', () => {
      const result = handleCommand('/persona');
      expect(result).toBe(false);
    });

    it('should handle /personas command', () => {
      const result = handleCommand('/personas');
      expect(result).toBe(true);
    });

    it('should handle /tools command', () => {
      const result = handleCommand('/tools');
      expect(result).toBe(true);
    });

    it('should handle /config command', () => {
      const result = handleCommand('/config');
      expect(result).toBe(true);
    });

    it('should handle /debug command', () => {
      const result = handleCommand('/debug');
      expect(result).toBe(true);
    });

    it('should handle /sessions command', () => {
      const result = handleCommand('/sessions');
      expect(result).toBe(true);
    });

    it('should handle /new command', () => {
      const result = handleCommand('/new');
      expect(result).toBe(true);
      expect(mockCreateNewSession).toHaveBeenCalled();
    });

    it('should handle /new command with persona', () => {
      const result = handleCommand('/new test-persona');
      expect(result).toBe(true);
      expect(mockCreateNewSession).toHaveBeenCalledWith(null, 'test-persona');
    });

    it('should handle /switch command with valid id', () => {
      const result = handleCommand('/switch valid');
      expect(result).toBe(true);
      expect(mockSwitchSession).toHaveBeenCalledWith('valid');
      expect(mockBroadcast).toHaveBeenCalledWith('persona-switched', { persona: 'test' });
    });

    it('should handle /switch command with invalid id', () => {
      const result = handleCommand('/switch invalid');
      expect(result).toBe(true);
      expect(mockSwitchSession).toHaveBeenCalledWith('invalid');
    });

    it('should not handle /switch command without id (requires argument)', () => {
      const result = handleCommand('/switch');
      expect(result).toBe(false);
    });

    it('should handle /delete command with valid id', () => {
      const result = handleCommand('/delete valid');
      expect(result).toBe(true);
      expect(mockDeleteSession).toHaveBeenCalledWith('valid');
    });

    it('should handle /delete command with invalid id', () => {
      const result = handleCommand('/delete invalid');
      expect(result).toBe(true);
      expect(mockDeleteSession).toHaveBeenCalledWith('invalid');
    });

    it('should not handle /delete command without id (requires argument)', () => {
      const result = handleCommand('/delete');
      expect(result).toBe(false);
    });

    it('should handle /rename command with name', () => {
      const result = handleCommand('/rename new-name');
      expect(result).toBe(true);
      expect(mockRenameSession).toHaveBeenCalled();
    });

    it('should not handle /rename command without name (requires argument)', () => {
      const result = handleCommand('/rename');
      expect(result).toBe(false);
    });

    it('should handle /agents command', () => {
      const result = handleCommand('/agents');
      expect(result).toBe(true);
    });

    it('should handle /cluster command', () => {
      const result = handleCommand('/cluster');
      expect(result).toBe(true);
    });

    it('should handle /spawn command', () => {
      const result = handleCommand('/spawn persona name instruction');
      expect(result).toBe(true);
    });

    it('should handle /delegate command', () => {
      const result = handleCommand('/delegate agent123 task');
      expect(result).toBe(true);
    });

    it('should handle /stop-agent command with valid id', () => {
      const result = handleCommand('/stop-agent valid');
      expect(result).toBe(true);
    });

    it('should handle /stop-agent command with invalid id', () => {
      const result = handleCommand('/stop-agent invalid');
      expect(result).toBe(true);
    });

    it('should not handle /stop-agent command without id (requires argument)', () => {
      const result = handleCommand('/stop-agent');
      expect(result).toBe(false);
    });

    it('should handle /stop-all-agents command', () => {
      const result = handleCommand('/stop-all-agents');
      expect(result).toBe(true);
    });

    it('should handle /wechat/login command', () => {
      const result = handleCommand('/wechat/login');
      expect(result).toBe(true);
    });

    it('should handle /wechat/logout command', () => {
      const result = handleCommand('/wechat/logout');
      expect(result).toBe(true);
    });

    it('should handle /wechat/status command', () => {
      const result = handleCommand('/wechat/status');
      expect(result).toBe(true);
    });

    it('should return false for non-command input', () => {
      const result = handleCommand('hello world');
      expect(result).toBe(false);
    });

    it('should return false for empty input', () => {
      const result = handleCommand('');
      expect(result).toBe(false);
    });

    it('should return false for whitespace only', () => {
      const result = handleCommand('   ');
      expect(result).toBe(false);
    });
  });

  describe('printHelp', () => {
    it('should print help information', () => {
      printHelp();
      expect(mockPrintDivider).toHaveBeenCalled();
      expect(mockPrintln).toHaveBeenCalled();
    });
  });

  describe('toggleDebug', () => {
    it('should toggle debug mode from off to on', () => {
      process.env.DEBUG = 'false';
      toggleDebug();
      expect(process.env.DEBUG).toBe('true');
      expect(mockPrintln).toHaveBeenCalledWith('[调试] 调试模式已开启', 'yellow');
    });

    it('should toggle debug mode from on to off', () => {
      process.env.DEBUG = 'true';
      toggleDebug();
      expect(process.env.DEBUG).toBe('false');
      expect(mockPrintln).toHaveBeenCalledWith('[调试] 调试模式已关闭', 'yellow');
    });
  });
});
