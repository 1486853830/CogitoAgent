import {
  TOOL_REGISTRY,
  TOOL_CATEGORIES,
  DANGEROUS_OPERATIONS,
  getToolNames,
  getToolRegistry,
  hasTool,
  isDangerousOperation,
  isConfirmEnabled,
  getToolsByCategory,
  getEnabledCategories,
  getAllCategories,
  getEnabledToolNames,
} from '../../src/agent/registry.ts';

describe('registry.ts', () => {
  describe('TOOL_CATEGORIES', () => {
    it('should define all tool categories', () => {
      expect(TOOL_CATEGORIES.file).toBe('文件操作');
      expect(TOOL_CATEGORIES.web).toBe('网络工具');
      expect(TOOL_CATEGORIES.system).toBe('系统操作');
      expect(TOOL_CATEGORIES.code).toBe('代码执行');
      expect(TOOL_CATEGORIES.git).toBe('Git版本控制');
      expect(TOOL_CATEGORIES.task).toBe('任务管理');
      expect(TOOL_CATEGORIES.memory).toBe('记忆系统');
      expect(TOOL_CATEGORIES.data).toBe('数据处理');
      expect(TOOL_CATEGORIES.db).toBe('数据库');
      expect(TOOL_CATEGORIES.email).toBe('邮件功能');
      expect(TOOL_CATEGORIES.monitor).toBe('系统监控');
      expect(TOOL_CATEGORIES.scheduler).toBe('定时任务');
      expect(TOOL_CATEGORIES.ocr).toBe('图像文字识别');
      expect(TOOL_CATEGORIES.vision).toBe('视觉分析');
      expect(TOOL_CATEGORIES.office).toBe('Office文档');
      expect(TOOL_CATEGORIES.cluster).toBe('集群管理');
      expect(TOOL_CATEGORIES.wechat).toBe('微信消息');
    });
  });

  describe('TOOL_REGISTRY', () => {
    it('should contain file tools', () => {
      expect(TOOL_REGISTRY.ls).toBeDefined();
      expect(TOOL_REGISTRY.read).toBeDefined();
      expect(TOOL_REGISTRY.copy).toBeDefined();
      expect(TOOL_REGISTRY.mkdir).toBeDefined();
      expect(TOOL_REGISTRY.create).toBeDefined();
    });

    it('should contain web tools', () => {
      expect(TOOL_REGISTRY.search).toBeDefined();
      expect(TOOL_REGISTRY.browse).toBeDefined();
      expect(TOOL_REGISTRY.fetchPage).toBeDefined();
    });

    it('should contain code tools', () => {
      expect(TOOL_REGISTRY.executeCode).toBeDefined();
      expect(TOOL_REGISTRY.runJavaScript).toBeDefined();
      expect(TOOL_REGISTRY.runPython).toBeDefined();
    });

    it('should define correct argCount for tools', () => {
      expect(TOOL_REGISTRY.ls.argCount).toBe(1);
      expect(TOOL_REGISTRY.read.argCount).toBe(1);
      expect(TOOL_REGISTRY.copy.argCount).toBe(2);
      expect(TOOL_REGISTRY.create.argCount).toBe(2);
    });

    it('should define correct category for tools', () => {
      expect(TOOL_REGISTRY.ls.category).toBe('file');
      expect(TOOL_REGISTRY.search.category).toBe('web');
      expect(TOOL_REGISTRY.executeCode.category).toBe('code');
      expect(TOOL_REGISTRY.executeSQL.category).toBe('db');
    });
  });

  describe('DANGEROUS_OPERATIONS', () => {
    it('should contain dangerous operations', () => {
      expect(DANGEROUS_OPERATIONS.has('gitPush')).toBe(true);
      expect(DANGEROUS_OPERATIONS.has('executeCode')).toBe(true);
      expect(DANGEROUS_OPERATIONS.has('deleteData')).toBe(true);
      expect(DANGEROUS_OPERATIONS.has('dropTable')).toBe(true);
      expect(DANGEROUS_OPERATIONS.has('clearTasks')).toBe(true);
      expect(DANGEROUS_OPERATIONS.has('clearMemory')).toBe(true);
      expect(DANGEROUS_OPERATIONS.has('executeSQL')).toBe(true);
      expect(DANGEROUS_OPERATIONS.has('executeTransaction')).toBe(true);
    });

    it('should not contain safe operations', () => {
      expect(DANGEROUS_OPERATIONS.has('ls')).toBe(false);
      expect(DANGEROUS_OPERATIONS.has('read')).toBe(false);
      expect(DANGEROUS_OPERATIONS.has('search')).toBe(false);
    });
  });

  describe('getToolNames', () => {
    it('should return all tool names', () => {
      const names = getToolNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('ls');
      expect(names).toContain('read');
      expect(names).toContain('search');
    });
  });

  describe('getToolRegistry', () => {
    it('should return tool info for existing tool', () => {
      const info = getToolRegistry('ls');
      expect(info).not.toBeNull();
      expect(info?.argCount).toBe(1);
      expect(info?.category).toBe('file');
    });

    it('should return null for non-existent tool', () => {
      const info = getToolRegistry('non_existent_tool');
      expect(info).toBeNull();
    });
  });

  describe('hasTool', () => {
    it('should return true for existing tool', () => {
      expect(hasTool('ls')).toBe(true);
      expect(hasTool('read')).toBe(true);
      expect(hasTool('search')).toBe(true);
    });

    it('should return false for non-existent tool', () => {
      expect(hasTool('non_existent_tool')).toBe(false);
    });
  });

  describe('isDangerousOperation', () => {
    it('should return true for dangerous operations', () => {
      expect(isDangerousOperation('gitPush')).toBe(true);
      expect(isDangerousOperation('executeCode')).toBe(true);
      expect(isDangerousOperation('deleteData')).toBe(true);
    });

    it('should return false for safe operations', () => {
      expect(isDangerousOperation('ls')).toBe(false);
      expect(isDangerousOperation('read')).toBe(false);
      expect(isDangerousOperation('search')).toBe(false);
    });
  });

  describe('isConfirmEnabled', () => {
    it('should return true by default', () => {
      expect(isConfirmEnabled()).toBe(true);
    });

    it('should return false when COGITO_CONFIRM_DANGEROUS is false', () => {
      process.env.COGITO_CONFIRM_DANGEROUS = 'false';
      expect(isConfirmEnabled()).toBe(false);
      delete process.env.COGITO_CONFIRM_DANGEROUS;
    });
  });

  describe('getToolsByCategory', () => {
    it('should return tools grouped by category', () => {
      const tools = getToolsByCategory();
      expect(tools.file).toEqual(expect.arrayContaining(['ls', 'read', 'copy', 'mkdir', 'create']));
      expect(tools.web).toEqual(expect.arrayContaining(['search', 'browse', 'fetchPage']));
      expect(tools.code).toEqual(
        expect.arrayContaining(['executeCode', 'runJavaScript', 'runPython']),
      );
    });
  });

  describe('getAllCategories', () => {
    it('should return all categories with names', () => {
      const categories = getAllCategories();
      expect(categories).toEqual(TOOL_CATEGORIES);
    });
  });

  describe('getEnabledCategories', () => {
    it('should return all categories when no config', () => {
      const enabled = getEnabledCategories();
      expect(enabled.length).toBe(Object.keys(TOOL_CATEGORIES).length);
    });
  });

  describe('getEnabledToolNames', () => {
    it('should return enabled tool names', () => {
      const names = getEnabledToolNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
    });
  });
});
