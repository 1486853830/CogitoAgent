import 'dotenv/config';

import { isConfigured } from './config.ts';
import { runSetup } from './setup.ts';
import { start } from './agent/Agent.ts';
import { execFile } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

function openWelcomePage(): void {
  const introPath = path.join(process.cwd(), 'index.html');
  // Windows 路径含反斜杠，直接拼 file:// 会生成非法 URL；pathToFileURL 正确处理跨平台路径
  const url = pathToFileURL(introPath).href;

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  // 使用 execFile 而非 exec，将参数以数组形式传递，避免 shell 解析注入。
  let cmd: string;
  let args: string[];
  if (isWindows) {
    cmd = 'cmd';
    // S13: 必须用引号包裹 URL。cmd 会重新解析 /c 后的整行，若路径含 & 等
    // 特殊字符（如 C:\Users\foo&calc\bar）会被当作命令分隔符造成注入。
    // execFile 不额外加引号（URL 无空格），故此处显式加引号让 start 整体接收。
    args = ['/c', 'start', '""', `"${url}"`];
  } else if (isMac) {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  execFile(cmd, args, (err) => {
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
