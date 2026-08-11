import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- Mock TOOL_REGISTRY to isolate tests from real registry ---
const mockToolRegistry: Record<string, any> = {};
jest.unstable_mockModule('../../src/agent/registry.ts', () => ({
  TOOL_REGISTRY: mockToolRegistry,
}));

const {
  PluginManager,
  getPluginManager,
  loadPlugins,
  unloadPlugin,
  listPlugins,
  listCustomTools,
  createPluginTemplate,
  createTool,
  registerTool,
} = await import('../../src/agent/plugin.ts');

/**
 * 只有这些错误才代表"当前运行环境不支持从 file:// 动态 import"，可以跳过用例。
 * 其余任何错误都必须让用例失败，避免把真实缺陷当成平台限制吞掉。
 */
const PLATFORM_IMPORT_ERROR_KEYS = [
  'ERR_UNSUPPORTED_ESM_URL_SCHEME',
  'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_MODULE_NOT_FOUND',
  'Cannot find module',
];

function errMessage(err: unknown): string {
  return String((err as { message?: unknown })?.message ?? err);
}

function isUnsupportedImportEnv(err: unknown): boolean {
  const msg = errMessage(err);
  return PLATFORM_IMPORT_ERROR_KEYS.some((key) => msg.includes(key));
}

describe('plugin.ts', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cogito-plugin-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    // Clear mock registry
    Object.keys(mockToolRegistry).forEach((k) => delete mockToolRegistry[k]);
    // Clear singleton state
    const pm = getPluginManager();
    pm.customTools.clear();
    pm.plugins.clear();
  });

  // ============================================
  // createPluginTemplate
  // ============================================
  describe('createPluginTemplate', () => {
    it('should generate index.js and package.json template files', () => {
      const template = createPluginTemplate('my-plugin');
      expect(template['index.js']).toBeDefined();
      expect(template['package.json']).toBeDefined();
    });

    it('should include plugin name in index.js', () => {
      const template = createPluginTemplate('my-plugin');
      expect(template['index.js']).toContain('my-plugin');
      expect(template['index.js']).toContain('myTool');
      expect(template['index.js']).toContain('export default');
      expect(template['index.js']).toContain('metadata');
    });

    it('should include cogito-plugin prefix in package.json', () => {
      const template = createPluginTemplate('my-plugin');
      expect(template['package.json']).toContain('cogito-plugin-my-plugin');
      expect(template['package.json']).toContain('"type": "module"');
    });
  });

  // ============================================
  // createTool decorator
  // ============================================
  describe('createTool', () => {
    it('should wrap a method and log on success', async () => {
      const original = async (x: number) => x * 2;
      const descriptor: PropertyDescriptor = { value: original };
      const decorator = createTool({ name: 'testTool' });
      decorator({}, 'myMethod', descriptor);

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const result = await descriptor.value(5);
      expect(result).toBe(10);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('testTool'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('completed'));
      logSpy.mockRestore();
    });

    it('should log error and rethrow on failure', async () => {
      const original = async () => {
        throw new Error('test error');
      };
      const descriptor: PropertyDescriptor = { value: original };
      const decorator = createTool({ name: 'failingTool' });
      decorator({}, 'myMethod', descriptor);

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(descriptor.value()).rejects.toThrow('test error');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failingTool'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failed'));
      errorSpy.mockRestore();
    });
  });

  // ============================================
  // PluginManager class
  // ============================================
  describe('PluginManager', () => {
    describe('constructor', () => {
      it('should initialize empty maps', () => {
        const pm = new PluginManager();
        expect(pm.plugins.size).toBe(0);
        expect(pm.customTools.size).toBe(0);
      });
    });

    describe('registerTool', () => {
      it('should register a tool with all properties', () => {
        const pm = new PluginManager();
        const fn = jest.fn();
        pm.registerTool(
          { name: 'testTool', fn, description: 'a tool', category: 'cat' },
          'plugin1',
        );

        expect(pm.hasTool('testTool')).toBe(true);
        expect(mockToolRegistry.testTool).toBeDefined();
        expect(mockToolRegistry.testTool.fn).toBe(fn);
        expect(mockToolRegistry.testTool.category).toBe('cat');
        expect(mockToolRegistry.testTool.isCustom).toBe(true);
        expect(mockToolRegistry.testTool.argCount).toBe(fn.length || 1);
      });

      it('should throw when name is missing', () => {
        const pm = new PluginManager();
        expect(() => pm.registerTool({ name: '', fn: jest.fn() }, 'plugin1')).toThrow('name');
      });

      it('should throw when fn is missing', () => {
        const pm = new PluginManager();
        expect(() => pm.registerTool({ name: 'testTool', fn: null as any }, 'plugin1')).toThrow(
          'fn',
        );
      });

      it('should skip duplicate tools and warn', () => {
        const pm = new PluginManager();
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        pm.registerTool({ name: 'dup', fn: jest.fn() }, 'plugin1');
        pm.registerTool({ name: 'dup', fn: jest.fn() }, 'plugin2');

        expect(pm.listCustomTools()).toHaveLength(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dup'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
        warnSpy.mockRestore();
      });

      it('should use default category when not provided', () => {
        const pm = new PluginManager();
        pm.registerTool({ name: 'tool', fn: jest.fn() }, 'plugin1');
        const info = pm.getToolInfo('tool');
        expect(info.category).toBe('plugin');
      });

      it('should use default description when not provided', () => {
        const pm = new PluginManager();
        pm.registerTool({ name: 'tool', fn: jest.fn() }, 'myPlugin');
        const info = pm.getToolInfo('tool');
        expect(info.description).toBe('Plugin: myPlugin');
      });
    });

    describe('hasTool', () => {
      it('should return true for registered tool', () => {
        const pm = new PluginManager();
        pm.registerTool({ name: 'myTool', fn: jest.fn() }, 'plugin1');
        expect(pm.hasTool('myTool')).toBe(true);
      });

      it('should return false for unregistered tool', () => {
        const pm = new PluginManager();
        expect(pm.hasTool('nonExistent')).toBe(false);
      });
    });

    describe('getToolInfo', () => {
      it('should return tool info for registered tool', () => {
        const pm = new PluginManager();
        pm.registerTool(
          { name: 'myTool', fn: jest.fn(), description: 'desc', category: 'cat' },
          'plugin1',
        );
        const info = pm.getToolInfo('myTool');
        expect(info).toBeDefined();
        expect(info.description).toBe('desc');
        expect(info.category).toBe('cat');
        expect(info.plugin).toBe('plugin1');
      });

      it('should return undefined for unregistered tool', () => {
        const pm = new PluginManager();
        expect(pm.getToolInfo('nonExistent')).toBeUndefined();
      });
    });

    describe('listPlugins', () => {
      it('should return empty list when no plugins loaded', () => {
        const pm = new PluginManager();
        expect(pm.listPlugins()).toEqual([]);
      });
    });

    describe('listCustomTools', () => {
      it('should list all custom tools', () => {
        const pm = new PluginManager();
        pm.registerTool(
          { name: 'tool1', fn: jest.fn(), description: 'd1', category: 'c1' },
          'plugin1',
        );
        pm.registerTool(
          { name: 'tool2', fn: jest.fn(), description: 'd2', category: 'c2' },
          'plugin2',
        );

        const tools = pm.listCustomTools();
        expect(tools).toHaveLength(2);
        const names = tools.map((t) => t.name);
        expect(names).toContain('tool1');
        expect(names).toContain('tool2');
      });

      it('should return empty array when no tools registered', () => {
        const pm = new PluginManager();
        expect(pm.listCustomTools()).toEqual([]);
      });
    });

    describe('unloadPlugin', () => {
      it('should unload a plugin and remove its tools', () => {
        const pm = new PluginManager();
        pm.registerTool({ name: 'tool1', fn: jest.fn() }, 'plugin1');
        pm.plugins.set('plugin1', {
          name: 'plugin1',
          path: '/test',
          tools: [{ name: 'tool1', fn: jest.fn() }],
          metadata: {},
        });

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        const result = pm.unloadPlugin('plugin1');
        expect(result).toBe(true);
        expect(pm.hasTool('tool1')).toBe(false);
        expect(mockToolRegistry.tool1).toBeUndefined();
        expect(pm.listPlugins()).toHaveLength(0);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('plugin1'));
        logSpy.mockRestore();
      });

      it('should return false for non-existent plugin', () => {
        const pm = new PluginManager();
        expect(pm.unloadPlugin('nonExistent')).toBe(false);
      });
    });

    describe('loadAll', () => {
      it('should return empty result when plugins dir does not exist', async () => {
        const nonExistentDir = path.join(tempDir, 'non-existent-plugins');
        const pm = new PluginManager(nonExistentDir);
        const result = await pm.loadAll();
        expect(result.loaded).toBe(0);
        expect(result.errors).toEqual([]);
      });
    });

    describe('loadPlugin', () => {
      it('should throw when index.js does not exist', async () => {
        const pm = new PluginManager();
        const emptyDir = path.join(tempDir, 'empty-plugin');
        fs.mkdirSync(emptyDir, { recursive: true });

        await expect(pm.loadPlugin('empty', emptyDir)).rejects.toThrow('index.js');
      });

      it('should load a valid plugin with default export', async () => {
        const pm = new PluginManager();
        const pluginDir = path.join(tempDir, 'valid-plugin');
        fs.mkdirSync(pluginDir, { recursive: true });
        // Use CJS syntax since temp dir has no package.json with type: module
        fs.writeFileSync(
          path.join(pluginDir, 'index.js'),
          'const tool = { name: "validTestTool", description: "A valid test tool", category: "test", fn: async (arg) => ({ success: true, result: arg }) };\nmodule.exports = [tool];\nmodule.exports.metadata = { name: "valid-plugin", version: "1.0.0" };\n',
        );

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        let loadError: unknown = null;
        try {
          await pm.loadPlugin('valid', pluginDir);
        } catch (e) {
          loadError = e;
        }
        // 先快照日志再 mockRestore——mockRestore 会清空调用记录，
        // 之后再断言 toHaveBeenCalledWith 永远是 0 次。
        const logMessages = logSpy.mock.calls.map((c) => String(c[0]));
        logSpy.mockRestore();

        // 第一步：只在确认运行环境不支持动态 import 时才跳过
        if (loadError !== null && isUnsupportedImportEnv(loadError)) {
          console.warn(
            '[SKIP] loadPlugin 用例：当前环境不支持动态 import —',
            errMessage(loadError),
          );
          return;
        }
        // 第二步：任何其他错误都是真实失败，直接抛出
        if (loadError !== null) throw loadError;

        // 第三步：行为断言
        expect(pm.hasTool('validTestTool')).toBe(true);
        expect(pm.listPlugins()).toHaveLength(1);
        expect(pm.listPlugins()[0].toolCount).toBe(1);
        expect(logMessages.some((m) => m.includes('valid'))).toBe(true);
      });

      it('should throw when plugin exports invalid tool defs', async () => {
        const pm = new PluginManager();
        const pluginDir = path.join(tempDir, 'bad-tool-plugin');
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(
          path.join(pluginDir, 'index.js'),
          'module.exports = [{ description: "no name or fn" }];\n',
        );

        let thrown: unknown = null;
        try {
          await pm.loadPlugin('bad-tool', pluginDir);
        } catch (e) {
          thrown = e;
        }

        // 只有"环境不支持动态 import"才允许跳过
        if (thrown !== null && isUnsupportedImportEnv(thrown)) {
          console.warn('[SKIP] bad-tool 用例：当前环境不支持动态 import —', errMessage(thrown));
          return;
        }

        // 没抛错 = 校验逻辑失效，必须失败（原实现会静默通过）
        expect(thrown).not.toBeNull();
        expect(errMessage(thrown)).toContain('name');
      });
    });
  });

  // ============================================
  // Exported functions
  // ============================================
  describe('Exported functions', () => {
    describe('getPluginManager', () => {
      it('should return the same singleton instance', () => {
        const pm1 = getPluginManager();
        const pm2 = getPluginManager();
        expect(pm1).toBe(pm2);
      });

      it('should return a PluginManager instance', () => {
        const pm = getPluginManager();
        expect(pm).toBeInstanceOf(PluginManager);
      });
    });

    describe('registerTool (exported)', () => {
      it('should register a tool through the singleton', () => {
        const fn = jest.fn();
        registerTool('exportedTool', fn, { description: 'test desc', category: 'custom' });
        const pm = getPluginManager();
        expect(pm.hasTool('exportedTool')).toBe(true);
        const info = pm.getToolInfo('exportedTool');
        expect(info.description).toBe('test desc');
        expect(info.category).toBe('custom');
        expect(info.plugin).toBe('internal');
      });

      it('should register with defaults when no options', () => {
        registerTool('defaultTool', jest.fn());
        const info = getPluginManager().getToolInfo('defaultTool');
        // Empty description falls back to 'Plugin: <pluginName>' in registerTool
        expect(info.description).toBe('Plugin: internal');
        expect(info.category).toBe('custom');
      });
    });

    describe('listPlugins (exported)', () => {
      it('should return plugins from singleton', () => {
        expect(listPlugins()).toEqual([]);
      });
    });

    describe('listCustomTools (exported)', () => {
      it('should return custom tools from singleton', () => {
        registerTool('listTest', jest.fn(), { description: 'd', category: 'c' });
        const tools = listCustomTools();
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('listTest');
      });
    });

    describe('unloadPlugin (exported)', () => {
      it('should unload plugin through singleton', () => {
        const pm = getPluginManager();
        pm.registerTool({ name: 'unloadTest', fn: jest.fn() }, 'testPlugin');
        pm.plugins.set('testPlugin', {
          name: 'testPlugin',
          path: '/test',
          tools: [{ name: 'unloadTest', fn: jest.fn() }],
          metadata: {},
        });

        expect(unloadPlugin('testPlugin')).toBe(true);
        expect(pm.hasTool('unloadTest')).toBe(false);
      });

      it('should return false for non-existent plugin', () => {
        expect(unloadPlugin('nonExistent')).toBe(false);
      });
    });

    describe('loadPlugins (exported)', () => {
      it('should call loadAll on singleton', async () => {
        const result = await loadPlugins();
        expect(result).toBeDefined();
        expect(typeof result.loaded).toBe('number');
        expect(Array.isArray(result.errors)).toBe(true);
      });
    });
  });
});
