import { jest } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

const mockGetEnabledCategories = jest.fn();
const mockGetToolsByCategory = jest.fn();
const mockGetAllCategories = jest.fn();
let mockLanguage = 'zh';
const mockLoadConfig = jest.fn();

const testConfigDir = path.join(os.tmpdir(), 'cogito-prompt-test-' + Date.now());

jest.unstable_mockModule('../../src/config.ts', () => ({
  loadConfig: mockLoadConfig,
}));

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
  getNames: () => [],
  isDangerousOperation: () => false,
  isConfirmEnabled: () => false,
  getEnabledToolNames: () => [],
  DANGEROUS_OPERATIONS: [],
  preprocessToolArgs: (_name: string, args: unknown) => args,
}));

const { buildToolList, buildSystemPrompt } = await import('../../src/agent/system-prompt');

function setTestLanguage(lang: string) {
  mockLanguage = lang;
  const configData = {
    api: { provider: '', baseURL: '', apiKey: '', model: '' },
    chat: {
      maxTokens: 131072,
      temperature: 0.7,
      topP: 0.7,
      topK: 50,
      frequencyPenalty: 1,
      thinkingInterval: 3000,
      language: lang,
    },
    search: { enabled: true, baseURL: '', recencyFilter: '', siteFilter: '' },
    ocr: { provider: '', baseURL: '', apiKey: '', model: 'InternVL3-78B' },
    vision: { baseURL: '', apiKey: '', model: 'InternVL3-78B' },
    workspace: os.homedir(),
    database: { path: './data/example.db' },
    email: { smtpHost: '', smtpPort: 587, user: '', password: '', from: '' },
    models: {
      openai: { apiKey: '', baseURL: 'https://api.openai.com/v1' },
      moark: { apiKey: '', baseURL: 'https://api.moark.com/v1' },
      anthropic: { apiKey: '', baseURL: 'https://api.anthropic.com/v1' },
      google: { apiKey: '', baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
    },
    code: {
      maxExecutionTime: 30000,
      maxOutputSize: 100000,
      scientificMode: false,
      scientificLibraries: [],
    },
    scheduler: { enabled: true },
  };
  writeFileSync(
    path.join(testConfigDir, 'config.json'),
    JSON.stringify(configData, null, 2),
    'utf-8',
  );
  writeFileSync(path.join(testConfigDir, '.env'), '', 'utf-8');
}

describe('system-prompt.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockReturnValue({ chat: {} });
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

    it('should use native function-calling rules', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('工具调用规则（原生 function calling）');
      expect(result).toContain('用原生 function calling 调用工具');
      expect(result).toContain('role: tool');
      expect(result).toContain('tool_calls');
      // 不注入任何文本标记残留
      expect(result).not.toContain('[TOOL]');
      expect(result).not.toContain('[WAIT]');
      expect(result).not.toContain('[/TOOL]');
    });

    it('should include tool usage format', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('输出格式');
      expect(result).toContain('function calling');
      expect(result).toContain('tool_calls');
    });

    it('should not include text markers', () => {
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).not.toContain('[WAIT]');
      expect(result).not.toContain('[TOOL]');
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

  describe('language rule', () => {
    beforeEach(() => {
      mkdirSync(testConfigDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(testConfigDir, { recursive: true, force: true });
    });

    it('should include language follow instruction', () => {
      process.env.COGITO_USER_DATA_DIR = testConfigDir;
      setTestLanguage('zh');
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('语言规则');
      expect(result).toContain('使用用户输入所使用的语言来回复');
    });

    it('language instruction is independent of config language setting', () => {
      process.env.COGITO_USER_DATA_DIR = testConfigDir;
      setTestLanguage('en');
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      // 语言指令不再随语言配置变化，始终是跟随用户语言
      expect(result).toContain('语言规则');
      expect(result).toContain('使用用户输入所使用的语言来回复');
    });

    it('should work when no config file exists', () => {
      process.env.COGITO_USER_DATA_DIR = '/nonexistent-path-' + Date.now();
      mockGetEnabledCategories.mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('语言规则');
      expect(result).toContain('使用用户输入所使用的语言来回复');
    });
  });
});
