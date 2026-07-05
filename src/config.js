/**
 * 配置管理模块
 * 支持环境变量覆盖配置，敏感信息建议使用环境变量
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = process.cwd();
const CONFIG_FILE = path.resolve(CONFIG_DIR, 'config.json');
const ENV_FILE = path.resolve(CONFIG_DIR, '.env');

// 默认配置
const DEFAULT_CONFIG = {
  api: {
    provider: '',      // 服务商名称，如 "moark"
    baseURL: '',        // API base URL
    apiKey: '',         // API 密钥
    model: ''           // 模型名称
  },
  chat: {
    maxTokens: 131072,
    temperature: 0.7,
    topP: 0.7,
    topK: 50,
    frequencyPenalty: 1,
    thinkingInterval: 3000  // 思考间隔（毫秒），可配置
  },
  search: {
    enabled: true,
    baseURL: '',          // 搜索 API URL（空则用 baseURL + /web-search-v2）
    recencyFilter: '',
    siteFilter: ''
  },
  ocr: {
    provider: '',         // OCR 服务提供商，如 "qwen-vl"
    baseURL: '',          // OCR API base URL
    apiKey: '',           // OCR API 密钥
    model: 'Qwen2.5-VL-32B-Instruct'  // OCR/VL 模型名称
  },
  vision: {
    baseURL: '',          // 视觉分析 API base URL（空则使用主 API baseURL）
    apiKey: '',           // 视觉分析 API 密钥（空则回退到主 API Key）
    model: 'Qwen2.5-VL-32B-Instruct'  // 视觉模型名称
  },
  workspace: os.homedir(),      // 工作区根路径（跨平台）
  database: {
    path: './data/example.db'  // SQLite 数据库路径
  },
  email: {
    smtpHost: '',        // SMTP 服务器地址
    smtpPort: 587,       // SMTP 端口
    user: '',            // 邮箱用户名
    password: '',        // 邮箱密码
    from: ''             // 发件人邮箱
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
    maxExecutionTime: 30000,    // 最大执行时间（毫秒）
    maxOutputSize: 100000       // 最大输出大小（字符）
  },
  scheduler: {
    enabled: true        // 是否启用定时任务
  }
};

let config = null;

/**
 * 从环境变量加载敏感配置
 * 环境变量优先级高于配置文件
 * 注意：会主动读取 .env 文件以获取最新配置
 */
function loadEnvConfig() {
  // 主动读取 .env 文件，确保获取最新配置
  loadEnvFile();

  const envConfig = {};

  // API 配置 - 统一在最后合并，避免覆盖
  const apiConfig = {};
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
    envConfig.api = apiConfig;
  }

  // 思考间隔配置
  if (process.env.COGITO_THINKING_INTERVAL) {
    const interval = parseInt(process.env.COGITO_THINKING_INTERVAL, 10);
    if (!isNaN(interval) && interval >= 1000) {
      envConfig.chat = { ...envConfig.chat, thinkingInterval: interval };
    }
  }

  // 邮件配置（完整支持 .env.example 中定义的所有字段）
  const emailConfig = {};
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
    envConfig.email = emailConfig;
  }

  // 数据库配置
  if (process.env.COGITO_DATABASE_PATH) {
    envConfig.database = { path: process.env.COGITO_DATABASE_PATH };
  }

  // 代码执行配置
  const codeConfig = {};
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
    envConfig.code = codeConfig;
  }

  // 工作区
  if (process.env.COGITO_WORKSPACE) {
    envConfig.workspace = process.env.COGITO_WORKSPACE;
  }

  // 模型 API Keys
  // 优先使用 COGITO_ 前缀版本（与 .env.example 文档一致），回退到无前缀版本（向后兼容）
  const modelsConfig = {};
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
    envConfig.models = modelsConfig;
  }

  // OCR 配置
  // 优先使用 COGITO_ 前缀版本，回退到无前缀版本（向后兼容）
  const ocrConfig = {};
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
    envConfig.ocr = ocrConfig;
  }

  // 视觉分析配置
  const visionConfig = {};
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
    envConfig.vision = visionConfig;
  }

  // 启动模式配置
  if (process.env.COGITO_MODE) {
    envConfig.mode = process.env.COGITO_MODE;
  }

  // 安全配置
  const securityConfig = {};
  if (process.env.COGITO_CONFIRM_DANGEROUS !== undefined) {
    securityConfig.confirmDangerous = process.env.COGITO_CONFIRM_DANGEROUS.toLowerCase() !== 'false';
  }
  if (process.env.COGITO_SANDBOX_MODE !== undefined) {
    securityConfig.sandboxMode = process.env.COGITO_SANDBOX_MODE.toLowerCase() !== 'false';
  }
  if (Object.keys(securityConfig).length > 0) {
    envConfig.security = securityConfig;
  }

  // 人设配置
  if (process.env.COGITO_PERSONA) {
    envConfig.persona = process.env.COGITO_PERSONA;
  }

  return envConfig;
}

