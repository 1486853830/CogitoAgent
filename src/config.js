/**
 * 配置管理模块
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { BASE_PATH } from './agent/tools.js';

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
