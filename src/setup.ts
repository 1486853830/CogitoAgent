/**
 * 首次设置引导模块 - 艺术化终端设计
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DEFAULT_CONFIG, loadEnvConfig, deepMerge } from './config.ts';
// 复用 electron 端的 .env 写入逻辑，避免 CLI 与桌面端字段集/格式分叉
import { writeEnvConfig } from '../electron/shared/config-writer.js';

interface EmailSetupConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

interface OcrSetupConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: string;
}

interface VisionSetupConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

interface CodeSetupConfig {
  timeout: number;
  maxOutput: number;
}

interface SecuritySetupConfig {
  confirmDangerous: boolean;
  sandboxMode: boolean;
}

// ANSI 颜色代码
const COLORS: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  red: '\x1b[91m',
  green: '\x1b[92m',
  darkGreen: '\x1b[32m',
  yellow: '\x1b[93m',
  blue: '\x1b[94m',
  magenta: '\x1b[95m',
  cyan: '\x1b[96m',
  white: '\x1b[97m',
  bgBlack: '\x1b[40m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
};

/**
 * 打印带颜色的文字
 */
function print(text: string, color: string | null = null): void {
  if (color && COLORS[color]) {
    process.stdout.write(COLORS[color] + text + COLORS.reset);
  } else {
    process.stdout.write(text);
  }
}

/**
 * 打印一行带颜色的文字
 */
function println(text: string, color: string | null = null): void {
  print(text, color);
  process.stdout.write('\n');
}

/**
 * 打印分隔线
 */
function printDivider(char = '─', color: string | null = 'cyan'): void {
  const width = process.stdout.columns || 60;
  const colorCode = COLORS[color as string] || COLORS.reset;
  println(colorCode + char.repeat(width) + COLORS.reset);
}

/**
 * 打印步骤标题
 */
function printStepTitle(stepNum: number, title: string): void {
  println('');
  printDivider('─', 'cyan');
  println(COLORS.cyan + COLORS.bold + `  【第${stepNum}步】` + COLORS.white + title + COLORS.reset);
  printDivider('─', 'cyan');
}

/**
 * 打印成功消息
 */
function printSuccess(text: string): void {
  println(COLORS.green + COLORS.bold + '  ✅ ' + text + COLORS.reset);
}

/**
 * 打印警告消息
 */
function printWarning(text: string): void {
  println(COLORS.yellow + '  ⚠️  ' + text + COLORS.reset);
}

/**
 * 打印信息消息
 */
function printInfo(text: string): void {
  println(COLORS.blue + '  ℹ️  ' + text + COLORS.reset);
}

/**
 * 打印错误消息
 */
function printError(text: string): void {
  println(COLORS.red + COLORS.bold + '  ❌ ' + text + COLORS.reset);
}

/**
 * 打印提示消息
 */
function printTip(text: string): void {
  println(COLORS.dim + '  💡 ' + text + COLORS.reset);
}

/**
 * 打印设置向导 Banner
 */
function printSetupBanner(): void {
  const banner = `
${COLORS.cyan}${COLORS.bold}
██████╗  ██████╗  ██████╗ ██╗████████╗ ██████╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗
██╔═══╝  ██╔═══██╗██╔═══╝  ██║╚══██╔═╝ ██╔═══██╗    ██╔══██╗██╔═══╝  ██╔═══╝ ████╗  ██║╚══██╔═╝
██║      ██║   ██║██║  ███╗██║   ██║   ██║   ██║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
██║      ██║   ██║██║   ██║██║   ██║   ██║   ██║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
╚██████╗ ╚██████╔╝╚██████╔╝██║   ██║   ╚██████╔╝    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
 ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝   ╚═╝    ╚═════╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
${COLORS.reset}
${COLORS.cyan}${COLORS.bold}            CogitoAgent${COLORS.reset}
${COLORS.bold}╔══════════════════════════════════════════════════════════════╗
║  ${COLORS.magenta}🚀 设置向导${COLORS.reset}${COLORS.bold} - 让我来帮你完成初始配置                        ║
╚══════════════════════════════════════════════════════════════╝${COLORS.reset}
`;
  println(banner);
}

/**
 * 打印完成 Banner
 */
