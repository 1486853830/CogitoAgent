import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { DEFAULT_CONFIG, loadEnvConfig } from './config.ts';
import { println, print, COLORS, printBanner } from './io/terminal.ts';

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

function checkEnvConfig(): boolean {
  const envConfig = loadEnvConfig();
  const hasApiConfig = !!(
    envConfig.api &&
    (envConfig.api.apiKey || envConfig.api.baseURL || envConfig.api.model)
  );
  return hasApiConfig;
}

function getAvailablePersonas(): PersonaInfo[] {
  const personasDir = path.join(process.cwd(), 'personas');
  const personas: PersonaInfo[] = [];

  try {
    const dirs = fs
      .readdirSync(personasDir, { withFileTypes: true })
      .filter((dir) => dir.isDirectory())
      .map((dir) => dir.name);
    for (const dir of dirs) {
      const personaPath = path.join(personasDir, dir, 'persona.md');
      if (fs.existsSync(personaPath)) {
        const content = fs.readFileSync(personaPath, 'utf-8');
        const firstLine = content.split('\n')[0].replace(/^#\s*/, '').trim();
        personas.push({ name: dir, firstLine, filename: `${dir}/persona.md` });
      }
    }
  } catch (e) {
  }

  return personas;
}

async function selectPersona(
  rl: readline.Interface,
  personas: PersonaInfo[],
): Promise<PersonaInfo | null> {
  println('');
  println(`[5] 选择人设`, 'claudeBright');
  println('');
  println(`  0 - 不使用人设`, 'dimGray');
  println('');

  personas.forEach((p, i) => {
    println(`  ${i + 1} - ${p.firstLine} (${p.name})`, 'gray');
  });
  println('');

  const answer = await question(rl, '请输入编号或名称: ');
  const trimmed = answer.trim();

  if (trimmed === '0' || trimmed === '') {
    return null;
  }

  const num = parseInt(trimmed);
  if (!isNaN(num) && num >= 1 && num <= personas.length) {
    return personas[num - 1];
  }

  const found = personas.find(
    (p) =>
      p.name.toLowerCase() === trimmed.toLowerCase() ||
      p.firstLine.toLowerCase().includes(trimmed.toLowerCase()),
  );

  return found || null;
}

async function configureThinkingInterval(rl: readline.Interface): Promise<number> {
  println('');
  println('[6] 思考间隔配置', 'claudeBright');
  println('');
  println('  AI 自动思考的时间间隔，单位毫秒，最小值 1000', 'dimGray');
  println('  按回车使用默认值: 3000', 'dimGray');
  println('');

  const answer = await question(rl, '请输入思考间隔: ');
  const trimmed = answer.trim();

  if (!trimmed) {
    return 3000;
  }

  const interval = parseInt(trimmed, 10);
  if (!isNaN(interval) && interval >= 1000) {
    return interval;
  }

  println('无效值，使用默认值 3000', 'yellow');
  return 3000;
}

async function configureMode(rl: readline.Interface): Promise<string> {
  println('');
  println('[7] 启动模式配置', 'claudeBright');
  println('');
  println('  1 - desktop（桌面宠物模式）', 'white');
  println('  2 - dashboard（工作台模式）', 'white');
  println('  按回车使用默认值: dashboard', 'dimGray');
  println('');

  const answer = await question(rl, '请输入模式编号: ');
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

  println('无效值，使用默认值 dashboard', 'yellow');
  return 'dashboard';
}

async function configureEmail(rl: readline.Interface): Promise<EmailSetupConfig | null> {
  println('');
  println('[8] 邮件配置（可选）', 'claudeBright');
  println('');
  println('  按回车跳过此配置', 'dimGray');
  println('');

  const answer = await question(rl, '是否配置邮件服务？(y/n): ');
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  println('请输入邮件服务配置', 'dimGray');

  const host = await question(rl, 'SMTP服务器地址: ');
  const port = await question(rl, 'SMTP端口: ');
  const user = await question(rl, '邮箱用户名: ');
  const password = await question(rl, '邮箱密码: ');
  const from = await question(rl, '发件人地址: ');

  return {
    host: host.trim(),
    port: port.trim() ? parseInt(port.trim(), 10) : 587,
    user: user.trim(),
    password: password.trim(),
    from: from.trim(),
  };
}

async function configureOCR(rl: readline.Interface): Promise<OcrSetupConfig | null> {
  println('');
  println('[9] OCR 图像文字识别配置（可选）', 'claudeBright');
  println('');
  println('  按回车跳过此配置', 'dimGray');
  println('');

  const answer = await question(
    rl,
    '是否配置独立的 OCR 服务？(y/n): ',
  );
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  println('请输入 OCR 服务配置', 'dimGray');

  const apiKey = await question(rl, 'OCR API Key: ');
  const baseURL = await question(rl, 'OCR API 地址: ');
  const model = await question(rl, 'OCR 模型名称: ');
  const provider = await question(rl, 'OCR 服务商: ');

  return {
    apiKey: apiKey.trim(),
    baseURL: baseURL.trim(),
    model: model.trim() || 'Qwen2.5-VL-32B-Instruct',
    provider: provider.trim(),
  };
}

async function configureVision(rl: readline.Interface): Promise<VisionSetupConfig | null> {
  println('');
  println('[10] 视觉分析配置（可选）', 'claudeBright');
  println('');
  println('  按回车跳过此配置', 'dimGray');
  println('');

  const answer = await question(
    rl,
    '是否配置独立的视觉分析服务？(y/n): ',
  );
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  println('请输入视觉分析服务配置', 'dimGray');

  const apiKey = await question(rl, 'Vision API Key: ');
  const baseURL = await question(rl, 'Vision API 地址: ');
  const model = await question(rl, 'Vision 模型名称: ');

  return {
    apiKey: apiKey.trim(),
    baseURL: baseURL.trim(),
    model: model.trim() || 'Qwen2.5-VL-32B-Instruct',
  };
}

async function configureCode(rl: readline.Interface): Promise<CodeSetupConfig | null> {
  println('');
  println('[11] 代码执行配置（可选）', 'claudeBright');
  println('');
  println('  按回车跳过此配置', 'dimGray');
  println('');

  const answer = await question(
    rl,
    '是否自定义代码执行配置？(y/n): ',
  );
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  println('请输入代码执行配置', 'dimGray');

  const timeout = await question(
    rl,
    '执行超时时间(毫秒，默认30000): ',
  );
  const maxOutput = await question(
    rl,
    '最大输出大小(字符，默认100000): ',
  );

  return {
    timeout: timeout.trim() ? parseInt(timeout.trim(), 10) : 30000,
    maxOutput: maxOutput.trim() ? parseInt(maxOutput.trim(), 10) : 100000,
  };
}

async function configureSecurity(rl: readline.Interface): Promise<SecuritySetupConfig | null> {
  println('');
  println('[12] 安全配置（可选）', 'claudeBright');
  println('');
  println('  按回车跳过此配置', 'dimGray');
  println('');

  const answer = await question(rl, '是否自定义安全配置？(y/n): ');
  if (answer.trim().toLowerCase() !== 'y') {
    return null;
  }

  println('');
  println('请输入安全配置', 'dimGray');

  const confirmDangerous = await question(
    rl,
    '危险操作确认(默认true，设为false跳过确认): ',
  );
  const sandboxMode = await question(
    rl,
    '代码沙盒模式(默认true，设为false禁用沙盒): ',
  );

  return {
    confirmDangerous: confirmDangerous.trim().toLowerCase() !== 'false',
    sandboxMode: sandboxMode.trim().toLowerCase() !== 'false',
  };
}

function applyPersona(persona: PersonaInfo | null): boolean {
  if (!persona) return false;

  const srcPath = path.join(process.cwd(), 'personas', persona.filename);
  const destPath = path.join(process.cwd(), 'persona.md');

  try {
    fs.copyFileSync(srcPath, destPath);
    return true;
  } catch (e) {
    return false;
  }
}

function saveEnvConfig(config: any): boolean {
  const dataDir = process.env.COGITO_USER_DATA_DIR || process.cwd();
  const envPath = path.join(dataDir, '.env');

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
    try {
      if (process.platform === 'win32') {
        execFileSync(
          'icacls',
          [envPath, '/inheritance:r', '/grant:r', `${os.userInfo().username}:RW`],
          { windowsHide: true },
        );
      } else {
        fs.chmodSync(envPath, 0o600);
      }
    } catch {
      println('无法设置 .env 文件权限，建议手动限制访问', 'yellow');
    }
    println('配置已保存到 .env 文件', 'success');
    return true;
  } catch (e) {
    println(`保存失败: ${(e as Error).message}`, 'red');
    return false;
  }
}

