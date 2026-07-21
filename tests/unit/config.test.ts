import { loadEnvConfig, deepMerge, DEFAULT_CONFIG } from '../../src/config';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmdirSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('config.ts', () => {
  const envKeys = [
    'COGITO_API_KEY',
    'COGITO_API_BASE_URL',
    'COGITO_API_PROVIDER',
    'COGITO_MODEL',
    'COGITO_THINKING_INTERVAL',
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
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }
    process.env.COGITO_USER_DATA_DIR = testConfigDir;
  });

  afterEach(() => {
    if (existsSync(testConfigDir)) {
      rmdirSync(testConfigDir);
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
      expect(DEFAULT_CONFIG.chat.thinkingInterval).toBe(3000);
      expect(DEFAULT_CONFIG.search.enabled).toBe(true);
      expect(DEFAULT_CONFIG.workspace).toBe(os.homedir());
    });
  });

  describe('deepMerge', () => {
    it('should merge two objects', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 };
      const result = deepMerge(target, source);
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

    it('should handle null values', () => {
      const target = { a: 1 };
      const source = { a: null };
      const result = deepMerge(target, source);
      expect(result.a).toBeNull();
    });

    it('should handle arrays', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4] };
      const result = deepMerge(target, source);
      expect(result.arr).toEqual([3, 4]);
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

    it('should load chat config from environment', () => {
      process.env.COGITO_THINKING_INTERVAL = '5000';

      const result = loadEnvConfig();

      expect(result.chat?.thinkingInterval).toBe(5000);
    });

    it('should ignore invalid thinking interval', () => {
      process.env.COGITO_THINKING_INTERVAL = '500';

      const result = loadEnvConfig();

      expect(result.chat).toBeUndefined();
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

    it('should load mode and persona from environment', () => {
      process.env.COGITO_MODE = 'dashboard';
      process.env.COGITO_PERSONA = 'developer';

      const result = loadEnvConfig();

      expect(result.mode).toBe('dashboard');
      expect(result.persona).toBe('developer');
    });

    it('should handle empty environment', () => {
      const result = loadEnvConfig();

      expect(result).toEqual({});
    });
  });
});
