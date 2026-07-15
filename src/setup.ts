/**
 * 首次设置引导模块 - 艺术化终端设计
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG, loadEnvConfig } from './config.ts';

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

interface PersonaInfo {
  name: string;
  firstLine: string;
  filename: string;
}

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
 * 打印标题框
 */
function printTitleBox(title: string, subtitle = ''): void {
  const width = 60;
  println(COLORS.cyan + COLORS.bold + '╔' + '═'.repeat(width) + '╗' + COLORS.reset);
  
  if (subtitle) {
    const subPad = Math.max(0, width - subtitle.length - 2);
    println(COLORS.cyan + '║ ' + COLORS.yellow + subtitle + ' '.repeat(subPad) + ' ║' + COLORS.reset);
  }
  
  const titlePad = Math.max(0, width - title.length - 2);
  println(COLORS.cyan + '║ ' + COLORS.bold + COLORS.white + title + ' '.repeat(titlePad) + ' ║' + COLORS.reset);
  println(COLORS.cyan + '╚' + '═'.repeat(width) + '╝' + COLORS.reset);
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
  println(COLORS.green + COLORS.bold + '╔══════════════════════════════════════════════════════════════╗' + COLORS.reset);
  println(COLORS.green + '║' + COLORS.reset + '                                                              ' + COLORS.green + '║' + COLORS.reset);
  println(COLORS.green + '║' + COLORS.reset + '     ' + COLORS.bold + COLORS.white + '🎉 设置完成！' + COLORS.reset + '                                      ' + COLORS.green + '║' + COLORS.reset);
  println(COLORS.green + '║' + COLORS.reset + '                                                              ' + COLORS.green + '║' + COLORS.reset);
  println(COLORS.green + '║' + COLORS.reset + '     ' + COLORS.cyan + '重新运行程序即可开始使用 CogitoAgent' + COLORS.reset + '              ' + COLORS.green + '║' + COLORS.reset);
  println(COLORS.green + '║' + COLORS.reset + '                                                              ' + COLORS.green + '║' + COLORS.reset);
  println(COLORS.green + COLORS.bold + '╚══════════════════════════════════════════════════════════════╝' + COLORS.reset);
  println('');
}

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl: readline.Interface, text: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(text, answer => {
      resolve(answer);
    });
  });
}

/**
 * 检查环境变量是否已配置
 */
function checkEnvConfig(): boolean {
  const envConfig = loadEnvConfig();
  const hasApiConfig = !!(envConfig.api && 
    (envConfig.api.apiKey || envConfig.api.baseURL || envConfig.api.model));
  return hasApiConfig;
}

/**
 * 获取可用的人设列表
 */
function getAvailablePersonas(): PersonaInfo[] {
  const personasDir = path.join(__dirname, '..', 'personas');
  const personas: PersonaInfo[] = [];
  
  try {
    const dirs = fs.readdirSync(personasDir, { withFileTypes: true })
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name);
    for (const dir of dirs) {
      const personaPath = path.join(personasDir, dir, 'persona.md');
      if (fs.existsSync(personaPath)) {
        const content = fs.readFileSync(personaPath, 'utf-8');
        const firstLine = content.split('\n')[0].replace(/^#\s*/, '').trim();
        personas.push({ name: dir, firstLine, filename: `${dir}/persona.md` });
      }
    }
  } catch (e) {
    // 目录不存在，使用默认
  }
  
  return personas;
}

/**
 * 选择人设
 */
