import { buildToolList, buildSystemPrompt } from '../../src/agent/system-prompt';

jest.mock('../../src/agent/registry.ts', () => ({
  getEnabledCategories: jest.fn(),
  getToolsByCategory: jest.fn(),
  getAllCategories: jest.fn(),
  TOOL_CATEGORIES: {
    file: '文件操作',
    web: '网络工具',
    browser: '浏览器自动化',
    code: '代码执行',
    git: 'Git版本控制',
    task: '任务管理',
    memory: '记忆系统',
    data: '数据处理',
    db: '数据库',
    email: '邮件功能',
    monitor: '系统监控',
    scheduler: '定时任务',
    ocr: '图像文字识别',
    vision: '视觉分析',
    office: 'Office文档',
    cluster: '集群管理',
    wechat: '微信消息',
    gis: '地理信息',
    bio: '生命科学',
    med: '医学',
    chem: '化学',
    finance: '金融',
    math: '数学/统计',
  },
}));

jest.mock('../../src/agent/tools/index.ts', () => ({
  getBasePath: jest.fn(() => '/test/workspace'),
}));

import {
  getEnabledCategories,
  getToolsByCategory,
  getAllCategories,
} from '../../src/agent/registry';

describe('system-prompt.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAllCategories as jest.Mock).mockReturnValue({
      file: '文件操作',
      web: '网络工具',
      browser: '浏览器自动化',
      code: '代码执行',
    });
    (getToolsByCategory as jest.Mock).mockReturnValue({
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
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildToolList();
      expect(result).toContain('文件操作工具');
      expect(result).toContain('ls(path)');
      expect(result).toContain('read(path)');
      expect(result).toContain('copy(src, dest)');
      expect(result).toContain('mkdir(path)');
      expect(result).toContain('create(path, content)');
    });

    it('should generate web tools section', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['web']);
      const result = buildToolList();
      expect(result).toContain('网络工具');
      expect(result).toContain('search(query)');
      expect(result).toContain('browse(url)');
      expect(result).toContain('fetchPage(url)');
    });

    it('should generate browser tools section', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['browser']);
      const result = buildToolList();
      expect(result).toContain('浏览器自动化工具');
      expect(result).toContain('initBrowser(url)');
      expect(result).toContain('clickElement(selector, description)');
      expect(result).toContain('fillField(selector, value, description)');
      expect(result).toContain('getPageContent()');
      expect(result).toContain('takeScreenshot(name)');
      expect(result).toContain('closeBrowser()');
    });

    it('should generate code tools section with security warning', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['code']);
      const result = buildToolList();
      expect(result).toContain('代码执行工具');
      expect(result).toContain('executeCode(code, language)');
      expect(result).toContain('runJavaScript(code)');
      expect(result).toContain('runPython(code)');
      expect(result).toContain('安全警告');
      expect(result).toContain('COGITO_CONFIRM_DANGEROUS=false');
    });

    it('should generate multiple tool categories', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file', 'web']);
      const result = buildToolList();
      expect(result).toContain('文件操作工具');
      expect(result).toContain('网络工具');
    });

    it('should return empty string for empty enabled categories', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue([]);
      const result = buildToolList();
      expect(result).toBe('');
    });

    it('should handle unknown category gracefully', () => {
      (getAllCategories as jest.Mock).mockReturnValue({ unknown: '未知分类' });
      (getToolsByCategory as jest.Mock).mockReturnValue({ unknown: [] });
      (getEnabledCategories as jest.Mock).mockReturnValue(['unknown']);
      const result = buildToolList();
      expect(result).toBe('');
    });

    it('should generate git tools section with security warning', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        git: 'Git版本控制',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        git: ['gitInit', 'gitClone', 'gitPush'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['git']);
      const result = buildToolList();
      expect(result).toContain('Git 工具');
      expect(result).toContain('gitInit(cwd)');
      expect(result).toContain('gitPush(remote, branch, cwd)');
      expect(result).toContain('安全警告');
    });

    it('should generate task tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({ ...getAllCategories(), task: '任务管理' });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        task: ['createTask', 'getTasks', 'completeTask'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['task']);
      const result = buildToolList();
      expect(result).toContain('任务管理工具');
      expect(result).toContain('createTask(title, description, priority, parentId)');
      expect(result).toContain('getTasks(filter)');
      expect(result).toContain('completeTask(id)');
    });

    it('should generate memory tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        memory: '记忆系统',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        memory: ['addMemory', 'searchMemory', 'deleteMemory'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['memory']);
      const result = buildToolList();
      expect(result).toContain('记忆系统工具');
      expect(result).toContain('addMemory(content, tags, category)');
      expect(result).toContain('searchMemory(query, limit)');
      expect(result).toContain('deleteMemory(id)');
    });

    it('should generate db tools section with security warning', () => {
      (getAllCategories as jest.Mock).mockReturnValue({ ...getAllCategories(), db: '数据库' });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        db: ['executeSQL', 'insert', 'deleteData'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['db']);
      const result = buildToolList();
      expect(result).toContain('数据库工具');
      expect(result).toContain('executeSQL(sql, params)');
      expect(result).toContain('deleteData(table, conditions)');
      expect(result).toContain('安全警告');
    });

    it('should generate email tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({ ...getAllCategories(), email: '邮件功能' });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        email: ['sendEmail', 'checkEmailConfig'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['email']);
      const result = buildToolList();
      expect(result).toContain('邮件工具');
      expect(result).toContain('sendEmail(to, subject, body, options)');
      expect(result).toContain('checkEmailConfig()');
    });

    it('should generate monitor tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        monitor: '系统监控',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        monitor: ['getCPUInfo', 'getMemoryInfo', 'monitorSystem'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['monitor']);
      const result = buildToolList();
      expect(result).toContain('系统监控工具');
      expect(result).toContain('getCPUInfo()');
      expect(result).toContain('monitorSystem()');
    });

    it('should generate scheduler tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        scheduler: '定时任务',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        scheduler: ['addScheduleTask', 'removeScheduleTask'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['scheduler']);
      const result = buildToolList();
      expect(result).toContain('定时任务工具');
      expect(result).toContain('addScheduleTask(name, cronExpr, action, params)');
      expect(result).toContain('安全警告');
    });

    it('should generate ocr tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        ocr: '图像文字识别',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        ocr: ['ocr', 'ocrBatch'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['ocr']);
      const result = buildToolList();
      expect(result).toContain('图像文字识别工具（OCR）');
      expect(result).toContain('ocr(imagePath, prompt)');
      expect(result).toContain('ocrBatch(images)');
      expect(result).toContain('严格忠实于识别结果');
    });

    it('should generate vision tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        vision: '视觉分析',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        vision: ['vision', 'visionFromUrl'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['vision']);
      const result = buildToolList();
      expect(result).toContain('视觉分析工具（Vision）');
      expect(result).toContain('vision(imagePath, prompt)');
      expect(result).toContain('visionFromUrl(imageUrl, prompt)');
    });

    it('should generate office tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        office: 'Office文档',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        office: ['createPpt', 'createWord', 'createExcel'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['office']);
      const result = buildToolList();
      expect(result).toContain('Office 文档工具');
      expect(result).toContain('createPpt(options)');
      expect(result).toContain('createWord(options)');
      expect(result).toContain('createExcel(options)');
    });

    it('should generate cluster tools section', () => {
      (getAllCategories as jest.Mock).mockReturnValue({
        ...getAllCategories(),
        cluster: '集群管理',
      });
      (getToolsByCategory as jest.Mock).mockReturnValue({
        ...getToolsByCategory(),
        cluster: ['spawnAgent', 'delegateTask', 'stopAgent'],
      });
      (getEnabledCategories as jest.Mock).mockReturnValue(['cluster']);
      const result = buildToolList();
      expect(result).toContain('智能体集群工具');
      expect(result).toContain('spawnAgent(persona, name, instruction)');
      expect(result).toContain('delegateTask(agentId, task)');
      expect(result).toContain('stopAgent(agentId)');
    });
  });

  describe('buildSystemPrompt', () => {
    it('should generate system prompt with workspace info', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('/test/workspace');
      expect(result).toContain('活动范围');
    });

    it('should include two golden rules', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('两项黄金规则');
      expect(result).toContain('规则一：用 [TOOL] 调用工具');
      expect(result).toContain('规则二：用 [WAIT] 控制思考节奏');
    });

    it('should include tool usage format', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('[TOOL] toolName("参数1", "参数2") [/TOOL]');
    });

    it('should include WAIT rules', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('[WAIT]');
      expect(result).toContain('每次你向用户输出文字回复时，必须在末尾加上 [WAIT]');
    });

    it('should include tool statistics', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file', 'web']);
      const result = buildSystemPrompt();
      expect(result).toContain('可用工具（共 2/');
    });

    it('should include behavior rules', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('行为规则');
      expect(result).toContain('可以直接执行 copy 或 create 操作');
    });

    it('should include tool result handling rules', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('关于工具调用和结果展示');
      expect(result).toContain('绝对禁止');
    });

    it('should include failure handling rules', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('工具调用失败或无结果时的处理规则');
      expect(result).toContain('失败场景处理');
      expect(result).toContain('无结果场景处理');
    });

    it('should include output format rules', () => {
      (getEnabledCategories as jest.Mock).mockReturnValue(['file']);
      const result = buildSystemPrompt();
      expect(result).toContain('输出格式');
      expect(result).toContain('调用工具');
      expect(result).toContain('普通对话');
    });
  });
});
