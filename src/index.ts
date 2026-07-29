import 'dotenv/config';

import { isConfigured } from './config.ts';
import { runSetup } from './setup.ts';
import { start } from './agent/Agent.ts';
import { exec } from 'child_process';
import path from 'path';

function openWelcomePage(): void {
  const introPath = path.join(process.cwd(), 'index.html');
  const url = `file://${introPath}`;

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  let cmd: string;
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

async function main(): Promise<void> {
  console.log('CogitoAgent 项目初始化...\n');

  const shouldAutoStart = process.env.ELECTRON_MODE || process.env.CLI_MODE;

  if (!isConfigured()) {
    if (process.env.CLI_MODE) {
      console.log('首次使用，正在进行配置...\n');
      const config = await runSetup();
      if (!config) {
        console.log('配置未完成，程序退出。');
        process.exit(1);
      }
      console.log('配置完成！正在启动...\n');
    } else if (process.env.ELECTRON_MODE) {
      console.log('等待 Electron 配置向导完成...\n');
      process.exit(0);
    } else {
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

  if (!shouldAutoStart) {
    console.log('配置已完成！请使用以下命令启动：');
    console.log('  npm run electron  - 桌面模式（Electron + Agent）');
    console.log('  npm run cli       - 命令行模式');
    process.exit(0);
  }

  start().catch((error) => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}

// main() 返回 Promise，若不捕获 rejection 会成为 unhandledRejection。
// 内部已对 start() 做了 catch，但 runSetup() 等异步路径的异常仍可能冒泡。
main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
