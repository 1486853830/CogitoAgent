import {
  reloadConfig,
  loadEnvConfig,
  saveConfig,
  isConfigured,
  deepMerge,
  DEFAULT_CONFIG,
  getMcpConfig,
  setMcpConfig,
  getToolPermissions,
  setToolPermission,
} from '../../src/config.ts';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('config.ts', () => {
  const envKeys = [
    'COGITO_API_KEY',
    'COGITO_API_BASE_URL',
    'COGITO_API_PROVIDER',
    'COGITO_MODEL',
    'COGITO_EMAIL_HOST',
    'COGITO_EMAIL_PORT',
    'COGITO_EMAIL_USER',
    'COGITO_EMAIL_PASSWORD',
    'COGITO_EMAIL_FROM',
    'COGITO_DATABASE_PATH',
    'COGITO_CODE_TIMEOUT',
    'COGITO_CODE_MAX_OUTPUT',
    'COGITO_WORKSPACE',
    'COGITO_OPENAI_API_KEY',
    'COGITO_MOARK_API_KEY',
    'COGITO_ANTHROPIC_API_KEY',
    'COGITO_GOOGLE_API_KEY',
    'COGITO_OCR_API_KEY',
    'COGITO_OCR_API_BASE_URL',
    'COGITO_OCR_MODEL',
    'COGITO_OCR_PROVIDER',
    'COGITO_VISION_API_KEY',
    'COGITO_VISION_API_BASE_URL',
    'COGITO_VISION_MODEL',
    'COGITO_MODE',
    'COGITO_CONFIRM_DANGEROUS',
    'COGITO_SANDBOX_MODE',
    'COGITO_PERSONA',
    'COGITO_USER_DATA_DIR',
    'OPENAI_API_KEY',
    'MOARK_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'OCR_API_KEY',
    'OCR_API_BASE_URL',
    'OCR_MODEL',
    'OCR_PROVIDER',
    'VISION_API_KEY',
    'VISION_API_BASE_URL',
    'VISION_MODEL',
  ];
  const testConfigDir = path.join(__dirname, 'config-test-dir');

  beforeEach(() => {
    envKeys.forEach((key) => {
      delete process.env[key];
    });
    // 清理临时目录：部分环境（如安全删除钩子）可能拦截 recursive rmSync，
    // 失败时降级为忽略，避免整个套件被环境问题拖垮。
    try {
      rmSync(testConfigDir, { recursive: true, force: true });
    } catch {
      /* 环境限制导致无法删除时忽略 */
    }
    mkdirSync(testConfigDir, { recursive: true });
    // 确保无残留 config.json（safe-delete shim 可能阻止 rmSync）
    try {
      unlinkSync(path.join(testConfigDir, 'config.json'));
    } catch {
      /* ignore */
    }
    process.env.COGITO_USER_DATA_DIR = testConfigDir;
  });

  afterEach(() => {
    try {
      rmSync(testConfigDir, { recursive: true, force: true });
    } catch {
      /* 环境限制导致无法删除时忽略 */
    }
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have default values', () => {
      expect(DEFAULT_CONFIG.api.provider).toBe('');
      expect(DEFAULT_CONFIG.api.baseURL).toBe('');
      expect(DEFAULT_CONFIG.api.apiKey).toBe('');
      expect(DEFAULT_CONFIG.api.model).toBe('');
      expect(DEFAULT_CONFIG.chat.maxTokens).toBe(131072);
      expect(DEFAULT_CONFIG.chat.temperature).toBe(0.7);
      expect(DEFAULT_CONFIG.search.enabled).toBe(true);
      expect(DEFAULT_CONFIG.workspace).toBe(path.join(os.homedir(), 'cogito-workspace'));
    });
  });

  describe('deepMerge', () => {
    it('should merge two objects', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 };
      const result = deepMerge(target, source) as {
        a: number;
        b: { c: number; d: number };
        e: number;
      };
      expect(result.a).toBe(1);
      expect(result.b.c).toBe(2);
      expect(result.b.d).toBe(3);
      expect(result.e).toBe(4);
    });

    it('should overwrite primitive values', () => {
      const target = { a: 1, b: 'original' };
      const source = { a: 2, b: 'overwritten' };
      const result = deepMerge(target, source);
      expect(result.a).toBe(2);
      expect(result.b).toBe('overwritten');
    });

    it('should handle empty source', () => {
      const target = { a: 1 };
      const result = deepMerge(target, {});
      expect(result).toEqual(target);
    });

    it('should skip null values (treated as unset)', () => {
      const target = { a: 1 };
      const source = { a: null };
      const result = deepMerge(target, source);
      // null 视为"未配置"：不覆盖默认值，保持 target 原值
      expect(result.a).toBe(1);
    });

    it('should handle arrays', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4] };
      const result = deepMerge(target, source);
      expect(result.arr).toEqual([3, 4]);
    });

    it('should reject prototype-pollution keys', () => {
      // JSON.parse 会把 __proto__ / constructor / prototype 变成自有属性，
      // 若直接 result[key] = value 赋值，会触发 Object.prototype 的 setter，
      // 污染全局原型。deepMerge 必须整体跳过这些键。
      const malicious = JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted2":true}},"prototype":{"polluted3":true},"api":{"model":"gpt-4o"}}',
      ) as Record<string, unknown>;
      const result = deepMerge(
        { ...DEFAULT_CONFIG } as unknown as Record<string, unknown>,
        malicious,
      ) as Record<string, unknown>;

      // 危险键被整体跳过（__proto__/constructor 是原型链访问器，需查自有属性）
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(false);
      // 正常键照常合并
      expect((result.api as Record<string, unknown>).model).toBe('gpt-4o');
      // Object.prototype 未被污染
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted3).toBeUndefined();
    });

    it('should reject nested prototype-pollution keys', () => {
      const malicious = JSON.parse(
        '{"api":{"__proto__":{"polluted":true},"model":"deepseek-v3"}}',
      ) as Record<string, unknown>;
      const result = deepMerge(
        { ...DEFAULT_CONFIG } as unknown as Record<string, unknown>,
        malicious,
      ) as Record<string, unknown>;
      const api = result.api as Record<string, unknown>;
      expect(api.model).toBe('deepseek-v3');
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe('loadEnvConfig', () => {
    it('should load API config from environment', () => {
      process.env.COGITO_API_KEY = 'test-key';
      process.env.COGITO_API_BASE_URL = 'https://test.com';
      process.env.COGITO_API_PROVIDER = 'openai';
      process.env.COGITO_MODEL = 'gpt-4';

      const result = loadEnvConfig();

      expect(result.api?.apiKey).toBe('test-key');
      expect(result.api?.baseURL).toBe('https://test.com');
      expect(result.api?.provider).toBe('openai');
      expect(result.api?.model).toBe('gpt-4');
    });

    it('should load email config from environment', () => {
      process.env.COGITO_EMAIL_HOST = 'smtp.test.com';
      process.env.COGITO_EMAIL_PORT = '465';
      process.env.COGITO_EMAIL_USER = 'user@test.com';
      process.env.COGITO_EMAIL_PASSWORD = 'password';
      process.env.COGITO_EMAIL_FROM = 'sender@test.com';

      const result = loadEnvConfig();

      expect(result.email?.smtpHost).toBe('smtp.test.com');
      expect(result.email?.smtpPort).toBe(465);
      expect(result.email?.user).toBe('user@test.com');
      expect(result.email?.password).toBe('password');
      expect(result.email?.from).toBe('sender@test.com');
    });

    it('should load database path from environment', () => {
      process.env.COGITO_DATABASE_PATH = '/custom/path.db';

      const result = loadEnvConfig();

      expect(result.database?.path).toBe('/custom/path.db');
    });

    it('should load code config from environment', () => {
      process.env.COGITO_CODE_TIMEOUT = '60000';
      process.env.COGITO_CODE_MAX_OUTPUT = '200000';

      const result = loadEnvConfig();

      expect(result.code?.maxExecutionTime).toBe(60000);
      expect(result.code?.maxOutputSize).toBe(200000);
    });

    it('should load workspace from environment', () => {
      process.env.COGITO_WORKSPACE = '/custom/workspace';

      const result = loadEnvConfig();

      expect(result.workspace).toBe('/custom/workspace');
    });

    it('should load models config from environment', () => {
      process.env.COGITO_OPENAI_API_KEY = 'openai-key';
      process.env.COGITO_MOARK_API_KEY = 'moark-key';

      const result = loadEnvConfig();

      expect(result.models?.openai?.apiKey).toBe('openai-key');
      expect(result.models?.moark?.apiKey).toBe('moark-key');
    });

    it('should load OCR config from environment', () => {
      process.env.COGITO_OCR_API_KEY = 'ocr-key';
      process.env.COGITO_OCR_API_BASE_URL = 'https://ocr.test.com';
      process.env.COGITO_OCR_MODEL = 'test-model';
      process.env.COGITO_OCR_PROVIDER = 'test-provider';

      const result = loadEnvConfig();

      expect(result.ocr?.apiKey).toBe('ocr-key');
      expect(result.ocr?.baseURL).toBe('https://ocr.test.com');
      expect(result.ocr?.model).toBe('test-model');
      expect(result.ocr?.provider).toBe('test-provider');
    });

    it('should load vision config from environment', () => {
      process.env.COGITO_VISION_API_KEY = 'vision-key';
      process.env.COGITO_VISION_API_BASE_URL = 'https://vision.test.com';
      process.env.COGITO_VISION_MODEL = 'vision-model';

      const result = loadEnvConfig();

      expect(result.vision?.apiKey).toBe('vision-key');
      expect(result.vision?.baseURL).toBe('https://vision.test.com');
      expect(result.vision?.model).toBe('vision-model');
    });

    it('should load security config from environment', () => {
      process.env.COGITO_CONFIRM_DANGEROUS = 'true';
      process.env.COGITO_SANDBOX_MODE = 'false';

      const result = loadEnvConfig();

      expect(result.security?.confirmDangerous).toBe(true);
      expect(result.security?.sandboxMode).toBe(false);
    });

    it('should load mode from environment (persona is NOT read from env)', () => {
      process.env.COGITO_MODE = 'dashboard';
      process.env.COGITO_PERSONA = 'developer';

      const result = loadEnvConfig();

      expect(result.mode).toBe('dashboard');
      // 人设不再从环境变量读取：启动默认套用 Cogito，避免环境覆盖默认人设。
      expect(result.persona).toBeUndefined();
    });

    it('should handle empty environment', () => {
      const result = loadEnvConfig();

      expect(result).toEqual({});
    });
  });

  describe('loadConfig', () => {
    it('should return defaults merged with env when no config file', () => {
      process.env.COGITO_API_KEY = 'env-key';
      const cfg = reloadConfig();
      expect(cfg.api.apiKey).toBe('env-key');
      expect(cfg.api.provider).toBe('');
      expect(cfg.chat.maxTokens).toBe(131072);
      expect(cfg.search.enabled).toBe(true);
    });

    it('should merge file config over defaults', () => {
      writeFileSync(
        path.join(testConfigDir, 'config.json'),
        JSON.stringify({
          api: { provider: 'openai', model: 'gpt-4' },
          chat: { maxTokens: 8192 },
        }),
        'utf-8',
      );
      const cfg = reloadConfig();
      expect(cfg.api.provider).toBe('openai');
      expect(cfg.api.model).toBe('gpt-4');
      expect(cfg.api.apiKey).toBe('');
      // defaults preserved
      expect(cfg.chat.temperature).toBe(0.7);
      expect(cfg.chat.maxTokens).toBe(8192);
      expect(cfg.search.enabled).toBe(true);
    });

    it('should merge env config over file config', () => {
      writeFileSync(
        path.join(testConfigDir, 'config.json'),
        JSON.stringify({ api: { provider: 'file-provider', apiKey: 'file-key' } }),
        'utf-8',
      );
      process.env.COGITO_API_KEY = 'env-key';
      const cfg = reloadConfig();
      // env overrides file
      expect(cfg.api.apiKey).toBe('env-key');
      expect(cfg.api.provider).toBe('file-provider');
    });

    it('should fall back to defaults on parse error', () => {
      writeFileSync(path.join(testConfigDir, 'config.json'), 'invalid-json{', 'utf-8');
      const cfg = reloadConfig();
      expect(cfg.api.provider).toBe('');
      expect(cfg.chat.maxTokens).toBe(131072);
    });
  });

  describe('isConfigured', () => {
    it('should return false when api fields are empty', () => {
      reloadConfig();
      expect(isConfigured()).toBe(false);
    });

    it('should return true when all api fields are set via env', () => {
      process.env.COGITO_API_KEY = 'key';
      process.env.COGITO_API_BASE_URL = 'https://api.test.com';
      process.env.COGITO_API_PROVIDER = 'openai';
      process.env.COGITO_MODEL = 'gpt-4';
      reloadConfig();
      expect(isConfigured()).toBe(true);
    });

    it('should return false when some api fields missing', () => {
      process.env.COGITO_API_KEY = 'key';
      process.env.COGITO_API_PROVIDER = 'openai';
      // baseURL and model not set
      reloadConfig();
      expect(isConfigured()).toBe(false);
    });
  });

  describe('saveConfig', () => {
    it('should write sanitized config to file and return true', () => {
      const cfg = {
        ...DEFAULT_CONFIG,
        api: {
          provider: 'openai',
          baseURL: 'https://api.test.com',
          apiKey: 'secret-key',
          model: 'gpt-4',
        },
        email: { ...DEFAULT_CONFIG.email, password: 'email-pass' },
        models: {
          openai: { apiKey: 'oai-key', baseURL: 'https://api.openai.com/v1' },
        },
        ocr: { ...DEFAULT_CONFIG.ocr, apiKey: 'ocr-secret' },
        vision: { ...DEFAULT_CONFIG.vision, apiKey: 'vision-secret' },
      };
      const result = saveConfig(cfg);
      expect(result).toBe(true);

      const written = JSON.parse(readFileSync(path.join(testConfigDir, 'config.json'), 'utf-8'));
      // sensitive fields removed
      expect(written.api.apiKey).toBeUndefined();
      expect(written.email.password).toBeUndefined();
      expect(written.models.openai.apiKey).toBeUndefined();
      expect(written.ocr.apiKey).toBeUndefined();
      expect(written.vision.apiKey).toBeUndefined();
      // non-sensitive fields preserved
      expect(written.api.provider).toBe('openai');
      expect(written.api.model).toBe('gpt-4');
      expect(written.models.openai.baseURL).toBe('https://api.openai.com/v1');
    });

    it('should not mutate the original config object', () => {
      const cfg = {
        ...DEFAULT_CONFIG,
        api: {
          provider: 'openai',
          baseURL: 'https://api.test.com',
          apiKey: 'secret-key',
          model: 'gpt-4',
        },
      };
      saveConfig(cfg);
      // original still has the key
      expect(cfg.api.apiKey).toBe('secret-key');
    });

    it('should return false when write fails', () => {
      process.env.COGITO_USER_DATA_DIR = path.join(testConfigDir, 'nonexistent-subdir');
      const result = saveConfig(DEFAULT_CONFIG);
      expect(result).toBe(false);
      // restore for subsequent cleanup
      process.env.COGITO_USER_DATA_DIR = testConfigDir;
    });
  });

  describe('MCP 配置（R4.3）', () => {
    it('getMcpConfig 默认返回空对象', () => {
      reloadConfig();
      expect(getMcpConfig()).toEqual({});
    });

    it('setMcpConfig 写入并能被读取', () => {
      reloadConfig();
      const ok = setMcpConfig({
        enabled: true,
        serverName: 'cogito-agent',
        prefix: 'mcp_',
        servers: {
          fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        },
      });
      expect(ok).toBe(true);
      const mcp = getMcpConfig();
      expect(mcp.enabled).toBe(true);
      expect(mcp.serverName).toBe('cogito-agent');
      expect(mcp.prefix).toBe('mcp_');
      expect(mcp.servers.fs.command).toBe('npx');
    });

    it('setMcpConfig 合并补丁并持久化到 config.json', () => {
      reloadConfig();
      setMcpConfig({ enabled: true });
      const file = JSON.parse(readFileSync(path.join(testConfigDir, 'config.json'), 'utf-8'));
      expect(file.mcp.enabled).toBe(true);
      // 其他字段不应被清掉
      expect(file.api).toBeDefined();
      // 二次补丁应叠加
      setMcpConfig({ prefix: 'mcp_' });
      expect(getMcpConfig().prefix).toBe('mcp_');
      expect(getMcpConfig().enabled).toBe(true);
    });
  });

  describe('工具权限（R5.2）', () => {
    it('getToolPermissions 默认返回空数组', () => {
      reloadConfig();
      expect(getToolPermissions()).toEqual([]);
    });

    it('setToolPermission 新增规则并持久化', () => {
      reloadConfig();
      const ok = setToolPermission('dangerousTool', 'deny');
      expect(ok).toBe(true);
      const rules = getToolPermissions();
      expect(rules).toContainEqual({ name: 'dangerousTool', level: 'deny' });
    });

    it('setToolPermission 同名校验应更新而非重复', () => {
      reloadConfig();
      setToolPermission('toolA', 'ask');
      setToolPermission('toolA', 'deny');
      const rules = getToolPermissions();
      expect(rules.filter((r) => r.name === 'toolA')).toHaveLength(1);
      expect(rules.find((r) => r.name === 'toolA').level).toBe('deny');
    });

    it('空工具名应被拒绝', () => {
      reloadConfig();
      expect(setToolPermission('', 'allow')).toBe(false);
    });
  });
});