function printCompleteBanner(): void {
  println('');
  println(
    COLORS.green +
      COLORS.bold +
      '╔══════════════════════════════════════════════════════════════╗' +
      COLORS.reset,
  );
  println(
    COLORS.green +
      '║' +
      COLORS.reset +
      '                                                              ' +
      COLORS.green +
      '║' +
      COLORS.reset,
  );
  println(
    COLORS.green +
      '║' +
      COLORS.reset +
      '     ' +
      COLORS.bold +
      COLORS.white +
      '🎉 设置完成！' +
      COLORS.reset +
      '                                      ' +
      COLORS.green +
      '║' +
      COLORS.reset,
  );
  println(
    COLORS.green +
      '║' +
      COLORS.reset +
      '                                                              ' +
      COLORS.green +
      '║' +
      COLORS.reset,
  );
  println(
    COLORS.green +
      '║' +
      COLORS.reset +
      '     ' +
      COLORS.cyan +
      '重新运行程序即可开始使用 CogitoAgent' +
      COLORS.reset +
      '              ' +
      COLORS.green +
      '║' +
      COLORS.reset,
  );
  println(
    COLORS.green +
      '║' +
      COLORS.reset +
      '                                                              ' +
      COLORS.green +
      '║' +
      COLORS.reset,
  );
  println(
    COLORS.green +
      COLORS.bold +
      '╚══════════════════════════════════════════════════════════════╝' +
      COLORS.reset,
  );
  println('');
}

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, text: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(text, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * 检查环境变量是否已配置
 */
function checkEnvConfig(): boolean {
  const envConfig = loadEnvConfig();
  const hasApiConfig = !!(
    envConfig.api &&
    (envConfig.api.apiKey || envConfig.api.baseURL || envConfig.api.model)
  );
  return hasApiConfig;
}

/**
 * 配置思考间隔
 */
async function configureThinkingInterval(rl: readline.Interface): Promise<number> {
  printStepTitle(5, '思考间隔配置（可选）');
  println('');
  printTip('AI 自动思考的时间间隔，单位毫秒，最小值 1000');
  println(COLORS.dim + '  按回车使用默认值: 3000' + COLORS.reset);
  println('');

  const answer = await question(rl, COLORS.yellow + '  请输入思考间隔: ' + COLORS.reset);
  const trimmed = answer.trim();

  if (!trimmed) {
    return 3000;
  }

  const interval = parseInt(trimmed, 10);
  if (!isNaN(interval) && interval >= 1000) {
    return interval;
  }

  printWarning('无效值，使用默认值 3000');
  return 3000;
}

/**
 * 配置启动模式
 */
async function configureMode(rl: readline.Interface): Promise<string> {
  printStepTitle(7, '启动模式配置（可选）');
  println('');
  println(COLORS.white + '  1 - desktop（桌面宠物模式）' + COLORS.reset);
  println(COLORS.white + '  2 - dashboard（工作台模式）' + COLORS.reset);
  println(COLORS.dim + '  按回车使用默认值: dashboard' + COLORS.reset);
  println('');

  const answer = await question(rl, COLORS.yellow + '  请输入模式编号: ' + COLORS.reset);
  const trimmed = answer.trim();

  if (!trimmed) {
    return 'dashboard';
  }

  if (trimmed === '1' || trimmed.toLowerCase() === 'desktop') {
    return 'desktop';
  }
  if (trimmed === '2' || trimmed.toLowerCase() === 'dashboard') {
    return 'dashboard';
  }

  printWarning('无效值，使用默认值 dashboard');
  return 'dashboard';
}

/**
 * 配置邮件服务
 */
async function configureEmail(rl: readline.Interface): Promise<EmailSetupConfig | null> {
  printStepTitle(8, '邮件配置（可选）');
  println('');
  println(COLORS.dim + '  按回车跳过此配置（不配置邮件功能）' + COLORS.reset);
  println('');

  const answer = await question(rl, COLORS.yellow + '  是否配置邮件服务？(y/n): ' + COLORS.reset);
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  printTip('请输入邮件服务配置');

  const host = await question(rl, COLORS.yellow + '  SMTP服务器地址: ' + COLORS.reset);
  const port = await question(rl, COLORS.yellow + '  SMTP端口: ' + COLORS.reset);
  const user = await question(rl, COLORS.yellow + '  邮箱用户名: ' + COLORS.reset);
  const password = await question(rl, COLORS.yellow + '  邮箱密码: ' + COLORS.reset);
  const from = await question(rl, COLORS.yellow + '  发件人地址: ' + COLORS.reset);

  return {
    host: host.trim(),
    port: port.trim() ? parseInt(port.trim(), 10) || 587 : 587,
    user: user.trim(),
    password: password.trim(),
    from: from.trim(),
  };
}

/**
 * 配置 OCR 图像文字识别
 */
async function configureOCR(rl: readline.Interface): Promise<OcrSetupConfig | null> {
  printStepTitle(9, 'OCR 图像文字识别配置（可选）');
  println('');
  println(COLORS.dim + '  按回车跳过此配置（使用主 API Key）' + COLORS.reset);
  println('');

  const answer = await question(
    rl,
    COLORS.yellow + '  是否配置独立的 OCR 服务？(y/n): ' + COLORS.reset,
  );
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  printTip('请输入 OCR 服务配置');

  const apiKey = await question(rl, COLORS.yellow + '  OCR API Key: ' + COLORS.reset);
  const baseURL = await question(rl, COLORS.yellow + '  OCR API 地址: ' + COLORS.reset);
  const model = await question(rl, COLORS.yellow + '  OCR 模型名称: ' + COLORS.reset);
  const provider = await question(rl, COLORS.yellow + '  OCR 服务商: ' + COLORS.reset);

  return {
    apiKey: apiKey.trim(),
    baseURL: baseURL.trim(),
    model: model.trim() || 'InternVL3-78B',
    provider: provider.trim(),
  };
}

/**
 * 配置视觉分析
 */
async function configureVision(rl: readline.Interface): Promise<VisionSetupConfig | null> {
  printStepTitle(10, '视觉分析配置（可选）');
  println('');
  println(COLORS.dim + '  按回车跳过此配置（使用主 API Key）' + COLORS.reset);
  println('');

  const answer = await question(
    rl,
    COLORS.yellow + '  是否配置独立的视觉分析服务？(y/n): ' + COLORS.reset,
  );
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  printTip('请输入视觉分析服务配置');

  const apiKey = await question(rl, COLORS.yellow + '  Vision API Key: ' + COLORS.reset);
  const baseURL = await question(rl, COLORS.yellow + '  Vision API 地址: ' + COLORS.reset);
  const model = await question(rl, COLORS.yellow + '  Vision 模型名称: ' + COLORS.reset);

  return {
    apiKey: apiKey.trim(),
    baseURL: baseURL.trim(),
    model: model.trim() || 'InternVL3-78B',
  };
}

/**
 * 配置代码执行
 */
async function configureCode(rl: readline.Interface): Promise<CodeSetupConfig | null> {
  printStepTitle(11, '代码执行配置（可选）');
  println('');
  println(COLORS.dim + '  按回车跳过此配置（使用默认值）' + COLORS.reset);
  println('');

  const answer = await question(
    rl,
    COLORS.yellow + '  是否自定义代码执行配置？(y/n): ' + COLORS.reset,
  );
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  printTip('请输入代码执行配置');

  const timeout = await question(
    rl,
    COLORS.yellow + '  执行超时时间(毫秒，默认30000): ' + COLORS.reset,
  );
  const maxOutput = await question(
    rl,
    COLORS.yellow + '  最大输出大小(字符，默认100000): ' + COLORS.reset,
  );

  return {
    timeout: timeout.trim() ? parseInt(timeout.trim(), 10) || 30000 : 30000,
    maxOutput: maxOutput.trim() ? parseInt(maxOutput.trim(), 10) || 100000 : 100000,
  };
}

/**
 * 配置安全选项
 */
async function configureSecurity(rl: readline.Interface): Promise<SecuritySetupConfig | null> {
  printStepTitle(12, '安全配置（可选）');
  println('');
  println(COLORS.dim + '  按回车跳过此配置（使用默认值）' + COLORS.reset);
  println('');

  const answer = await question(rl, COLORS.yellow + '  是否自定义安全配置？(y/n): ' + COLORS.reset);
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  printTip('请输入安全配置');

  const confirmDangerous = await question(
    rl,
    COLORS.yellow + '  危险操作确认(默认true，设为false跳过确认): ' + COLORS.reset,
  );
  const sandboxMode = await question(
    rl,
    COLORS.yellow + '  代码沙盒模式(默认true，设为false禁用沙盒): ' + COLORS.reset,
  );

  return {
    confirmDangerous: confirmDangerous.trim().toLowerCase() !== 'false',
    sandboxMode: sandboxMode.trim().toLowerCase() !== 'false',
  };
}

/**
 * 保存配置到 .env 文件
 *
 * 字段集、引号格式、邮箱密码加密、文件权限均由 electron/shared/config-writer.js
 * 统一实现，CLI 与桌面端共用，避免再分叉。
 */
function saveEnvConfig(config: any): boolean {
  const dataDir = process.env.COGITO_USER_DATA_DIR || process.cwd();
  const ok = writeEnvConfig(config, { dataDir });
  if (ok) {
    printSuccess('配置已保存到 .env 文件');
  } else {
    printError('保存失败: 写入 .env 文件时出错');
  }
  return ok;
}

/**
 * 运行设置向导
 * 返回配置对象
 */
async function runSetup(): Promise<any> {
  printSetupBanner();

  // 检查环境变量配置
  const hasEnvConfig = checkEnvConfig();

  if (hasEnvConfig) {
    printSuccess('已检测到 .env 环境变量配置！');
    printTip('配置将保存到 .env 文件');
    println('');

    const rl = createInterface();
    const choice = await question(
      rl,
      COLORS.yellow +
        '  是否跳过设置向导，直接使用环境变量？' +
        COLORS.dim +
        ' (y/n): ' +
        COLORS.reset,
    );
    rl.close();

    if (choice.trim().toLowerCase() === 'y' || choice.trim() === '') {
      println('');
      printSuccess('将使用环境变量配置启动程序');
      printTip('如需修改配置，请编辑 .env 文件');
      println('');

      // 加载环境变量配置并返回
      const config = deepMerge(
        DEFAULT_CONFIG as unknown as Record<string, unknown>,
        loadEnvConfig() as unknown as Record<string, unknown>,
      );
      return config;
    }

    println('');
    printInfo('继续使用设置向导...');
    println('');
  }

  printTip('配置将保存到 .env 文件');
  printTip('如需修改配置，请直接编辑 .env 文件');
  println('');

  const rl = createInterface();

  // 1. API Base URL
  printStepTitle(1, '输入 API Base URL');
  printTip('例如: https://api.openai.com/v1 或 https://api.moark.com/v1');
  println('');
  const baseURL = await question(rl, COLORS.yellow + '  请输入: ' + COLORS.reset);
  if (!baseURL.trim()) {
    printError('Base URL 不能为空！');
    rl.close();
    return null;
  }
  println('');

  // 2. API 密钥
  printStepTitle(2, '输入 API 密钥');
  printTip('您的 API Key，用于访问 AI 服务');
  println('');
  const apiKey = await question(rl, COLORS.yellow + '  请输入: ' + COLORS.reset);
  if (!apiKey.trim()) {
    printError('密钥不能为空！');
    rl.close();
    return null;
  }
  println('');

  // 3. 模型名称
  printStepTitle(3, '输入模型名称');
  printTip('例如: gpt-4o 或 DeepSeek-V4-Flash');
  println('');
  const model = await question(rl, COLORS.yellow + '  请输入: ' + COLORS.reset);
  if (!model.trim()) {
    printError('模型名称不能为空！');
    rl.close();
    return null;
  }
  println('');

  // 4. 工作区路径
  printStepTitle(4, '输入工作区路径');
  printTip(`例如: ${os.homedir()} 或 /home/user/projects`);
  println('');
  const workspace = await question(rl, COLORS.yellow + '  请输入: ' + COLORS.reset);
  const workspacePath = workspace.trim() || os.homedir();
  // 确保路径以分隔符结尾
  const normalizedWorkspace =
    workspacePath.endsWith(path.sep) || workspacePath.endsWith('/')
      ? workspacePath
      : workspacePath + path.sep;
  printInfo(`工作区: ${normalizedWorkspace}`);
  println('');

  // 5. 思考间隔配置（可选）
  const thinkingInterval = await configureThinkingInterval(rl);
  println('');

  // 6. 启动模式配置（可选）
  const mode = await configureMode(rl);
  println('');

  // 7. 邮件配置（可选）
  const emailConfig = await configureEmail(rl);
  println('');

  // 8. OCR 配置（可选）
  const ocrConfig = await configureOCR(rl);
  println('');

  // 9. 视觉分析配置（可选）
  const visionConfig = await configureVision(rl);
  println('');

  // 10. 代码执行配置（可选）
  const codeConfig = await configureCode(rl);
  println('');

  // 11. 安全配置（可选）
  const securityConfig = await configureSecurity(rl);

  rl.close();

  // 构建配置
  // 注意：email/code 字段名映射为正式 Config 类型（EmailConfig/CodeConfig），
  // 此前直接放入 EmailSetupConfig（host/port）和 CodeSetupConfig（timeout/maxOutput），
  // 字段名与正式类型不一致，直接消费该返回对象的代码会拿到错误字段名。
  const config = {
    ...DEFAULT_CONFIG,
    api: {
      provider: 'custom',
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
    },
    search: {
      enabled: true,
      baseURL: '',
      recencyFilter: '',
      siteFilter: '',
    },
    workspace: normalizedWorkspace,
    thinkingInterval,
    mode,
    email: emailConfig
      ? {
          smtpHost: emailConfig.host,
          smtpPort: emailConfig.port,
          user: emailConfig.user,
          password: emailConfig.password,
          from: emailConfig.from,
        }
      : undefined,
    ocr: ocrConfig,
    vision: visionConfig,
    code: codeConfig
      ? {
          maxExecutionTime: codeConfig.timeout,
          maxOutputSize: codeConfig.maxOutput,
        }
      : undefined,
    security: securityConfig,
  };

  // 保存到 .env 文件
  println('');
  printDivider('─', 'cyan');
  println('');

  const saved = saveEnvConfig(config);
  if (saved) {
    printCompleteBanner();
    printTip('如需修改配置，请编辑 .env 文件');
    printTip('人设可在进入 Dashboard 后自由选择');
  } else {
    printError('配置保存失败，请检查目录权限');
  }

  return saved ? config : null;
}

export { runSetup };
