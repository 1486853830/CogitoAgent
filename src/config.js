/**
 * 配置管理模块
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

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
    frequencyPenalty: 1
  },
  search: {
    enabled: true,
    baseURL: '',          // 搜索 API URL（空则用 baseURL + /web-search-v2）
    recencyFilter: '',
    siteFilter: ''
  },
  workspace: 'D:\\',      // 工作区根路径
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
      console.error('[配置] 已加载配置文件');
    } else {
      config = { ...DEFAULT_CONFIG };
      console.error('[配置] 未找到配置文件');
    }
  } catch (e) {
    console.error(`[配置] 加载失败: ${e.message}`);
    config = { ...DEFAULT_CONFIG };
  }

  return config;
}

/**
 * 保存配置
 */
function saveConfig(newConfig) {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
    config = newConfig;
    console.error('[配置] 配置已保存到 config.json');
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
  saveConfig,
  isConfigured,
  CONFIG_FILE,
  DEFAULT_CONFIG
};
