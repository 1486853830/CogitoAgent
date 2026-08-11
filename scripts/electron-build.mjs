/**
 * electron-builder 智能构建入口
 *
 * 背景：electron-builder 需要从 GitHub 下载 Electron 二进制与打包工具链，
 * 在受限网络（SSL 证书拦截 / GitHub 不可达）下会报
 * "unable to verify the first certificate"。
 *
 * 策略（国际/国内环境自动适配，配置中不硬编码镜像）：
 * 1. 优先使用系统 CA（--use-system-ca，缓解公司/学校证书拦截）
 * 2. 探测 GitHub 可达性（3s 超时）
 * 3. 不可达 → 自动设置 npmmirror 镜像环境变量后再构建
 * 4. 已显式设置 ELECTRON_MIRROR 时跳过探测，尊重用户配置
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
const BUILDER_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';

// 定位 electron-builder 可执行文件（Windows 下为 .cmd）
function resolveBuilderBin() {
  const binDir = path.join(ROOT, 'node_modules', '.bin');
  const name = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
  const p = path.join(binDir, name);
  if (!fs.existsSync(p)) {
    console.error(`[build] 未找到 electron-builder: ${p}，请先 npm install`);
    process.exit(1);
  }
  return p;
}

async function githubReachable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch('https://github.com', { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // 1. 优先使用系统 CA（缓解 SSL 证书拦截）
  if (!process.env.NODE_OPTIONS?.includes('--use-system-ca')) {
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --use-system-ca`.trim();
  }

  // 2. 未显式指定镜像时，探测 GitHub
  if (!process.env.ELECTRON_MIRROR) {
    const ok = await githubReachable();
    if (!ok) {
      console.log('[build] GitHub 不可达，自动使用 npmmirror 镜像（可用 ELECTRON_MIRROR 覆盖）');
      process.env.ELECTRON_MIRROR = ELECTRON_MIRROR;
      process.env.ELECTRON_BUILDER_BINARIES_MIRROR = BUILDER_MIRROR;
    } else {
      console.log('[build] GitHub 可达，使用官方下载源');
    }
  } else {
    console.log(`[build] 使用自定义镜像: ${process.env.ELECTRON_MIRROR}`);
  }

  // 3. 执行 electron-builder
  const child = spawn(resolveBuilderBin(), args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error('[build] 启动 electron-builder 失败:', err.message);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[build] 构建入口异常:', err);
  process.exit(1);
});
