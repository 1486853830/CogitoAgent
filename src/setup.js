/**
 * 首次设置引导模块
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG, loadEnvConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.log('\n【第5步】请选择人设:\n');
  console.log('  0 - 不使用人设（使用默认行为）\n');
  
  personas.forEach((p, i) => {
    console.log(`  ${i + 1} - ${p.firstLine} (${p.name})`);
  });
  console.log('');
  
  const answer = await question(rl, '请输入编号或名称: ');
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
    console.log('✅ 配置已保存到 .env 文件');
    return true;
  } catch (e) {
    console.log(`❌ 保存失败: ${e.message}`);
    return false;
  }
}

/**
 * 运行设置向导
 * 返回配置对象
 */
async function runSetup() {
  console.log('\n========== CogitoAgent 首次设置 ==========\n');
  
  // 检查环境变量配置
  const hasEnvConfig = checkEnvConfig();
  
  if (hasEnvConfig) {
    console.log('✅ 已检测到 .env 环境变量配置！');
    console.log('   配置将保存到 .env 文件\n');
    
    const rl = createInterface();
    const choice = await question(rl, '是否跳过设置向导，直接使用环境变量？(y/n): ');
    rl.close();
    
    if (choice.trim().toLowerCase() === 'y' || choice.trim() === '') {
      console.log('\n✅ 将使用环境变量配置启动程序');
      console.log('   如需修改配置，请编辑 .env 文件\n');
      
      // 加载环境变量配置并返回
      const config = {
        ...DEFAULT_CONFIG,
        ...loadEnvConfig()
      };
      return config;
    }
    
    console.log('\n继续使用设置向导...\n');
  }

  console.log('欢迎使用 CogitoAgent！让我来帮你完成初始配置。\n');
  console.log('提示：配置将保存到 .env 文件\n');
  console.log('      如需修改配置，请直接编辑 .env 文件\n\n');

  const rl = createInterface();

  // 1. API Base URL
  const baseURL = await question(rl, '【第1步】请输入 API Base URL (如 https://api.moark.com/v1): ');
  if (!baseURL.trim()) {
    console.log('  Base URL 不能为空！');
    rl.close();
    return null;
  }
  console.log('');

  // 2. API 密钥
  const apiKey = await question(rl, '【第2步】请输入 API 密钥: ');
  if (!apiKey.trim()) {
    console.log('  密钥不能为空！');
    rl.close();
    return null;
  }
  console.log('');

  // 3. 模型名称
  const model = await question(rl, '【第3步】请输入模型名称 (如 DeepSeek-V4-Flash): ');
  if (!model.trim()) {
    console.log('  模型名称不能为空！');
    rl.close();
    return null;
  }
  console.log('');

  // 4. 工作区路径
  const workspace = await question(rl, '【第4步】请输入工作区路径 (如 D:\\ 或 D:\\my-project\\): ');
  const workspacePath = workspace.trim() || 'D:\\';
  // 确保路径以 \\ 结尾
  const normalizedWorkspace = workspacePath.endsWith('\\') || workspacePath.endsWith('/')
    ? workspacePath
    : workspacePath + '\\';
  console.log(`  工作区: ${normalizedWorkspace}\n`);

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
  const saved = saveEnvConfig(config);
  if (saved) {
    // 应用人设
    if (selectedPersona) {
      if (applyPersona(selectedPersona)) {
        console.log(`✅ 已应用人设: ${selectedPersona.firstLine}`);
      } else {
        console.log('⚠️ 人设应用失败，将使用默认行为');
      }
    } else {
      console.log('ℹ️ 未选择人设，使用默认行为');
    }
    
    console.log('\n设置完成！重新运行程序即可开始使用。\n');
    console.log('提示：如需修改配置，请编辑 .env 文件\n');
  } else {
    console.log('❌ 配置保存失败，请检查目录权限。\n');
  }

  return saved ? config : null;
}

export { runSetup };