async function runSetup(): Promise<any> {
  printBanner();
  println('CogitoAgent 设置向导', 'claudeBright');
  println('');

  const hasEnvConfig = checkEnvConfig();

  if (hasEnvConfig) {
    println('已检测到 .env 环境变量配置!', 'success');
    println('配置将保存到 .env 文件', 'dimGray');
    println('');

    const rl = createInterface();
    const choice = await question(
      rl,
      '是否跳过设置向导，直接使用环境变量？ (y/n): ',
    );
    rl.close();

    if (choice.trim().toLowerCase() === 'y' || choice.trim() === '') {
      println('');
      println('将使用环境变量配置启动程序', 'success');
      println('如需修改配置，请编辑 .env 文件', 'dimGray');
      println('');

      const config = {
        ...DEFAULT_CONFIG,
        ...loadEnvConfig(),
      };
      return config;
    }

    println('继续使用设置向导...', 'gray');
    println('');
  }

  println('配置将保存到 .env 文件', 'dimGray');
  println('如需修改配置，请直接编辑 .env 文件', 'dimGray');
  println('');

  const rl = createInterface();

  println('[1] 输入 API Base URL', 'claudeBright');
  println('例如: https://api.openai.com/v1 或 https://api.moark.com/v1', 'dimGray');
  println('');
  const baseURL = await question(rl, '请输入: ');
  if (!baseURL.trim()) {
    println('Base URL 不能为空!', 'red');
    rl.close();
    return null;
  }
  println('');

  println('[2] 输入 API 密钥', 'claudeBright');
  println('您的 API Key，用于访问 AI 服务', 'dimGray');
  println('');
  const apiKey = await question(rl, '请输入: ');
  if (!apiKey.trim()) {
    println('密钥不能为空!', 'red');
    rl.close();
    return null;
  }
  println('');

  println('[3] 输入模型名称', 'claudeBright');
  println('例如: gpt-4o 或 DeepSeek-V4-Flash', 'dimGray');
  println('');
  const model = await question(rl, '请输入: ');
  if (!model.trim()) {
    println('模型名称不能为空!', 'red');
    rl.close();
    return null;
  }
  println('');

  println('[4] 输入工作区路径', 'claudeBright');
  println(`例如: ${os.homedir()} 或 /home/user/projects`, 'dimGray');
  println('');
  const workspace = await question(rl, '请输入: ');
  const workspacePath = workspace.trim() || os.homedir();
  const normalizedWorkspace =
    workspacePath.endsWith(path.sep) || workspacePath.endsWith('/')
      ? workspacePath
      : workspacePath + path.sep;
  println(`工作区: ${normalizedWorkspace}`, 'gray');
  println('');

  const personas = getAvailablePersonas();
  const selectedPersona = await selectPersona(rl, personas);
  println('');

  const thinkingInterval = await configureThinkingInterval(rl);
  println('');

  const mode = await configureMode(rl);
  println('');

  const emailConfig = await configureEmail(rl);
  println('');

  const ocrConfig = await configureOCR(rl);
  println('');

  const visionConfig = await configureVision(rl);
  println('');

  const codeConfig = await configureCode(rl);
  println('');

  const securityConfig = await configureSecurity(rl);

  rl.close();

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
    email: emailConfig,
    ocr: ocrConfig,
    vision: visionConfig,
    code: codeConfig,
    security: securityConfig,
    persona: selectedPersona?.name || '',
  };

  println('');

  const saved = saveEnvConfig(config);
  if (saved) {
    if (selectedPersona) {
      if (applyPersona(selectedPersona)) {
        println(`已应用人设: ${selectedPersona.firstLine}`, 'success');
      } else {
        println('人设应用失败，将使用默认行为', 'yellow');
      }
    } else {
      println('未选择人设，使用默认行为', 'gray');
    }

    println('设置完成!', 'success');
    println('');
    println('重新运行程序即可开始使用 CogitoAgent', 'claudeBright');
    println('如需修改配置，请编辑 .env 文件', 'dimGray');
    println('');
  } else {
    println('配置保存失败，请检查目录权限', 'red');
  }

  return saved ? config : null;
}

export { runSetup };