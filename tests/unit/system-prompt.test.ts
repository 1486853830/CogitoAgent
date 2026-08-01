import { jest } from '@jest/globals';

const mockGetEnabledCategories = jest.fn();
const mockGetToolsByCategory = jest.fn();
const mockGetAllCategories = jest.fn();

jest.unstable_mockModule('../../src/agent/registry.ts', () => ({
  getEnabledCategories: mockGetEnabledCategories,
  getToolsByCategory: mockGetToolsByCategory,
  getAllCategories: mockGetAllCategories,
  TOOL_CATEGORIES: {
    file: '文件操作',
    web: '网络工具',
    browser: '浏览器自动化',
    code: '代码执行',
  },
  TOOL_REGISTRY: {},
  getToolRegistry: () => ({}),
  hasTool: () => false,
  getToolNames: () => [],
  isDangerousOperation: () => false,
  isConfirmEnabled: () => false,
  getToolsForPrompt: () => '',
  getEnabledToolNames: () => [],
  DANGEROUS_OPERATIONS: [],
  preprocessToolArgs: (_name: string, args: unknown) => args,
}));

const { buildToolList, buildSystemPrompt } = await import('../../src/agent/system-prompt');

describe('system-prompt.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllCategories.mockReturnValue({
      file: '文件操作',
      web: '网络工具',
      browser: '浏览器自动化',
      code: '代码执行',
    });
    mockGetToolsByCategory.mockReturnValue({
      file: ['ls', 'read', 'copy', 'mkdir', 'create'],
      web: ['search', 'browse', 'fetchPage'],
      browser: [
        'initBrowser',
        'clickElement',
        'fillField',
        'getPageContent',
        'takeScreenshot',
        'closeBrowser',
      ],
      code: ['executeCode', 'runJavaScript', 'runPython'],
    });
  });

  describe('buildToolList', () => {
    it('should generate file tools section', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildToolList();
      expect(result).toContain('文件操作工具');
      expect(result).toContain('ls(path)');
    });

    it('should generate web tools section', () => {
      mockGetEnabledCategories.mockReturnValue(['web']);
      const result = buildToolList();
      expect(result).toContain('网络工具');
      expect(result).toContain('search(query)');
    });

    it('should generate browser tools section', () => {
      mockGetEnabledCategories.mockReturnValue(['browser']);
      const result = buildToolList();
      expect(result).toContain('浏览器自动化工具');
      expect(result).toContain('initBrowser(url)');
    });

    it('should generate code tools section with security warning', () => {
      mockGetEnabledCategories.mockReturnValue(['code']);
      const result = buildToolList();
      expect(result).toContain('代码执行工具');
      expect(result).toContain('executeCode(code, language)');
      expect(result).toContain('安全警告');
    });

    it('should generate multiple tool categories', () => {
      mockGetEnabledCategories.mockReturnValue(['file', 'web']);
      const result = buildToolList();
      expect(result).toContain('文件操作工具');
      expect(result).toContain('网络工具');
    });

    it('should return empty string for empty enabled categories', () => {
      mockGetEnabledCategories.mockReturnValue([]);
      const result = buildToolList();
      expect(result).toBe('');
    });

    it('should handle unknown category gracefully', () => {
      mockGetAllCategories.mockReturnValue({ unknown: '未知分类' });
      mockGetToolsByCategory.mockReturnValue({ unknown: [] });
      mockGetEnabledCategories.mockReturnValue(['unknown']);
      const result = buildToolList();
      expect(result).toBe('');
    });
  });

  describe('buildSystemPrompt', () => {
    it('should generate system prompt with workspace info', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('活动范围');
    });

    it('should include two golden rules', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('两项黄金规则');
      expect(result).toContain('规则一：用 [TOOL] 调用工具');
      expect(result).toContain('规则二：用 [WAIT] 控制思考节奏');
    });

    it('should include tool usage format', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('[TOOL] toolName("参数1", "参数2") [/TOOL]');
    });

    it('should include WAIT rules', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('[WAIT]');
      expect(result).toContain('每次你向用户输出文字回复时，必须在末尾加上 [WAIT]');
    });

    it('should include tool statistics', () => {
      mockGetEnabledCategories.mockReturnValue(['file', 'web']);
      const result = buildSystemPrompt();
      expect(result).toContain('可用工具');
      expect(result).toContain('2/');
    });

    it('should include behavior rules', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('行为规则');
      expect(result).toContain('可以直接执行 copy 或 create 操作');
    });

    it('should include tool result handling rules', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('关于工具调用和结果展示');
      expect(result).toContain('绝对禁止');
    });

    it('should include failure handling rules', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('工具调用失败或无结果时的处理规则');
      expect(result).toContain('失败场景处理');
      expect(result).toContain('无结果场景处理');
    });

    it('should include output format rules', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('输出格式');
      expect(result).toContain('调用工具');
      expect(result).toContain('普通对话');
    });
  });
});
