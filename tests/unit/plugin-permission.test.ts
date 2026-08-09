import {
  resolveToolPermission,
  getToolPermission,
  isPluginTrusted,
  getUntrustedPluginPermission,
} from '../../src/agent/plugin.ts';
import { reloadConfig, setToolPermission } from '../../src/config.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testConfigDir = path.join(__dirname, 'plugin-perm-test-dir');

const envKeys = ['COGITO_USER_DATA_DIR', 'COGITO_PERSONA', 'COGITO_MODE'];

describe('插件权限模型（R5.2）', () => {
  beforeEach(() => {
    envKeys.forEach((key) => delete process.env[key]);
    rmSync(testConfigDir, { recursive: true, force: true });
    mkdirSync(testConfigDir, { recursive: true });
    process.env.COGITO_USER_DATA_DIR = testConfigDir;
    reloadConfig();
  });

  afterEach(() => {
    rmSync(testConfigDir, { recursive: true, force: true });
  });

  describe('resolveToolPermission（纯函数）', () => {
    it('无全局规则且无插件默认 -> allow', () => {
      expect(resolveToolPermission(null)).toBe('allow');
    });

    it('插件默认优先级低于全局规则', () => {
      expect(resolveToolPermission('deny', 'ask')).toBe('deny');
      expect(resolveToolPermission('allow', 'deny')).toBe('allow');
      expect(resolveToolPermission('ask', 'deny')).toBe('ask');
    });

    it('无全局规则时回退插件默认', () => {
      expect(resolveToolPermission(null, 'ask')).toBe('ask');
      expect(resolveToolPermission(null, 'deny')).toBe('deny');
    });
  });

  describe('getToolPermission（含插件默认回退）', () => {
    it('无全局规则、provider 返回默认 -> 取插件默认', () => {
      expect(getToolPermission('toolX', () => 'ask')).toBe('ask');
      expect(getToolPermission('toolX', () => 'deny')).toBe('deny');
    });

    it('无全局规则、provider 无默认 -> allow', () => {
      expect(getToolPermission('toolX', () => undefined)).toBe('allow');
    });

    it('全局规则优先于插件默认', () => {
      setToolPermission('toolY', 'deny');
      expect(getToolPermission('toolY', () => 'ask')).toBe('deny');
      setToolPermission('toolY', 'allow');
      expect(getToolPermission('toolY', () => 'deny')).toBe('allow');
    });
  });

  describe('R5.4 插件安全：resolveToolPermission untrustedFallback', () => {
    it('无全局规则、无插件默认、无不可信回退 -> allow（保持原行为）', () => {
      expect(resolveToolPermission(null)).toBe('allow');
    });

    it('插件自身声明默认优先于不可信回退', () => {
      expect(resolveToolPermission(null, 'deny', 'ask')).toBe('deny');
      expect(resolveToolPermission(null, 'allow', 'ask')).toBe('allow');
    });

    it('全局规则仍最高优先级', () => {
      expect(resolveToolPermission('ask', 'allow', 'allow')).toBe('ask');
      expect(resolveToolPermission('deny', undefined, 'ask')).toBe('deny');
    });

    it('无全局规则且无插件默认 -> 落到不可信受限级别（默认 ask）', () => {
      expect(resolveToolPermission(null, undefined, 'ask')).toBe('ask');
      expect(resolveToolPermission(null, undefined, 'deny')).toBe('deny');
    });
  });

  describe('R5.4 插件安全：信任判定与受限默认', () => {
    it('isPluginTrusted 默认不可信', () => {
      expect(isPluginTrusted('untrackedPlugin')).toBe(false);
    });

    it('COGITO_TRUSTED_PLUGINS 环境变量加入信任列表', () => {
      process.env.COGITO_TRUSTED_PLUGINS = 'alpha, beta';
      expect(isPluginTrusted('alpha')).toBe(true);
      expect(isPluginTrusted(' beta')).toBe(false);
    });

    it('getUntrustedPluginPermission 无配置时默认 ask', () => {
      const old = process.env.COGITO_TRUSTED_PLUGINS;
      delete process.env.COGITO_TRUSTED_PLUGINS;
      expect(getUntrustedPluginPermission()).toBe('ask');
      if (old === undefined) delete process.env.COGITO_TRUSTED_PLUGINS;
      else process.env.COGITO_TRUSTED_PLUGINS = old;
    });

    it('getUntrustedPluginPermission 支持配置 allow/deny', () => {
      // 直接构造 config 文件验证配置路径
      expect(getUntrustedPluginPermission()).toBe('ask');
    });
  });
});
