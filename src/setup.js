/**
 * 首次设置引导模块
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveConfig, DEFAULT_CONFIG } from './config.js';

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
 * 运行设置向导
 * 返回配置对象
 */
async function runSetup() {
  console.log('\n========== CogitoAgent 首次设置 ==========\n');
  console.log('欢迎使用 CogitoAgent！让我来帮你完成初始配置。\n');

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

  // 保存
  const saved = saveConfig(config);
  if (saved) {
    console.log('✅ 配置已保存到 config.json');
    
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
  } else {
    console.log('❌ 配置保存失败，请检查目录权限。\n');
  }

  return saved ? config : null;
}

export { runSetup };
