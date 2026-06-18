/**
 * 首次设置引导模块 - 艺术化终端设计
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG, loadEnvConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI 颜色代码
const COLORS = {
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
function print(text, color = null) {
  if (color && COLORS[color]) {
    process.stdout.write(COLORS[color] + text + COLORS.reset);
  } else {
    process.stdout.write(text);
  }
}

/**
 * 打印一行带颜色的文字
 */
function println(text, color = null) {
  print(text, color);
  process.stdout.write('\n');
}

/**
 * 打印分隔线
 */
function printDivider(char = '─', color = 'cyan') {
  const width = process.stdout.columns || 60;
  const colorCode = COLORS[color] || COLORS.reset;
  println(colorCode + char.repeat(width) + COLORS.reset);
}

/**
 * 打印标题框
 */
function printTitleBox(title, subtitle = '') {
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
function printStepTitle(stepNum, title) {
  println('');
  printDivider('─', 'cyan');
  println(COLORS.cyan + COLORS.bold + `  【第${stepNum}步】` + COLORS.white + title + COLORS.reset);
  printDivider('─', 'cyan');
}

/**
 * 打印成功消息
 */
function printSuccess(text) {
  println(COLORS.green + COLORS.bold + '  ✅ ' + text + COLORS.reset);
}

/**
 * 打印警告消息
 */
function printWarning(text) {
  println(COLORS.yellow + '  ⚠️  ' + text + COLORS.reset);
}

/**
 * 打印信息消息
 */
function printInfo(text) {
  println(COLORS.blue + '  ℹ️  ' + text + COLORS.reset);
}

/**
 * 打印错误消息
 */
function printError(text) {
  println(COLORS.red + COLORS.bold + '  ❌ ' + text + COLORS.reset);
}

/**
 * 打印提示消息
 */
function printTip(text) {
  println(COLORS.dim + '  💡 ' + text + COLORS.reset);
}

/**
 * 打印设置向导 Banner
 */
function printSetupBanner() {
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
function printCompleteBanner() {
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

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl, text) {
  return new Promise(resolve => {
    rl.question(text, answer => {
      resolve(answer);
    });
  });
}

/**
 * 检查环境变量是否已配置
 */
function checkEnvConfig() {
  const envConfig = loadEnvConfig();
  const hasApiConfig = envConfig.api && 
    (envConfig.api.apiKey || envConfig.api.baseURL || envConfig.api.model);
  return hasApiConfig;
}

/**
 * 获取可用的人设列表
 */
function getAvailablePersonas() {
  const personasDir = path.join(__dirname, '..', 'personas');
  const personas = [];
  
  try {
    const files = fs.readdirSync(personasDir);
    for (const file of files) {
      if (file.endsWith('.md') && file !== 'persona.md') {
        const name = file.replace('.md', '');
        // 读取文件第一行作为中文名
        const content = fs.readFileSync(path.join(personasDir, file), 'utf-8');
        const firstLine = content.split('\n')[0].replace(/^#\s*/, '').trim();
        personas.push({ name, firstLine, filename: file });
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
async function selectPersona(rl, personas) {
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
 * 应用选择的人设
 */
function applyPersona(persona) {
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
function saveEnvConfig(config) {
  const envPath = path.join(__dirname, '..', '.env');
  
  const lines = [
    '# CogitoAgent 配置文件',
    '# 由设置向导自动生成',
    '',
    '# API 配置',
    `COGITO_API_KEY=${config.api?.apiKey || ''}`,
    `COGITO_API_BASE_URL=${config.api?.baseURL || ''}`,
    `COGITO_API_PROVIDER=${config.api?.provider || 'custom'}`,
    `COGITO_MODEL=${config.api?.model || ''}`,
    '',
    '# 工作区配置',
    `COGITO_WORKSPACE=${config.workspace || ''}`,
    '',
    '# 其他配置可在 .env.example 中查看',
  ];
  
  try {
    fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
    printSuccess('配置已保存到 .env 文件');
    return true;
  } catch (e) {
    printError(`保存失败: ${e.message}`);
    return false;
  }
}

/**
 * 运行设置向导
 * 返回配置对象
 */
async function runSetup() {
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
    workspace: normalizedWorkspace
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
