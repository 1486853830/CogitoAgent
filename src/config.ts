import { readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { Config } from './types/index.ts';
// 复用 electron 端的凭据加密实现，避免重复代码。
// .env 中的邮箱密码由 main.js 加密，src 端读取后需解密。
import { decrypt as decryptCredential } from '../electron/shared/credentials.js';

function getConfigDir(): string {
  return process.env.COGITO_USER_DATA_DIR || process.cwd();
}

function getConfigFile(): string {
  return path.resolve(getConfigDir(), 'config.json');
}

function getEnvFile(): string {
  return path.resolve(getConfigDir(), '.env');
}

const CONFIG_FILE = getConfigFile();

const DEFAULT_CONFIG: Config = {
  api: {
    provider: '',
    baseURL: '',
    apiKey: '',
    model: '',
  },
  chat: {
    maxTokens: 131072,
    temperature: 0.7,
    topP: 0.7,
    topK: 50,
    frequencyPenalty: 1,
    thinkingInterval: 3000,
  },
  search: {
    enabled: true,
    baseURL: '',
    recencyFilter: '',
    siteFilter: '',
  },
  ocr: {
    provider: '',
    baseURL: '',
    apiKey: '',
    model: 'InternVL3-78B',
  },
  vision: {
    baseURL: '',
    apiKey: '',
    model: 'InternVL3-78B',
  },
  workspace: os.homedir(),
  database: {
    path: './data/example.db',
  },
  email: {
    smtpHost: '',
    smtpPort: 587,
    user: '',
    password: '',
    from: '',
  },
  models: {
    openai: {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
    },
    moark: {
      apiKey: '',
      baseURL: 'https://api.moark.com/v1',
    },
    anthropic: {
      apiKey: '',
      baseURL: 'https://api.anthropic.com/v1',
    },
    google: {
      apiKey: '',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    },
  },
  code: {
    maxExecutionTime: 30000,
    maxOutputSize: 100000,
    scientificMode: false,
    scientificLibraries: [],
  },
  scheduler: {
    enabled: true,
  },
};

let config: Config | null = null;

function loadEnvFile(): void {
  const envFile = getEnvFile();
  if (existsSync(envFile)) {
    try {
      const content = readFileSync(envFile, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        if (!key) continue;
        let value = trimmed.slice(eqIdx + 1);
        // 去除行内注释（# 前必须有空格，避免误切值中的 #）
        const commentIdx = value.indexOf(' #');
        if (commentIdx !== -1) {
          value = value.slice(0, commentIdx);
        }
        value = value.trim();
        // 处理引号包裹的值：支持 "value" 和 'value'，移除首尾引号
        if (value.length >= 2) {
          const first = value[0];
          const last = value[value.length - 1];
          if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            value = value.slice(1, -1);
          }
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch (e) {
      console.error(`[配置] 读取 .env 文件失败: ${(e as Error).message}`);
    }
  }
}

function loadEnvConfig(): Partial<Config> {
  loadEnvFile();

  const envConfig: Partial<Config> = {};

  const apiConfig: Partial<Config['api']> = {};
  if (process.env.COGITO_API_KEY) {
    apiConfig.apiKey = process.env.COGITO_API_KEY;
  }
  if (process.env.COGITO_API_BASE_URL) {
    apiConfig.baseURL = process.env.COGITO_API_BASE_URL;
  }
  if (process.env.COGITO_API_PROVIDER) {
    apiConfig.provider = process.env.COGITO_API_PROVIDER;
  }
  if (process.env.COGITO_MODEL) {
    apiConfig.model = process.env.COGITO_MODEL;
  }
  if (Object.keys(apiConfig).length > 0) {
    envConfig.api = apiConfig as Config['api'];
  }

  if (process.env.COGITO_THINKING_INTERVAL) {
    const interval = parseInt(process.env.COGITO_THINKING_INTERVAL, 10);
    if (!isNaN(interval) && interval >= 1000) {
      envConfig.chat = { ...envConfig.chat, thinkingInterval: interval } as Config['chat'];
    }
  }

  const emailConfig: Partial<Config['email']> = {};
  if (process.env.COGITO_EMAIL_HOST) {
    emailConfig.smtpHost = process.env.COGITO_EMAIL_HOST;
  }
  if (process.env.COGITO_EMAIL_PORT) {
    const port = parseInt(process.env.COGITO_EMAIL_PORT, 10);
    if (!isNaN(port)) {
      emailConfig.smtpPort = port;
    }
  }
  if (process.env.COGITO_EMAIL_USER) {
    emailConfig.user = process.env.COGITO_EMAIL_USER;
  }
  if (process.env.COGITO_EMAIL_PASSWORD) {
    // .env 中存储的密码可能是加密格式（enc:v1:...）或旧版明文，decrypt 会自动识别
    emailConfig.password = decryptCredential(process.env.COGITO_EMAIL_PASSWORD);
  }
  if (process.env.COGITO_EMAIL_FROM) {
    emailConfig.from = process.env.COGITO_EMAIL_FROM;
  }
  if (Object.keys(emailConfig).length > 0) {
    envConfig.email = emailConfig as Config['email'];
  }

  if (process.env.COGITO_DATABASE_PATH) {
    envConfig.database = { path: process.env.COGITO_DATABASE_PATH };
  }

  const codeConfig: Partial<Config['code']> = {};
  if (process.env.COGITO_CODE_TIMEOUT) {
    const timeout = parseInt(process.env.COGITO_CODE_TIMEOUT, 10);
    if (!isNaN(timeout) && timeout > 0) {
      codeConfig.maxExecutionTime = timeout;
    }
  }
  if (process.env.COGITO_CODE_MAX_OUTPUT) {
    const maxSize = parseInt(process.env.COGITO_CODE_MAX_OUTPUT, 10);
    if (!isNaN(maxSize) && maxSize > 0) {
      codeConfig.maxOutputSize = maxSize;
    }
  }
  if (Object.keys(codeConfig).length > 0) {
    envConfig.code = codeConfig as Config['code'];
  }

  if (process.env.COGITO_WORKSPACE) {
    envConfig.workspace = process.env.COGITO_WORKSPACE;
  }

  const modelsConfig: Partial<Config['models']> = {};
  const openaiKey = process.env.COGITO_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    modelsConfig.openai = { apiKey: openaiKey };
  }
  const moarkKey = process.env.COGITO_MOARK_API_KEY || process.env.MOARK_API_KEY;
  if (moarkKey) {
    modelsConfig.moark = { apiKey: moarkKey };
  }
  const anthropicKey = process.env.COGITO_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    modelsConfig.anthropic = { apiKey: anthropicKey };
  }
  const googleKey = process.env.COGITO_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
  if (googleKey) {
    modelsConfig.google = { apiKey: googleKey };
  }
  if (Object.keys(modelsConfig).length > 0) {
    envConfig.models = modelsConfig as Config['models'];
  }

  const ocrConfig: Partial<Config['ocr']> = {};
  const ocrKey = process.env.COGITO_OCR_API_KEY || process.env.OCR_API_KEY;
  if (ocrKey) {
    ocrConfig.apiKey = ocrKey;
  }
  const ocrBaseURL = process.env.COGITO_OCR_API_BASE_URL || process.env.OCR_API_BASE_URL;
  if (ocrBaseURL) {
    ocrConfig.baseURL = ocrBaseURL;
  }
  const ocrModel = process.env.COGITO_OCR_MODEL || process.env.OCR_MODEL;
  if (ocrModel) {
    ocrConfig.model = ocrModel;
  }
  const ocrProvider = process.env.COGITO_OCR_PROVIDER || process.env.OCR_PROVIDER;
  if (ocrProvider) {
    ocrConfig.provider = ocrProvider;
  }
  if (Object.keys(ocrConfig).length > 0) {
    envConfig.ocr = ocrConfig as Config['ocr'];
  }

  const visionConfig: Partial<Config['vision']> = {};
  const visionKey = process.env.COGITO_VISION_API_KEY || process.env.VISION_API_KEY;
  if (visionKey) {
    visionConfig.apiKey = visionKey;
  }
  const visionBaseURL = process.env.COGITO_VISION_API_BASE_URL || process.env.VISION_API_BASE_URL;
  if (visionBaseURL) {
    visionConfig.baseURL = visionBaseURL;
  }
  const visionModel = process.env.COGITO_VISION_MODEL || process.env.VISION_MODEL;
  if (visionModel) {
    visionConfig.model = visionModel;
  }
  if (Object.keys(visionConfig).length > 0) {
    envConfig.vision = visionConfig as Config['vision'];
  }

  if (process.env.COGITO_MODE) {
    envConfig.mode = process.env.COGITO_MODE;
  }

  const securityConfig: Partial<Config['security']> = {};
  if (process.env.COGITO_CONFIRM_DANGEROUS !== undefined) {
    securityConfig.confirmDangerous =
      process.env.COGITO_CONFIRM_DANGEROUS.toLowerCase() !== 'false';
  }
  if (process.env.COGITO_SANDBOX_MODE !== undefined) {
    securityConfig.sandboxMode = process.env.COGITO_SANDBOX_MODE.toLowerCase() !== 'false';
  }
  if (Object.keys(securityConfig).length > 0) {
    envConfig.security = securityConfig as Config['security'];
  }

  if (process.env.COGITO_PERSONA) {
    envConfig.persona = process.env.COGITO_PERSONA;
  }

  return envConfig;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (target[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadConfig(): Config {
  try {
    const configFile = getConfigFile();
    if (existsSync(configFile)) {
      const data = readFileSync(configFile, 'utf-8');
      const loaded = JSON.parse(data);
      config = deepMerge(
        DEFAULT_CONFIG as unknown as Record<string, unknown>,
        loaded,
      ) as unknown as Config;
      const envConfig = loadEnvConfig();
      config = deepMerge(
        config as unknown as Record<string, unknown>,
        envConfig,
      ) as unknown as Config;
      console.log('[配置] 已加载配置文件');
    } else {
      config = { ...DEFAULT_CONFIG };
      const envConfig = loadEnvConfig();
      config = deepMerge(
        config as unknown as Record<string, unknown>,
        envConfig,
      ) as unknown as Config;
    }
  } catch (e) {
    // config.json 解析失败时不能只回退到 DEFAULT_CONFIG——否则 .env 中的
    // API 密钥等关键配置不会被加载，程序在用户已配置的情况下仍报"未配置"。
    console.warn(`[配置] 加载失败，回退到默认配置 + 环境变量: ${(e as Error).message}`);
    config = { ...DEFAULT_CONFIG };
    try {
      const envConfig = loadEnvConfig();
      config = deepMerge(
        config as unknown as Record<string, unknown>,
        envConfig,
      ) as unknown as Config;
    } catch (envErr) {
      console.warn(`[配置] 环境变量加载也失败: ${(envErr as Error).message}`);
    }
  }

  return config;
}

function isConfigured(): boolean {
  const cfg = loadConfig();
  return !!(cfg.api.provider && cfg.api.apiKey && cfg.api.baseURL && cfg.api.model);
}

export { loadConfig, loadEnvConfig, isConfigured, deepMerge, CONFIG_FILE, DEFAULT_CONFIG };
