// 分阶段计时 Agent 启动（模拟 npm start 的 Agent 部分）
const t0 = Date.now();
const t = (label: string) => console.log(`  +${Date.now() - t0}ms  ${label}`);

async function main() {
  t('开始 import Agent.ts');
  const { start } = await import('./src/agent/Agent.ts');
  t('Agent.ts 加载完成');

  const origLog = console.log;
  const started = Date.now();
  const timer = setTimeout(() => {
    t('⚠️ 30 秒未就绪，强退');
    process.exit(1);
  }, 30000);

  // 拦截 console.log 检测就绪消息
  console.log = (...args: unknown[]) => {
    origLog(...args);
    const s = args.join(' ');
    if (s.includes('WebSocket 服务已启动')) {
      clearTimeout(timer);
      t('✅ WS 就绪，总耗时 ' + (Date.now() - started) + 'ms');
      process.exit(0);
    }
  };

  await start();
}

main().catch((e) => {
  console.error('启动失败:', e);
  process.exit(1);
});
