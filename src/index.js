/**
 * CogitoAgent - 入口文件
 */

// 加载环境变量（必须在其他模块之前）
import 'dotenv/config';

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
