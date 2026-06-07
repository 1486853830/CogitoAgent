/**
 * 首次设置引导模块
 */

import readline from 'readline';
import { saveConfig, DEFAULT_CONFIG } from './config.js';

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
    console.log('\n设置完成！重新运行程序即可开始使用。\n');
  } else {
    console.log('❌ 配置保存失败，请检查目录权限。\n');
  }

  return saved ? config : null;
}

export { runSetup };
