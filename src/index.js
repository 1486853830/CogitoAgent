/**
 * CogitoAgent - 入口文件
 */

// 加载环境变量（必须在其他模块之前）
import 'dotenv/config';

import { isConfigured } from './config.js';
import { runSetup } from './setup.js';
import { start } from './agent/Agent.js';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 在浏览器中打开欢迎页面
 */
function openWelcomePage() {
  const introPath = path.join(__dirname, '..', 'introduction', 'index.html');
  const url = `file://${introPath}`;
  
  // 检测操作系统并使用对应的打开命令
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  
  let cmd;
  if (isWindows) {
    cmd = `start "" "${url}"`;
  } else if (isMac) {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  
  exec(cmd, (err) => {
    if (err) {
      console.error('打开欢迎页面失败:', err.message);
    }
  });
}

async function main() {
  console.log('CogitoAgent 项目初始化...\n');

  // 检查是否已配置
  if (!isConfigured()) {
    console.log('首次使用，正在打开欢迎页面...\n');
    // 打开欢迎页面
    openWelcomePage();
    
    console.log('正在进行配置...\n');
    const config = await runSetup();
    if (!config) {
      console.log('配置未完成，程序退出。');
      process.exit(1);
    }
    // 配置完成后直接启动，不需要重新运行
    console.log('配置完成，正在启动 CogitoAgent...\n');
  }

  // 启动智能体
  start().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}

main();
