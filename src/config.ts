import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { Config } from './types/index.ts';

const CONFIG_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const CONFIG_FILE = path.resolve(CONFIG_DIR, 'config.json');
const ENV_FILE = path.resolve(CONFIG_DIR, '.env');

const DEFAULT_CONFIG: Config = {
  api: {
    provider: '',
    baseURL: '',
    apiKey: '',
    model: ''
  },
  chat: {
    maxTokens: 131072,
    temperature: 0.7,
    topP: 0.7,
    topK: 50,
    frequencyPenalty: 1,
    thinkingInterval: 3000
  },
  search: {
    enabled: true,
    baseURL: '',
    recencyFilter: '',
    siteFilter: ''
  },
  ocr: {
    provider: '',
    baseURL: '',
    apiKey: '',
    model: 'Qwen2.5-VL-32B-Instruct'
  },
  vision: {
    baseURL: '',
    apiKey: '',
    model: 'Qwen2.5-VL-32B-Instruct'
  },
  workspace: os.homedir(),
  database: {
    path: './data/example.db'
  },
  email: {
    smtpHost: '',
    smtpPort: 587,
    user: '',
    password: '',
    from: ''
  },
  models: {
    openai: {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1'
    },
    moark: {
      apiKey: '',
      baseURL: 'https://api.moark.com/v1'
    },
    anthropic: {
      apiKey: '',
      baseURL: 'https://api.anthropic.com/v1'
    },
    google: {
      apiKey: '',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta'
    }
  },
  code: {
    maxExecutionTime: 30000,
    maxOutputSize: 100000
  },
  scheduler: {
    enabled: true
  }
};

let config: Config | null = null;

function loadEnvFile(): void {
  if (existsSync(ENV_FILE)) {
    try {
      const content = readFileSync(ENV_FILE, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, value] = trimmed.split('=', 2);
          if (key && value !== undefined) {
            process.env[key] = value;
          }
        }
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
    emailConfig.password = process.env.COGITO_EMAIL_PASSWORD;
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
    securityConfig.confirmDangerous = process.env.COGITO_CONFIRM_DANGEROUS.toLowerCase() !== 'false';
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

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge((target[key] as Record<string, unknown>) || {}, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = readFileSync(CONFIG_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      config = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, loaded) as unknown as Config;
      const envConfig = loadEnvConfig();
      config = deepMerge(config as unknown as Record<string, unknown>, envConfig) as unknown as Config;
      console.error('[配置] 已加载配置文件');
    } else {
      config = { ...DEFAULT_CONFIG };
      const envConfig = loadEnvConfig();
      config = deepMerge(config as unknown as Record<string, unknown>, envConfig) as unknown as Config;
    }
  } catch (e) {
    console.error(`[配置] 加载失败: ${(e as Error).message}`);
    config = { ...DEFAULT_CONFIG };
  }

  return config;
}

function sanitizeConfig(configInput: Config): Config {
  const sanitized = deepMerge({}, configInput as unknown as Record<string, unknown>) as unknown as Config;

  if (sanitized.api && sanitized.api.apiKey) {
    delete (sanitized.api as { apiKey?: string }).apiKey;
  }

  if (sanitized.email && sanitized.email.password) {
    delete (sanitized.email as { password?: string }).password;
  }

  if (sanitized.models) {
    for (const provider in sanitized.models) {
      const p = sanitized.models[provider];
      if (p && p.apiKey) {
        delete (p as { apiKey?: string }).apiKey;
      }
    }
  }

  if (sanitized.ocr && sanitized.ocr.apiKey) {
    delete (sanitized.ocr as { apiKey?: string }).apiKey;
  }

  if (sanitized.vision && sanitized.vision.apiKey) {
    delete (sanitized.vision as { apiKey?: string }).apiKey;
  }

  return sanitized;
}

function saveConfig(newConfig: Config): boolean {
  try {
    const sanitized = sanitizeConfig(newConfig);
    writeFileSync(CONFIG_FILE, JSON.stringify(sanitized, null, 2), 'utf-8');
    config = newConfig;
    console.error('[配置] 配置已保存（敏感信息已过滤）');
    return true;
  } catch (e) {
    console.error(`[配置] 保存失败: ${(e as Error).message}`);
    return false;
  }
}

function isConfigured(): boolean {
  const cfg = loadConfig();
  return !!(cfg.api.provider && cfg.api.apiKey && cfg.api.baseURL && cfg.api.model);
}

export {
  loadConfig,
  loadEnvConfig,
  saveConfig,
  isConfigured,
  deepMerge,
  CONFIG_FILE,
  DEFAULT_CONFIG
};