/**
 * 从 .env 文件读取环境变量并更新 process.env
 */
function loadEnvFile() {
  if (existsSync(ENV_FILE)) {
    try {
      const content = readFileSync(ENV_FILE, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, value] = trimmed.split('=', 2);
          if (key && value !== undefined) {
            // 更新 process.env
            process.env[key] = value;
          }
        }
      }
    } catch (e) {
      console.error(`[配置] 读取 .env 文件失败: ${e.message}`);
    }
  }
}

/**
 * 加载配置
 */
function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = readFileSync(CONFIG_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      // 合并默认配置，防止新增字段缺失
      config = deepMerge(DEFAULT_CONFIG, loaded);
      // 环境变量覆盖配置文件
      const envConfig = loadEnvConfig();
      config = deepMerge(config, envConfig);
      console.error('[配置] 已加载配置文件');
    } else {
      config = { ...DEFAULT_CONFIG };
      const envConfig = loadEnvConfig();
      config = deepMerge(config, envConfig);
    }
  } catch (e) {
    console.error(`[配置] 加载失败: ${e.message}`);
    config = { ...DEFAULT_CONFIG };
  }

  return config;
}

/**
 * 过滤敏感字段，防止写入配置文件
 */
function sanitizeConfig(config) {
  const sanitized = deepMerge({}, config);
  
  // 过滤 API 密钥
  if (sanitized.api && sanitized.api.apiKey) {
    delete sanitized.api.apiKey;
  }
  
  // 过滤邮箱密码
  if (sanitized.email && sanitized.email.password) {
    delete sanitized.email.password;
  }
  
  // 过滤所有模型的 API 密钥
  if (sanitized.models) {
    for (const provider in sanitized.models) {
      if (sanitized.models[provider] && sanitized.models[provider].apiKey) {
        delete sanitized.models[provider].apiKey;
      }
    }
  }

  // 过滤 OCR API 密钥
  if (sanitized.ocr && sanitized.ocr.apiKey) {
    delete sanitized.ocr.apiKey;
  }

  // 过滤视觉分析 API 密钥
  if (sanitized.vision && sanitized.vision.apiKey) {
    delete sanitized.vision.apiKey;
  }
  
  return sanitized;
}

/**
 * 保存配置（自动过滤敏感字段）
 */
function saveConfig(newConfig) {
  try {
    // 过滤敏感字段，防止写入文件
    const sanitized = sanitizeConfig(newConfig);
    writeFileSync(CONFIG_FILE, JSON.stringify(sanitized, null, 2), 'utf-8');
    config = newConfig;  // 内部保留完整配置（包含环境变量）
    console.error('[配置] 配置已保存（敏感信息已过滤）');
    return true;
  } catch (e) {
    console.error(`[配置] 保存失败: ${e.message}`);
    return false;
  }
}

/**
 * 检查是否已配置
 */
function isConfigured() {
  const cfg = loadConfig();
  return !!(cfg.api.provider && cfg.api.apiKey && cfg.api.baseURL && cfg.api.model);
}

/**
 * 深度合并
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
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
