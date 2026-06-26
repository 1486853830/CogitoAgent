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
  const introPath = path.join(__dirname, '..', 'index.html');
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

  // CLI 模式或 Electron 模式：配置完成后直接启动
  const shouldAutoStart = process.env.ELECTRON_MODE || process.env.CLI_MODE;

  // 检查是否已配置
  if (!isConfigured()) {
    // CLI 模式：使用命令行配置向导
    if (process.env.CLI_MODE) {
      console.log('首次使用，正在进行配置...\n');
      const config = await runSetup();
      if (!config) {
        console.log('配置未完成，程序退出。');
        process.exit(1);
      }
      console.log('配置完成！正在启动...\n');
    } else if (process.env.ELECTRON_MODE) {
      // Electron 模式：配置由 GUI 完成，这里不应该发生
      console.log('等待 Electron 配置向导完成...\n');
      // Electron 模式下，如果未配置，说明配置向导还没完成
      // Agent 进程会等待配置完成后重启
      process.exit(0);
    } else {
      // 普通模式：打开欢迎页面，然后命令行配置
      console.log('首次使用，正在打开欢迎页面...\n');
      openWelcomePage();

      console.log('正在进行配置...\n');
      const config = await runSetup();
      if (!config) {
        console.log('配置未完成，程序退出。');
        process.exit(1);
      }
      console.log('配置完成！');
      console.log('\n请使用以下命令启动：');
      console.log('  npm run electron  - 桌面模式（Electron + Agent）');
      console.log('  npm run cli       - 命令行模式');
      process.exit(0);
    }
  }

  // 如果已配置但不是 electron/cli 模式，提示用户
  if (!shouldAutoStart) {
    console.log('配置已完成！请使用以下命令启动：');
    console.log('  npm run electron  - 桌面模式（Electron + Agent）');
    console.log('  npm run cli       - 命令行模式');
    process.exit(0);
  }

  // 启动智能体
  start().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}

main();
