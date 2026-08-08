import {
  readFileSync,
  existsSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from 'fs';
import path from 'path';
import os from 'os';
import type { Config, McpConfig, ToolPermissionRule } from './types/index.ts';
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
    frequencyPenalty: 0,
    thinkingInterval: 3000,
    language: 'zh',
    // 单轮工具调用步数上限（安全护栏，防止失控循环；非限制正常工作量）。
    // 研究/写报告等多步任务可能需要十几到二十几次往返，默认给足余量。
    budget: { maxSteps: 20 },
    // 推测执行（R2.7/R2.8）默认关闭：仅当用户显式开启 enabled 或 auto 时生效。
    speculative: { enabled: false },
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
  workspace: path.join(os.homedir(), 'cogito-workspace'),
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
  security: {
    confirmDangerous: true,
    sandboxMode: true,
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
    // .env 中存储的密码可能是加密格式（enc:v1:...）或旧版明文，decrypt 会自动识别。
    // decrypt 内部对损坏密文/机器变更会返回空串；此处再兜底一次 try/catch，
    // 防止解密过程意外抛错导致整个配置加载失败。
    try {
      emailConfig.password = decryptCredential(process.env.COGITO_EMAIL_PASSWORD);
    } catch (e) {
      console.error(`[配置] 邮箱密码解密失败: ${(e as Error).message}`);
      emailConfig.password = '';
    }
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
  if (process.env.COGITO_CODE_SCIENTIFIC_MODE) {
    // 与 config-writer.js 写入的 .env 字段保持一致（'true'/'false'）
    codeConfig.scientificMode =
      String(process.env.COGITO_CODE_SCIENTIFIC_MODE).toLowerCase() === 'true';
  }
  if (process.env.COGITO_CODE_SCIENTIFIC_LIBRARIES) {
    codeConfig.scientificLibraries = String(process.env.COGITO_CODE_SCIENTIFIC_LIBRARIES)
      .split(',')
      .map((lib) => lib.trim())
      .filter(Boolean);
  }
  if (Object.keys(codeConfig).length > 0) {
    envConfig.code = codeConfig as Config['code'];
  }

  if (process.env.COGITO_WORKSPACE) {
    envConfig.workspace = process.env.COGITO_WORKSPACE;
  }

  const searchConfig: Partial<Config['search']> = {};
  if (process.env.COGITO_SEARCH_ENABLED !== undefined) {
    searchConfig.enabled = process.env.COGITO_SEARCH_ENABLED.toLowerCase() !== 'false';
  }
  if (process.env.COGITO_SEARCH_BASE_URL) {
    searchConfig.baseURL = process.env.COGITO_SEARCH_BASE_URL;
  }
  if (process.env.COGITO_SEARCH_RECENCY_FILTER) {
    searchConfig.recencyFilter = process.env.COGITO_SEARCH_RECENCY_FILTER;
  }
  if (process.env.COGITO_SEARCH_SITE_FILTER) {
    searchConfig.siteFilter = process.env.COGITO_SEARCH_SITE_FILTER;
  }
  if (Object.keys(searchConfig).length > 0) {
    envConfig.search = searchConfig as Config['search'];
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

  return envConfig;
}

/**
 * 原型污染防护：JSON.parse 会把 "__proto__" 解析成自有属性，
 * 而 `result[key] = ...` 赋值会触发 Object.prototype 的 setter，
 * 导致全局原型被替换。合并外部 JSON 时必须跳过这些键。
 */
const FORBIDDEN_MERGE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (FORBIDDEN_MERGE_KEYS.has(key)) continue;
    const value = source[key];
    // null 不应覆盖默认值：配置文件里写 null 通常表示"未配置"，
    // 直接覆盖会让下游取到 null 而非默认对象，引发 TypeError。
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const targetValue = target[key];
      result[key] = deepMerge(
        targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)
          ? (targetValue as Record<string, unknown>)
          : {},
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function loadConfig(): Config {
  // 缓存命中：config 已加载则直接返回，避免每次调用都重新读盘解析
  // Cache hit: return cached config if already loaded, avoid disk I/O on every call
  if (config) return config;

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

function reloadConfig(): Config {
  config = null;
  return loadConfig();
}

/** 直接读取配置文件，不使用缓存（用于每轮回复前获取最新语言） */
function readConfigFresh(): Config {
  try {
    const configFile = getConfigFile();
    if (existsSync(configFile)) {
      const data = readFileSync(configFile, 'utf-8');
      const loaded = JSON.parse(data);
      let fresh = deepMerge(
        DEFAULT_CONFIG as unknown as Record<string, unknown>,
        loaded,
      ) as unknown as Config;
      const envConfig = loadEnvConfig();
      fresh = deepMerge(
        fresh as unknown as Record<string, unknown>,
        envConfig,
      ) as unknown as Config;
      return fresh;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * 读取 MCP 配置（R4.3）：本地 stdio server 开关 + 外部 server 注册表 + 工具前缀。
 * 配置驱动——Agent 在（重新）加载时读取，Dashboard 编辑后由 Agent 重启/reload 生效。
 */
function getMcpConfig(): McpConfig {
  const cfg = loadConfig();
  return cfg.mcp || {};
}

/**
 * 写入 MCP 配置（R4.3）：合并补丁并持久化到 config.json。
 * 成功后同步更新内存缓存，使后续读取拿到最新值。
 */
function setMcpConfig(patch: Partial<McpConfig>): boolean {
  const cfg = loadConfig();
  cfg.mcp = { ...(cfg.mcp || {}), ...patch };
  const ok = saveConfig(cfg);
  if (ok) config = cfg;
  return ok;
}

/**
 * 读取工具权限规则（R5.2）：{ name, level } 列表，level ∈ allow/deny/ask。
 */
function getToolPermissions(): ToolPermissionRule[] {
  const cfg = loadConfig();
  return Array.isArray(cfg.tools?.permissions) ? cfg.tools!.permissions! : [];
}

/**
 * 设置单条工具权限规则（R5.2）：upsert 到 tools.permissions，持久化到 config.json。
 */
function setToolPermission(name: string, level: 'allow' | 'deny' | 'ask'): boolean {
  if (!name) return false;
  const cfg = loadConfig();
  const rules: ToolPermissionRule[] = Array.isArray(cfg.tools?.permissions)
    ? [...cfg.tools!.permissions!]
    : [];
  const idx = rules.findIndex((r) => r.name === name);
  if (idx >= 0) {
    rules[idx] = { name, level };
  } else {
    rules.push({ name, level });
  }
  cfg.tools = { ...(cfg.tools || {}), permissions: rules };
  const ok = saveConfig(cfg);
  if (ok) config = cfg;
  return ok;
}

function saveConfig(cfg: Config): boolean {
  try {
    const sanitized = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
    if (sanitized.api && typeof sanitized.api === 'object') {
      delete (sanitized.api as Record<string, unknown>).apiKey;
    }
    if (sanitized.email && typeof sanitized.email === 'object') {
      delete (sanitized.email as Record<string, unknown>).password;
    }
    if (sanitized.models && typeof sanitized.models === 'object') {
      for (const key of Object.keys(sanitized.models as Record<string, unknown>)) {
        const model = (sanitized.models as Record<string, unknown>)[key] as
          Record<string, unknown> | undefined;
        if (model && typeof model === 'object') {
          delete model.apiKey;
        }
      }
    }
    if (sanitized.ocr && typeof sanitized.ocr === 'object') {
      delete (sanitized.ocr as Record<string, unknown>).apiKey;
    }
    if (sanitized.vision && typeof sanitized.vision === 'object') {
      delete (sanitized.vision as Record<string, unknown>).apiKey;
    }
    writeFileAtomic(getConfigFile(), JSON.stringify(sanitized, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * 原子写入：先写同目录临时文件并 fsync，再 rename 覆盖目标。
 * rename 在同一文件系统内是原子操作，因此进程在任意时刻崩溃，
 * 目标文件要么是旧内容、要么是新内容，绝不会是写了一半的坏 JSON。
 * 直接 writeFileSync 覆盖会在中断时留下截断文件，导致下次加载解析失败
 * 而静默回退默认配置（MCP 配置与工具权限规则全部丢失）。
 */
function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(tmpPath, 'w');
    writeSync(fd, content, null, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmpPath, filePath);
  } catch (e) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // 关闭失败不掩盖原始错误
      }
    }
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // 临时文件清理失败不影响错误传播
    }
    throw e;
  }
}

export {
  loadConfig,
  reloadConfig,
  readConfigFresh,
  saveConfig,
  loadEnvConfig,
  isConfigured,
  deepMerge,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  getMcpConfig,
  setMcpConfig,
  getToolPermissions,
  setToolPermission,
};
