/**
 * Electron 主进程
 * 创建透明无边框窗口，嵌入桌面背景
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initAgentBridge } from './agent-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

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
    skipTaskbar: true,
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
  app.quit();
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});