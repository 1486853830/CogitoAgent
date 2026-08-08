import { resolveToolPermission, getToolPermission } from '../../src/agent/plugin.ts';
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
});
