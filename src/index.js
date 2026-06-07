/**
 * CogitoAgent - 入口文件
 */

import { isConfigured } from './config.js';
import { runSetup } from './setup.js';
import { start } from './agent/Agent.js';

async function main() {
  console.log('CogitoAgent 项目初始化...\n');

  // 检查是否已配置
  if (!isConfigured()) {
    console.log('首次使用，需要进行配置...\n');
    const config = await runSetup();
    if (!config) {
      console.log('配置未完成，程序退出。');
      process.exit(1);
    }
    // 配置完成后直接退出，让用户重新运行
    console.log('请重新运行程序以启动 CogitoAgent。');
    process.exit(0);
  }

  // 已配置，启动智能体
  start().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}

main();