async function selectPersona(rl: readline.Interface, personas: PersonaInfo[]): Promise<PersonaInfo | null> {
  printStepTitle(5, '选择人设');
  println('');
  println(COLORS.dim + '  0 - 不使用人设（使用默认行为）' + COLORS.reset);
  println('');
  
  personas.forEach((p, i) => {
    println(COLORS.white + `  ${i + 1} - ` + COLORS.cyan + p.firstLine + COLORS.dim + ` (${p.name})` + COLORS.reset);
  });
  println('');
  
  const answer = await question(rl, COLORS.yellow + '  请输入编号或名称: ' + COLORS.reset);
  const trimmed = answer.trim();
  
  if (trimmed === '0' || trimmed === '') {
    return null;
  }
  
  // 按编号选择
  const num = parseInt(trimmed);
  if (!isNaN(num) && num >= 1 && num <= personas.length) {
    return personas[num - 1];
  }
  
  // 按名称选择
  const found = personas.find(p => 
    p.name.toLowerCase() === trimmed.toLowerCase() ||
    p.firstLine.toLowerCase().includes(trimmed.toLowerCase())
  );
  
  return found || null;
}

/**
 * 配置思考间隔
 */
async function configureThinkingInterval(rl: readline.Interface): Promise<number> {
  printStepTitle(6, '思考间隔配置（可选）');
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
  println(COLORS.dim + '  按回车使用默认值: desktop' + COLORS.reset);
  println('');
  
  const answer = await question(rl, COLORS.yellow + '  请输入模式编号: ' + COLORS.reset);
  const trimmed = answer.trim();
  
  if (!trimmed) {
    return 'desktop';
  }
  
  if (trimmed === '1' || trimmed.toLowerCase() === 'desktop') {
    return 'desktop';
  }
  if (trimmed === '2' || trimmed.toLowerCase() === 'dashboard') {
    return 'dashboard';
  }
  
  printWarning('无效值，使用默认值 desktop');
  return 'desktop';
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
    port: port.trim() ? parseInt(port.trim(), 10) : 587,
    user: user.trim(),
    password: password.trim(),
    from: from.trim()
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
  
  const answer = await question(rl, COLORS.yellow + '  是否配置独立的 OCR 服务？(y/n): ' + COLORS.reset);
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
    model: model.trim() || 'Qwen2.5-VL-32B-Instruct',
    provider: provider.trim()
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
  
  const answer = await question(rl, COLORS.yellow + '  是否配置独立的视觉分析服务？(y/n): ' + COLORS.reset);
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
    model: model.trim() || 'Qwen2.5-VL-32B-Instruct'
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
  
  const answer = await question(rl, COLORS.yellow + '  是否自定义代码执行配置？(y/n): ' + COLORS.reset);
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }
  
  println('');
  printTip('请输入代码执行配置');
  
  const timeout = await question(rl, COLORS.yellow + '  执行超时时间(毫秒，默认30000): ' + COLORS.reset);
  const maxOutput = await question(rl, COLORS.yellow + '  最大输出大小(字符，默认100000): ' + COLORS.reset);
  
  return {
    timeout: timeout.trim() ? parseInt(timeout.trim(), 10) : 30000,
    maxOutput: maxOutput.trim() ? parseInt(maxOutput.trim(), 10) : 100000
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
  
  const confirmDangerous = await question(rl, COLORS.yellow + '  危险操作确认(默认true，设为false跳过确认): ' + COLORS.reset);
  const sandboxMode = await question(rl, COLORS.yellow + '  代码沙盒模式(默认true，设为false禁用沙盒): ' + COLORS.reset);
  
  return {
    confirmDangerous: confirmDangerous.trim().toLowerCase() !== 'false',
    sandboxMode: sandboxMode.trim().toLowerCase() !== 'false'
  };
}

/**
 * 应用选择的人设
 */
