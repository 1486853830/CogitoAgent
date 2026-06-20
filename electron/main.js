/**
 * Electron 主进程
 * 创建透明无边框窗口，嵌入桌面背景
 * 自动启动终端 Agent 进程
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { initAgentBridge } from './agent-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let agentProcess = null;

/**
 * 清理端口占用（杀掉占用 9527 的旧进程）
 */
function killPortProcess(port = 9527) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', windowsHide: true });
      const lines = result.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { windowsHide: true });
          console.log(`[主进程] 已清理端口 ${port} 占用进程 (PID: ${pid})`);
        } catch {}
      }
    } else {
      try {
        execSync(`lsof -t -i :${port} | xargs kill -9`, { windowsHide: true });
        console.log(`[主进程] 已清理端口 ${port} 占用进程`);
      } catch {}
    }
  } catch {}
}

/**
 * 启动终端 Agent 进程
 */
function startAgentProcess() {
  // 清理环境变量中可能干扰子进程的 Electron 变量
  const env = { 
    ...process.env, 
    ELECTRON_RUN_AS_NODE: undefined,
    ELECTRON_MODE: 'true'  // 标记为 Electron 模式
  };

  agentProcess = spawn('node', ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  return new Promise((resolve) => {
    let resolved = false;

    agentProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);

      if (!resolved && text.includes('WebSocket 服务已启动')) {
        resolved = true;
        resolve();
      }
    });

    agentProcess.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    agentProcess.on('error', (err) => {
      console.error('[主进程] Agent 启动失败:', err.message);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });

    agentProcess.on('exit', (code) => {
      console.log(`[主进程] Agent 已退出 (code: ${code})`);
      agentProcess = null;
    });

    // 超时 30 秒
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('[主进程] 等待 Agent 超时，继续启动窗口');
        resolve();
      }
    }, 30000);
  });
}

/**
 * 停止 Agent 进程
 */
function stopAgentProcess() {
  if (agentProcess) {
    agentProcess.stdin.write('exit\n');
    setTimeout(() => {
      if (agentProcess) {
        agentProcess.kill();
        agentProcess = null;
      }
    }, 3000);
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 620,
    height: 600,
    x: width - 640,
    y: height - 620,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    resizable: true,
    minWidth: 500,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // macOS 隐藏红绿灯按钮，Windows 上无此 API
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
  }
  mainWindow.loadFile(path.join(__dirname, 'desktop', 'index.html'));

  // 初始化 Agent 桥接
  initAgentBridge(mainWindow);
}

// 当所有窗口关闭时退出
app.on('window-all-closed', () => {
  stopAgentProcess();
  app.quit();
});

app.on('before-quit', () => {
  stopAgentProcess();
});

app.whenReady().then(async () => {
  // 窗口操作 IPC
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-close', () => mainWindow?.close());
  
  // 窗口移动 IPC（用于拖拽视频）
  ipcMain.on('window-move', (_event, { x, y }) => {
    if (mainWindow) {
      const [currentX, currentY] = mainWindow.getPosition();
      mainWindow.setPosition(currentX + x, currentY + y);
    }
  });

  killPortProcess(9527);
  console.log('[主进程] 正在启动终端 Agent...');
  await startAgentProcess();
  console.log('[主进程] Agent 就绪，创建窗口');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});