/**
 * .env 配置写入器（CLI 与桌面端共用）
 *
 * 此前 src/setup.ts 与 electron/main.js 各自维护一份 .env 写入逻辑，且已分叉：
 *  - 桌面端有 COGITO_CODE_SCIENTIFIC_MODE / SCIENTIFIC_LIBRARIES，CLI 没有
 *  - CLI 用引号包裹值，桌面端不包裹（含空格的值会断裂）
 *  - 桌面端加密邮箱密码，CLI 明文落盘
 *  - CLI 设置文件权限，桌面端不设置
 * 统一抽取到此模块，两端共用同一份字段集与格式，避免再次分叉。
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { encrypt as encryptCredential } from './credentials.js';

/**
 * 构造 .env 文件内容行。
 * 所有值统一用双引号包裹（config.ts 的 loadEnvFile 会自动剥离引号），
 * 以支持含空格/特殊字符的值（如工作区路径、科学库列表）。
 * 邮箱密码统一加密落盘（credentials.encrypt 对空串原样返回）。
 * @param {Record<string, any>} config
 * @returns {string[]}
 */
export function buildEnvLines(config) {
  const c = config || {};
  const q = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    // 转义反斜杠、双引号和换行符，防止破坏 .env 结构
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  };
  const pwd = encryptCredential(c.email?.password || '');

  return [
    '# CogitoAgent 配置文件',
    '# 由设置向导自动生成',
    '',
    '# ============================================',
    '# API 配置（必需）',
    '# ============================================',
    '',
    '# API 密钥（必需）',
    `COGITO_API_KEY=${q(c.api?.apiKey)}`,
    '',
    '# API 服务地址（可选，默认根据 provider 自动设置）',
    `COGITO_API_BASE_URL=${q(c.api?.baseURL)}`,
    '',
    '# API 服务商名称（可选，支持: openai, moark, anthropic, google）',
    `COGITO_API_PROVIDER=${q(c.api?.provider || 'custom')}`,
    '',
    '# 模型名称（可选）',
    `COGITO_MODEL=${q(c.api?.model)}`,
    '',
    '# ============================================',
    '# 思考间隔配置（可选）',
    '# ============================================',
    '',
    '# 自动思考间隔时间（毫秒），最小值 1000',
    `COGITO_THINKING_INTERVAL=${q(c.chat?.thinkingInterval || c.thinkingInterval || 3000)}`,
    '',
    '# ============================================',
    '# 启动模式配置（可选）',
    '# ============================================',
    '',
    '# 启动模式: desktop（桌面宠物模式）/ dashboard（工作台模式）',
    `COGITO_MODE=${q(c.mode || 'desktop')}`,
    '',
    '# ============================================',
    '# 数据库配置（可选）',
    '# ============================================',
    '',
    '# SQLite 数据库文件路径',
    `COGITO_DATABASE_PATH=${q(c.database?.path || './data/example.db')}`,
    '',
    '# ============================================',
    '# 联网搜索配置（可选）',
    '# ============================================',
    '',
    '# 是否启用联网搜索（默认启用，设为 false 关闭）',
    `COGITO_SEARCH_ENABLED=${q(c.search?.enabled !== false ? 'true' : 'false')}`,
    '',
    '# 搜索服务地址（moark 供应商可留空自动推导）',
    `COGITO_SEARCH_BASE_URL=${q(c.search?.baseURL || '')}`,
    '',
    '# 搜索时间过滤（如 week / month，留空为不过滤）',
    `COGITO_SEARCH_RECENCY_FILTER=${q(c.search?.recencyFilter || '')}`,
    '',
    '# 搜索站点过滤（留空为不限制）',
    `COGITO_SEARCH_SITE_FILTER=${q(c.search?.siteFilter || '')}`,
    '',
    '# ============================================',
    '# 邮件配置（可选）',
    '# ============================================',
    '',
    '# SMTP 服务器地址',
    `COGITO_EMAIL_HOST=${q(c.email?.smtpHost || c.email?.host)}`,
    '',
    '# SMTP 端口',
    `COGITO_EMAIL_PORT=${q(c.email?.smtpPort || c.email?.port || 587)}`,
    '',
    '# 邮箱用户名',
    `COGITO_EMAIL_USER=${q(c.email?.user)}`,
    '',
    '# 邮箱密码（已加密存储，请勿手动编辑）',
    `COGITO_EMAIL_PASSWORD=${q(pwd)}`,
    '',
    '# 发件人邮箱地址',
    `COGITO_EMAIL_FROM=${q(c.email?.from)}`,
    '',
    '# ============================================',
    '# OCR 图像文字识别配置（可选）',
    '# ============================================',
    '',
    '# OCR API 密钥',
    `COGITO_OCR_API_KEY=${q(c.ocr?.apiKey)}`,
    '',
    '# OCR API 服务地址',
    `COGITO_OCR_API_BASE_URL=${q(c.ocr?.baseURL)}`,
    '',
    '# OCR 模型名称',
    `COGITO_OCR_MODEL=${q(c.ocr?.model || 'InternVL3-78B')}`,
    '',
    '# OCR 服务商名称',
    `COGITO_OCR_PROVIDER=${q(c.ocr?.provider)}`,
    '',
    '# ============================================',
    '# 视觉分析配置（可选）',
    '# ============================================',
    '',
    '# 视觉分析 API 密钥（可选，默认回退到 COGITO_API_KEY）',
    `COGITO_VISION_API_KEY=${q(c.vision?.apiKey)}`,
    '',
    '# 视觉分析 API 服务地址（可选，默认使用 COGITO_API_BASE_URL）',
    `COGITO_VISION_API_BASE_URL=${q(c.vision?.baseURL)}`,
    '',
    '# 视觉模型名称（可选，默认 InternVL3-78B）',
    `COGITO_VISION_MODEL=${q(c.vision?.model || 'InternVL3-78B')}`,
    '',
    '# ============================================',
    '# 代码执行配置（可选）',
    '# ============================================',
    '',
    '# 代码执行超时时间（毫秒）',
    `COGITO_CODE_TIMEOUT=${q(c.code?.maxExecutionTime || c.code?.timeout || 30000)}`,
    '',
    '# 代码输出最大大小（字符）',
    `COGITO_CODE_MAX_OUTPUT=${q(c.code?.maxOutputSize || c.code?.maxOutput || 100000)}`,
    '',
    '# 是否启用科学计算模式（默认关闭）',
    `COGITO_CODE_SCIENTIFIC_MODE=${q(c.code?.scientificMode ? 'true' : 'false')}`,
    '',
    '# 已安装的科学库（逗号分隔）',
    `COGITO_CODE_SCIENTIFIC_LIBRARIES=${q(c.code?.scientificLibraries)}`,
    '',
    '# ============================================',
    '# 安全配置（可选）',
    '# ============================================',
    '',
    '# 是否启用危险操作确认（默认启用）',
    `COGITO_CONFIRM_DANGEROUS=${q(c.security?.confirmDangerous !== false ? 'true' : 'false')}`,
    '',
    '# 是否启用代码沙盒模式（默认启用）',
    `COGITO_SANDBOX_MODE=${q(c.security?.sandboxMode !== false ? 'true' : 'false')}`,
    '',
    '# ============================================',
    '# 工作区配置（可选）',
    '# ============================================',
    '',
    '# 工作区根路径',
    `COGITO_WORKSPACE=${q(c.workspace || path.join(os.homedir(), 'cogito-workspace'))}`,
  ];
}

