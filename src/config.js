/**
 * 配置管理模块
 * 支持环境变量覆盖配置，敏感信息建议使用环境变量
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = process.cwd();
const CONFIG_FILE = path.resolve(CONFIG_DIR, 'config.json');

// 默认配置
const DEFAULT_CONFIG = {
  api: {
    provider: '',      // 服务商名称，如 "moark"
    baseURL: '',        // API base URL
    apiKey: '',         // API 密钥
    model: ''           // 模型名称
  },
  chat: {
    maxTokens: 384000,
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
 */
function loadEnvConfig() {
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

  // 邮箱密码
  if (process.env.COGITO_EMAIL_PASSWORD) {
    envConfig.email = { password: process.env.COGITO_EMAIL_PASSWORD };
  }

  // 工作区
  if (process.env.COGITO_WORKSPACE) {
    envConfig.workspace = process.env.COGITO_WORKSPACE;
  }

  // 模型 API Keys
  const modelsConfig = {};
  if (process.env.OPENAI_API_KEY) {
    modelsConfig.openai = { apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.MOARK_API_KEY) {
    modelsConfig.moark = { apiKey: process.env.MOARK_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    modelsConfig.anthropic = { apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.GOOGLE_API_KEY) {
    modelsConfig.google = { apiKey: process.env.GOOGLE_API_KEY };
  }
  if (Object.keys(modelsConfig).length > 0) {
    envConfig.models = modelsConfig;
  }

  return envConfig;
}

/**
 * 加载配置
 */
function loadConfig() {
  if (config) return config;

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
      // 即使没有配置文件，也加载环境变量
      const envConfig = loadEnvConfig();
      config = deepMerge(config, envConfig);
      console.error('[配置] 未找到配置文件，使用环境变量');
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