function applyPersona(persona: PersonaInfo | null): boolean {
  if (!persona) return false;
  
  const srcPath = path.join(__dirname, '..', 'personas', persona.filename);
  const destPath = path.join(__dirname, '..', 'persona.md');
  
  try {
    fs.copyFileSync(srcPath, destPath);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 保存配置到 .env 文件
 */
function saveEnvConfig(config: any): boolean {
  const envPath = path.join(__dirname, '..', '.env');
  
  const lines = [
    '# CogitoAgent 配置文件',
    '# 由设置向导自动生成',
    '',
    '# ============================================',
    '# API 配置（必需）',
    '# ============================================',
    '',
    '# API 密钥（必需）',
    `COGITO_API_KEY=${config.api?.apiKey || ''}`,
    '',
    '# API 服务地址（可选，默认根据 provider 自动设置）',
    `COGITO_API_BASE_URL=${config.api?.baseURL || ''}`,
    '',
    '# API 服务商名称（可选，支持: openai, moark, anthropic, google）',
    `COGITO_API_PROVIDER=${config.api?.provider || 'custom'}`,
    '',
    '# 模型名称（可选）',
    `COGITO_MODEL=${config.api?.model || ''}`,
    '',
    '# ============================================',
    '# 思考间隔配置（可选）',
    '# ============================================',
    '',
    '# 自动思考间隔时间（毫秒），最小值 1000',
    `COGITO_THINKING_INTERVAL=${config.thinkingInterval || 3000}`,
    '',
    '# ============================================',
    '# 启动模式配置（可选）',
    '# ============================================',
    '',
    '# 启动模式: desktop（桌面宠物模式）/ dashboard（工作台模式）',
    `COGITO_MODE=${config.mode || 'desktop'}`,
    '',
    '# ============================================',
    '# 数据库配置（可选）',
    '# ============================================',
    '',
    '# SQLite 数据库文件路径',
    `COGITO_DATABASE_PATH=${config.database?.path || './data/example.db'}`,
    '',
    '# ============================================',
    '# 邮件配置（可选）',
    '# ============================================',
    '',
    '# SMTP 服务器地址',
    `COGITO_EMAIL_HOST=${config.email?.host || ''}`,
    '',
    '# SMTP 端口',
    `COGITO_EMAIL_PORT=${config.email?.port || 587}`,
    '',
    '# 邮箱用户名',
    `COGITO_EMAIL_USER=${config.email?.user || ''}`,
    '',
    '# 邮箱密码',
    `COGITO_EMAIL_PASSWORD=${config.email?.password || ''}`,
    '',
    '# 发件人邮箱地址',
    `COGITO_EMAIL_FROM=${config.email?.from || ''}`,
    '',
    '# ============================================',
    '# OCR 图像文字识别配置（可选）',
    '# ============================================',
    '',
    '# OCR API 密钥',
    `COGITO_OCR_API_KEY=${config.ocr?.apiKey || ''}`,
    '',
    '# OCR API 服务地址',
    `COGITO_OCR_API_BASE_URL=${config.ocr?.baseURL || ''}`,
    '',
    '# OCR 模型名称',
    `COGITO_OCR_MODEL=${config.ocr?.model || 'Qwen2.5-VL-32B-Instruct'}`,
    '',
    '# OCR 服务商名称',
    `COGITO_OCR_PROVIDER=${config.ocr?.provider || ''}`,
    '',
    '# ============================================',
    '# 视觉分析配置（可选）',
    '# ============================================',
    '',
    '# 视觉分析 API 密钥（可选，默认回退到 COGITO_API_KEY）',
    `COGITO_VISION_API_KEY=${config.vision?.apiKey || ''}`,
    '',
    '# 视觉分析 API 服务地址（可选，默认使用 COGITO_API_BASE_URL）',
    `COGITO_VISION_API_BASE_URL=${config.vision?.baseURL || ''}`,
    '',
    '# 视觉模型名称（可选，默认 Qwen2.5-VL-32B-Instruct）',
    `COGITO_VISION_MODEL=${config.vision?.model || 'Qwen2.5-VL-32B-Instruct'}`,
    '',
    '# ============================================',
    '# 代码执行配置（可选）',
    '# ============================================',
    '',
    '# 代码执行超时时间（毫秒）',
    `COGITO_CODE_TIMEOUT=${config.code?.timeout || 30000}`,
    '',
    '# 代码输出最大大小（字符）',
    `COGITO_CODE_MAX_OUTPUT=${config.code?.maxOutput || 100000}`,
    '',
    '# ============================================',
    '# 安全配置（可选）',
    '# ============================================',
    '',
    '# 是否启用危险操作确认（默认启用）',
    `COGITO_CONFIRM_DANGEROUS=${config.security?.confirmDangerous !== false ? 'true' : 'false'}`,
    '',
    '# 是否启用代码沙盒模式（默认启用）',
    `COGITO_SANDBOX_MODE=${config.security?.sandboxMode !== false ? 'true' : 'false'}`,
    '',
    '# ============================================',
    '# 工作区配置（可选）',
    '# ============================================',
    '',
    '# 工作区根路径',
    `COGITO_WORKSPACE=${config.workspace || ''}`,
    '',
    '# ============================================',
    '# 人设配置（可选）',
    '# ============================================',
    '',
    '# 人设名称（对应 personas/ 目录下的文件夹名称）',
    `COGITO_PERSONA=${config.persona || ''}`,
  ];
  
  try {
    fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
    printSuccess('配置已保存到 .env 文件');
    return true;
  } catch (e) {
    printError(`保存失败: ${(e as Error).message}`);
    return false;
  }
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
    const choice = await question(rl, COLORS.yellow + '  是否跳过设置向导，直接使用环境变量？' + COLORS.dim + ' (y/n): ' + COLORS.reset);
    rl.close();
    
    if (choice.trim().toLowerCase() === 'y' || choice.trim() === '') {
      println('');
      printSuccess('将使用环境变量配置启动程序');
      printTip('如需修改配置，请编辑 .env 文件');
      println('');
      
      // 加载环境变量配置并返回
      const config = {
        ...DEFAULT_CONFIG,
        ...loadEnvConfig()
      };
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
  const normalizedWorkspace = workspacePath.endsWith(path.sep) || workspacePath.endsWith('/')
    ? workspacePath
    : workspacePath + path.sep;
  printInfo(`工作区: ${normalizedWorkspace}`);
  println('');

  // 5. 人设选择
  const personas = getAvailablePersonas();
  const selectedPersona = await selectPersona(rl, personas);
  println('');

  // 6. 思考间隔配置（可选）
  const thinkingInterval = await configureThinkingInterval(rl);
  println('');

  // 7. 启动模式配置（可选）
  const mode = await configureMode(rl);
  println('');

  // 8. 邮件配置（可选）
  const emailConfig = await configureEmail(rl);
  println('');

  // 9. OCR 配置（可选）
  const ocrConfig = await configureOCR(rl);
  println('');

  // 10. 视觉分析配置（可选）
  const visionConfig = await configureVision(rl);
  println('');

  // 11. 代码执行配置（可选）
  const codeConfig = await configureCode(rl);
  println('');

  // 12. 安全配置（可选）
  const securityConfig = await configureSecurity(rl);

  rl.close();

  // 构建配置
  const config = {
    ...DEFAULT_CONFIG,
    api: {
      provider: 'custom',
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      model: model.trim()
    },
    search: {
      enabled: true,
      baseURL: '',
      recencyFilter: '',
      siteFilter: ''
    },
    workspace: normalizedWorkspace,
    thinkingInterval,
    mode,
    email: emailConfig,
    ocr: ocrConfig,
    vision: visionConfig,
    code: codeConfig,
    security: securityConfig,
    persona: selectedPersona?.name || ''
  };

  // 保存到 .env 文件
  println('');
  printDivider('─', 'cyan');
  println('');
  
  const saved = saveEnvConfig(config);
  if (saved) {
    // 应用人设
    if (selectedPersona) {
      if (applyPersona(selectedPersona)) {
        printSuccess(`已应用人设: ${selectedPersona.firstLine}`);
      } else {
        printWarning('人设应用失败，将使用默认行为');
      }
    } else {
      printInfo('未选择人设，使用默认行为');
    }
    
    printCompleteBanner();
    printTip('如需修改配置，请编辑 .env 文件');
  } else {
    printError('配置保存失败，请检查目录权限');
  }

  return saved ? config : null;
}

export { runSetup };