/**
 * 将配置写入 .env 文件并设置文件权限。
 * @param {Record<string, any>} config
 * @param {{ dataDir?: string }} [options]
 * @returns {boolean} 是否写入成功
 */
export function writeEnvConfig(config, options = {}) {
  const dataDir = options.dataDir || process.env.COGITO_USER_DATA_DIR || process.cwd();
  const envPath = path.join(dataDir, '.env');

  // 注意：人设不再写入 .env（loadEnvConfig 已不读取 COGITO_PERSONA），
  // 而是持久化到 config.json 的顶层 persona 字段，由 Agent 启动时读取。
  const lines = buildEnvLines(config);

  try {
    fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
    // .env 含 API 密钥，必须限制文件访问权限
    try {
      if (process.platform === 'win32') {
        // 使用 execFileSync+数组参数避免 shell 注入（用户名可能含特殊字符）；
        // 权限设为 :RW 而非 :R，否则下次写入会因只读而失败。
        execFileSync(
          'icacls',
          [envPath, '/inheritance:r', '/grant:r', `${os.userInfo().username}:RW`],
          { windowsHide: true },
        );
      } else {
        fs.chmodSync(envPath, 0o600);
      }
    } catch {
      // 权限设置失败不阻塞保存流程
    }
    return true;
  } catch (e) {
    console.error(`[config-writer] 保存 .env 失败: ${e.message}`);
    return false;
  }
}
