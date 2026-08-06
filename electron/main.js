/**
 * Electron 主进程
 * 创建透明无边框窗口，嵌入桌面背景
 * 支持首次配置向导模式
 */

import { app, BrowserWindow, ipcMain, screen, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync, execFileSync } from 'child_process';
import { initAgentBridge, sendToAgent, setUserDataDir, sendToAgentRaw } from './agent-bridge.js';
import fs from 'fs';
import os from 'os';
import { decrypt as decryptCredential } from './shared/credentials.js';
import { writeEnvConfig } from './shared/config-writer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let setupWindow = null;
let dashboardWindow = null;
let monitorWindow = null;
let agentProcess = null;
let isQuitting = false; // 标记是否为用户主动退出
let mainWindowCreated = false; // 标记主窗口是否曾经创建过
let dashboardWindowCreated = false; // 标记 Dashboard 窗口是否曾经创建过
let isTransitioningToMain = false; // 标记正在从配置向导过渡到主窗口
let currentPersona = ''; // 当前选中的 persona
let currentMode = 'desktop'; // 当前模式: desktop / dashboard

const PROJECT_ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA_DIR, 'config.json');
setUserDataDir(USER_DATA_DIR);
const PERSONA_FILE = path.join(USER_DATA_DIR, 'persona.md');

// CSP: script-src 不再允许 unsafe-inline（内联脚本已全部外迁到 .js 文件），
// style-src 保留 unsafe-inline 以支持动态样式（粒子动画等运行时设的 style 属性）。
const CSP_HEADER = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; media-src 'self' https:; connect-src 'self' http://localhost:9527; object-src 'none'; frame-src 'none';`;

/**
 * 校验 session id 格式，防止路径遍历与命令注入
 * 实际格式：sess_ + base36时间戳 + 8位hex（见 src/agent/session.ts generateId）
 */
function isValidSessionId(id) {
  return typeof id === 'string' && /^sess_[A-Za-z0-9_-]+$/.test(id);
}

/**
 * 检查是否已配置
 */
function isConfigured() {
  // 检查 .env 文件中的关键配置（优先 USER_DATA_DIR，回退到 PROJECT_ROOT）
  const envPaths = [path.join(USER_DATA_DIR, '.env'), path.join(PROJECT_ROOT, '.env')];
  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const hasApiKey =
          envContent.includes('COGITO_API_KEY=') && !envContent.match(/^COGITO_API_KEY=\s*$/m);
        const hasBaseURL =
          envContent.includes('COGITO_API_BASE_URL=') &&
          !envContent.match(/^COGITO_API_BASE_URL=\s*$/m);
        const hasModel =
          envContent.includes('COGITO_MODEL=') && !envContent.match(/^COGITO_MODEL=\s*$/m);

        if (hasApiKey && hasBaseURL && hasModel) {
          return true;
        }
      }
    } catch (e) {
      console.error('[主进程] 配置检查失败:', e.message);
    }
  }
  return false;
}

/**
 * 保存配置到 config.json 和 .env
 */
function saveConfig(config) {
  try {
    // 保存 config.json（过滤敏感字段）
    const configData = {
      api: {
        provider: config.api?.provider || 'custom',
        baseURL: config.api?.baseURL || '',
        model: config.api?.model || '',
        // 不保存 apiKey
      },
      chat: {
        maxTokens: 384000,
        temperature: 0.7,
        topP: 0.7,
        topK: 50,
        frequencyPenalty: 1,
        thinkingInterval: config.thinkingInterval || 3000,
        language: config.chat?.language || 'zh',
      },
      search: {
        enabled: true,
        baseURL: '',
      },
      workspace: config.workspace || os.homedir(),
      database: {
        path: './data/example.db',
      },
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2), 'utf-8');
    console.log('[主进程] 配置已保存到 config.json');

    // 保存 .env 文件：字段集、引号格式、邮箱密码加密、文件权限统一由
    // electron/shared/config-writer.js 实现，CLI 与桌面端共用，避免再分叉。
    const envOk = writeEnvConfig(config, { dataDir: USER_DATA_DIR });
    if (envOk) {
      console.log('[主进程] 配置已保存到 .env');
    } else {
      console.warn('[主进程] .env 保存失败');
    }

    return true;
  } catch (e) {
    console.error('[主进程] 保存配置失败:', e.message);
    return false;
  }
}

/**
 * 清理端口占用（杀掉占用 9527 的旧进程）
 * 使用 execFileSync 数组参数而非 execSync 字符串拼接，避免 port 注入 shell 命令。
 */
function killPortProcess(port = 9527) {
  // 校验 port 为正整数，防御性编程避免后续拼接被注入
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.warn('[主进程] 无效的端口号:', port);
    return;
  }
  try {
    if (process.platform === 'win32') {
      // 用 execFileSync 执行 netstat，JS 侧过滤 findstr 逻辑，避免 shell 拼接
      let result = '';
      try {
        result = execFileSync('netstat', ['-ano'], {
          encoding: 'utf-8',
          windowsHide: true,
        });
      } catch {}
      const pids = new Set();
      for (const line of result.split('\n')) {
        // 匹配包含 :port 的行（如 TCP 127.0.0.1:9527 ... LISTENING 1234）
        if (line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) {
            pids.add(pid);
          }
        }
      }
      for (const pid of pids) {
        try {
          execFileSync('taskkill', ['/PID', pid, '/F'], { windowsHide: true });
          console.log(`[主进程] 已清理端口 ${port} 占用进程 (PID: ${pid})`);
        } catch {}
      }
    } else {
      try {
        // 先取占用端口的 PID 列表，再逐个 kill，避免 xargs 的 shell 拼接
        const result = execFileSync('lsof', ['-t', '-i', `:${port}`], {
          encoding: 'utf-8',
          windowsHide: true,
        });
        const pids = result
          .trim()
          .split('\n')
          .map((p) => p.trim())
          .filter((p) => /^\d+$/.test(p));
        for (const pid of pids) {
          try {
            execFileSync('kill', ['-9', pid], { windowsHide: true });
          } catch {}
        }
        if (pids.length > 0) {
          console.log(`[主进程] 已清理端口 ${port} 占用进程`);
        }
      } catch {}
    }
  } catch {}
}

/**
 * 从 .env 文件读取环境变量
 */
function loadEnvFile() {
  const envPaths = [path.join(USER_DATA_DIR, '.env'), path.join(PROJECT_ROOT, '.env')];
  const envConfig = {};

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        // 检测文件编码：处理 UTF-16（Windows 可能保存为 UTF-16 LE）
        const raw = fs.readFileSync(envPath);
        let content;

        // 检查 UTF-16 LE BOM (0xFF, 0xFE)
        if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
          content = raw.toString('ucs2');
        }
        // 检查 UTF-16 BE BOM (0xFE, 0xFF)
        else if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
          content = raw.toString('ucs2');
        } else {
          content = raw.toString('utf-8');
        }

        // 移除 BOM 字符和 null 字节
        content = content.replace(/^\uFEFF/, '').replace(/\x00/g, '');

        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            let value = trimmed.slice(eqIdx + 1).trim();
            // 去除行内注释（# 前必须有空格）
            const commentIdx = value.indexOf(' #');
            if (commentIdx !== -1) {
              value = value.slice(0, commentIdx);
            }
            // 处理引号包裹的值
            if (value.length >= 2) {
              const first = value[0];
              const last = value[value.length - 1];
              if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                value = value.slice(1, -1);
              }
            }
            envConfig[key] = value;
          }
        }
        break;
      } catch (e) {
        console.error('[主进程] 读取 .env 文件失败:', e.message);
      }
    }
  }

  return envConfig;
}

/**
 * 启动终端 Agent 进程
 */
function startAgentProcess() {
  const fileEnv = loadEnvFile();

  const isPackaged = app.isPackaged;
  let workingDir;
  let srcPath;

  if (isPackaged) {
    workingDir = process.resourcesPath;
    srcPath = path.join(workingDir, 'src');
  } else {
    workingDir = PROJECT_ROOT;
    srcPath = path.join(workingDir, 'src');
  }

  const env = {
    ...process.env,
    ...fileEnv,
    ELECTRON_RUN_AS_NODE: undefined,
    COGITO_USER_DATA_DIR: USER_DATA_DIR,
    ELECTRON_MODE: 'true',
    COGITO_SRC_PATH: srcPath,
  };

  let tsxPath;
  if (isPackaged) {
    try {
      tsxPath = require.resolve('tsx');
    } catch {
      tsxPath = path.join(workingDir, 'node_modules', 'tsx', 'dist', 'bin.js');
    }
    agentProcess = spawn(process.execPath, [tsxPath, path.join(srcPath, 'index.ts')], {
      cwd: workingDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
  } else {
    agentProcess = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: PROJECT_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true,
    });
  }

  return new Promise((resolve, reject) => {
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
      // 此前此处 resolve() 导致 launchMainApp 误以为 Agent 就绪，照常创建窗口，
      // 用户面对无响应聊天且无错误提示。改为 reject 让调用方感知失败。
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    agentProcess.on('exit', (code) => {
      console.log(`[主进程] Agent 已退出 (code: ${code})`);
      agentProcess = null;
    });

    setTimeout(() => {
      // 超时也视为失败：Agent 30 秒内未就绪说明启动异常，继续创建窗口只会让
      // 用户面对无后端的 UI。改为 reject 让 launchMainApp 显示错误并退出。
      if (!resolved) {
        resolved = true;
        reject(new Error('Agent 启动超时（30秒内未就绪）'));
      }
    }, 30000);
  });
}

/**
 * 停止 Agent 进程
 * 返回 Promise，在进程真正退出（或被 kill）后 resolve，便于重启流程 await。
 */
function stopAgentProcess() {
  return new Promise((resolve) => {
    if (!agentProcess) {
      resolve();
      return;
    }
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    // 进程主动退出时（startAgentProcess 中注册的 exit 处理器会置 agentProcess=null）
    agentProcess.on('exit', finish);
    try {
      agentProcess.stdin.write('exit\n');
    } catch (e) {
      console.warn('[主进程] 写入 exit 指令失败:', e.message);
    }
    setTimeout(() => {
      if (agentProcess) {
        try {
          agentProcess.kill();
        } catch {}
        agentProcess = null;
      }
      finish();
    }, 3000);
  });
}

/**
 * 创建配置向导窗口
 */
let isReconfiguring = false;

function createSetupWindow(isReconfigure = false) {
  isReconfiguring = isReconfigure;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  setupWindow = new BrowserWindow({
    width: 520,
    height: 680,
    x: Math.floor((width - 520) / 2),
    y: Math.floor((height - 680) / 2),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: true,
    },
  });

  setupWindow.setMenuBarVisibility(false);
  setupWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP_HEADER] },
    });
  });
  setupWindow.loadFile(path.join(__dirname, 'setup', 'setup.html'));

  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  setupWindow.webContents.on('did-finish-load', () => {
    setupWindow?.webContents.send('setup-reconfigure-mode', isReconfiguring);
  });

  console.log('[主进程] 配置向导窗口已创建');
}

/**
 * 创建主应用窗口
 */
function createMainWindow() {
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
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: true,
    },
  });

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
  }
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP_HEADER] },
    });
  });

  // 拦截链接导航：所有外部链接在系统浏览器中打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
    } else {
      // 拦截 file:///data:/about: 等非 http 协议
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'desktop', 'index.html'));

  initAgentBridge(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 重置标志：macOS 关闭窗口后可通过 dock 重新激活重建窗口
    mainWindowCreated = false;
  });

  mainWindowCreated = true; // 标记主窗口已创建
  console.log('[主进程] 主窗口已创建');
}

/**
 * 创建 Dashboard 窗口（工作台模式）
 */
function createDashboardWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 1100;
  const winHeight = 720;

  dashboardWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.floor((width - winWidth) / 2),
    y: Math.floor((height - winHeight) / 2),
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#1a1a24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: true,
    },
  });

  dashboardWindow.setMenuBarVisibility(false);
  dashboardWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP_HEADER] },
    });
  });

  // 拦截链接导航：所有外部链接在系统浏览器中打开，不在 Electron 内加载
  dashboardWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 拦截新窗口打开（如 target="_blank"）
  dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  dashboardWindow.loadFile(path.join(__dirname, 'dashboard', 'index.html'));

  initAgentBridge(dashboardWindow);

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    // 重置标志：macOS 关闭窗口后可通过 dock 重新激活重建窗口
    dashboardWindowCreated = false;
  });

  dashboardWindowCreated = true;
  currentMode = 'dashboard';
  console.log('[主进程] Dashboard 窗口已创建');
}

/**
 * 创建监控面板窗口（独立弹出）
 */
function createMonitorWindow() {
  if (monitorWindow && !monitorWindow.isDestroyed()) {
    monitorWindow.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 960;
  const winHeight = 540;

  monitorWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.floor((width - winWidth) / 2),
    y: Math.floor((height - winHeight) / 2),
    minWidth: 640,
    minHeight: 360,
    frame: false,
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: true,
    },
  });

  monitorWindow.setMenuBarVisibility(false);
  monitorWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP_HEADER] },
    });
  });
  monitorWindow.loadFile(path.join(__dirname, 'monitor', 'index.html'));

  // 拦截链接导航：所有外部链接在系统浏览器中打开，不在 Electron 内加载
  monitorWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 拦截新窗口打开（如 target="_blank"）
  monitorWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  initAgentBridge(monitorWindow);

  monitorWindow.on('closed', () => {
    monitorWindow = null;
  });

  console.log('[主进程] 监控面板窗口已创建');
}

// 当所有窗口关闭时退出
app.on('window-all-closed', async () => {
  // 正在从配置向导过渡到主窗口时，不退出也不杀 Agent
  if (isTransitioningToMain) {
    console.log('[主进程] 配置完成，正在启动主窗口...');
    return;
  }

  // macOS 惯例：关闭窗口不退出应用，保留在 dock 中可重新激活
  if (process.platform === 'darwin') {
    return;
  }

  // 等待 Agent 进程清理完成后再退出
  await stopAgentProcess();

  // 只有在配置向导阶段（setupWindow 存在且 mainWindow 从未创建过）才等待
  // 否则退出应用
  if (!setupWindow || mainWindowCreated) {
    app.quit();
  } else {
    console.log('[主进程] 等待主窗口创建...');
  }
});

app.on('before-quit', async (e) => {
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;
  await stopAgentProcess();
  app.quit();
});

app.whenReady().then(async () => {
  // ===== IPC: 窗口操作 =====
  ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
  ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.on('window-move', (_event, { x, y }) => {
    if (mainWindow) {
      const [currentX, currentY] = mainWindow.getPosition();
      mainWindow.setPosition(currentX + x, currentY + y);
    }
  });

  // ===== IPC: 模式切换 =====
  ipcMain.handle('get-current-mode', () => {
    return currentMode;
  });

  ipcMain.on('switch-to-desktop', () => {
    if (dashboardWindow) {
      dashboardWindow.close();
      dashboardWindow = null;
    }
    if (!mainWindow) {
      createMainWindow();
    }
  });

  ipcMain.on('switch-to-dashboard', () => {
    if (mainWindow) {
      mainWindow.close();
      mainWindow = null;
    }
    if (!dashboardWindow) {
      createDashboardWindow();
    }
  });

  // ===== IPC: 打开监控面板 =====
  ipcMain.on('open-monitor', () => {
    createMonitorWindow();
  });

  // ===== IPC: 配置向导相关 =====

  // 提交配置
  let isSetupConfiguring = false;
  ipcMain.on('setup-submit-config', async (_event, config) => {
    if (isSetupConfiguring) return; // 防重入
    isSetupConfiguring = true;
    try {
      console.log('[主进程] 收到配置提交:', config.api?.model);

      const success = saveConfig(config);

      if (success && setupWindow) {
        setupWindow.webContents.send('setup-config-result', { success: true });

        // 如果是重新配置模式，保存后直接刷新 Dashboard，不重启应用
        if (isReconfiguring) {
          setTimeout(async () => {
            try {
              if (setupWindow) {
                setupWindow.close();
                setupWindow = null;
              }
              // 重启 Agent 子进程以加载新 .env：仅 reload 窗口不会让已在运行的
              // Agent 重新读取配置，内存状态与磁盘不一致，配置变更不生效。
              await stopAgentProcess();
              await startAgentProcess();
              // 刷新现有 Dashboard 窗口以加载新配置
              if (dashboardWindow && !dashboardWindow.isDestroyed()) {
                dashboardWindow.reload();
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.reload();
              }
              isReconfiguring = false;
            } finally {
              isSetupConfiguring = false;
            }
          }, 500);
          // 不在此处重置标志——setTimeout 回调完成后才会重置
          return;
        }
        // 非重新配置模式：直接在本同步路径重置
        isSetupConfiguring = false;
      } else {
        setupWindow?.webContents.send('setup-config-result', {
          success: false,
          error: '保存配置失败',
        });
        isSetupConfiguring = false;
      }
    } catch (e) {
      console.error('[主进程] 配置提交异常:', e);
      isSetupConfiguring = false;
    }
  });

  // 加载已有配置（用于回填表单）
  ipcMain.handle('load-config', () => {
    const env = loadEnvFile();

    // 同时读取 config.json 作为补充数据源
    let configJson = {};
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        configJson = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch {
      /* ignore */
    }

    return {
      api: {
        baseURL: env['COGITO_API_BASE_URL'] || configJson.api?.baseURL || '',
        apiKey: env['COGITO_API_KEY'] || '',
        model: env['COGITO_MODEL'] || configJson.api?.model || '',
      },
      workspace: env['COGITO_WORKSPACE'] || configJson.workspace || '',
      thinkingInterval:
        env['COGITO_THINKING_INTERVAL'] || configJson.chat?.thinkingInterval || '3000',
      language: configJson.chat?.language || 'zh',
      mode: env['COGITO_MODE'] || 'dashboard',
      email: {
        host: env['COGITO_EMAIL_HOST'] || '',
        port: env['COGITO_EMAIL_PORT'] || '',
        user: env['COGITO_EMAIL_USER'] || '',
        password: decryptCredential(env['COGITO_EMAIL_PASSWORD'] || ''),
        from: env['COGITO_EMAIL_FROM'] || '',
      },
      ocr: {
        apiKey: env['COGITO_OCR_API_KEY'] || '',
        baseURL: env['COGITO_OCR_API_BASE_URL'] || '',
        model: env['COGITO_OCR_MODEL'] || '',
        provider: env['COGITO_OCR_PROVIDER'] || '',
      },
      vision: {
        apiKey: env['COGITO_VISION_API_KEY'] || '',
        baseURL: env['COGITO_VISION_API_BASE_URL'] || '',
        model: env['COGITO_VISION_MODEL'] || '',
      },
      code: {
        timeout: env['COGITO_CODE_TIMEOUT'] || '',
        maxOutput: env['COGITO_CODE_MAX_OUTPUT'] || '',
        scientificMode: env['COGITO_CODE_SCIENTIFIC_MODE'] === 'true',
        scientificLibraries: env['COGITO_CODE_SCIENTIFIC_LIBRARIES'] || '',
      },
      security: {
        confirmDangerous: env['COGITO_CONFIRM_DANGEROUS'] !== 'false',
        sandboxMode: env['COGITO_SANDBOX_MODE'] !== 'false',
      },
    };
  });

  // 更新语言配置（仅更新 config.json 中的 chat.language）
  ipcMain.on('update-language', (_event, lang) => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const configJson = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        configJson.chat = configJson.chat || {};
        configJson.chat.language = lang || 'zh';
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(configJson, null, 2), 'utf-8');
        console.log('[主进程] 语言配置已更新:', lang);
      }
      // 通过 WebSocket 通知 Agent 进程刷新 system prompt
      sendToAgentRaw({ type: 'update-language' });
    } catch (e) {
      console.error('[主进程] 更新语言配置失败:', e.message);
    }
  });

  // 选择目录对话框
  ipcMain.on('setup-select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: os.homedir(),
    });

    if (!result.canceled && result.filePaths.length > 0) {
      setupWindow?.webContents.send('setup-directory-selected', result.filePaths[0]);
    }
  });

  // 启动主应用（配置完成后）
  ipcMain.on('setup-launch-main-app', () => {
    launchMainApp();
  });

  // 获取默认工作区路径
  ipcMain.handle('get-default-workspace', () => {
    return os.homedir();
  });

  // 获取可用的 personas 列表
  ipcMain.handle('get-personas', () => {
    const personasDir = path.join(PROJECT_ROOT, 'personas');
    const personas = [];

    try {
      const dirs = fs
        .readdirSync(personasDir, { withFileTypes: true })
        .filter((dir) => dir.isDirectory())
        .map((dir) => dir.name);

      for (const dir of dirs) {
        const personaPath = path.join(personasDir, dir, 'persona.md');
        if (fs.existsSync(personaPath)) {
          const content = fs.readFileSync(personaPath, 'utf-8');
          const firstLine = content
            .split('\n')[0]
            .replace(/^#+\s*/, '')
            .trim();
          const match = firstLine.match(/^(.*?)\s*\(([^)]+)\)$/);
          const name = match ? match[1].trim() : firstLine;
          personas.push({ id: dir, name });
        }
      }
    } catch (e) {
      console.error('[主进程] 读取 personas 目录失败:', e.message);
    }

    return personas;
  });

  // 获取当前 persona 的媒体资源（优先视频，其次图片）
  ipcMain.handle('get-persona-media', () => {
    // 从 persona.md 文件实时读取，保证与 Agent 侧同步
    let persona = '';
    try {
      if (fs.existsSync(PERSONA_FILE)) {
        const content = fs.readFileSync(PERSONA_FILE, 'utf-8');
        const firstLine = content
          .split('\n')[0]
          .replace(/^#+\s*/, '')
          .trim();
        const match = firstLine.match(/\(([^)]+)\)$/);
        if (match) {
          // 将空格替换为连字符，匹配目录名（如 "Shaanbei Youth" → "Shaanbei-Youth"）
          persona = match[1].trim().replace(/\s+/g, '-');
        }
      }
    } catch (e) {
      console.error('[主进程] 读取 persona.md 失败:', e.message);
    }

    // 回退到 .env 配置
    if (!persona) {
      try {
        const envConfig = loadEnvFile();
        if (envConfig['COGITO_PERSONA']) {
          persona = envConfig['COGITO_PERSONA'];
        }
      } catch (e) {}
    }

    // 回退到内存缓存
    if (!persona) {
      persona = currentPersona;
    }

    if (!persona) {
      return { type: 'video', path: 'default' };
    }

    const personaDir = path.join(PROJECT_ROOT, 'personas', persona);

    const videoPath = path.join(personaDir, 'video.mp4');
    if (fs.existsSync(videoPath)) {
      return { type: 'video', path: `../../personas/${persona}/video.mp4` };
    }

    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    for (const ext of imageExtensions) {
      const imagePath = path.join(personaDir, `image.${ext}`);
      if (fs.existsSync(imagePath)) {
        return { type: 'image', path: `../../personas/${persona}/image.${ext}` };
      }
    }

    return { type: 'video', path: 'default' };
  });

  // ===== 会话管理 IPC =====
  // 更新当前 persona（在 Agent 侧切换人设时同步）
  ipcMain.on('update-current-persona', (_event, personaName) => {
    currentPersona = personaName;
    console.log('[主进程] Persona 已同步:', personaName);
  });

  // 获取会话列表（从 meta.json 读取基本信息，从会话文件读取预览）
  ipcMain.handle('get-sessions', () => {
    const sessionsDir = path.join(USER_DATA_DIR, 'data', 'sessions');
    const metaPath = path.join(sessionsDir, 'meta.json');
    try {
      let sessions = [];
      let meta = { sessions: [], activeId: null };

      if (fs.existsSync(metaPath)) {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (!meta.sessions) meta.sessions = [];
        sessions = meta.sessions.map((s) => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          isActive: s.id === meta.activeId,
        }));
      }

      // 如果 meta 为空但磁盘上有会话文件，自动恢复
      if (sessions.length === 0 && fs.existsSync(sessionsDir)) {
        try {
          const files = fs.readdirSync(sessionsDir);
          const recovered = [];

          for (const file of files) {
            if (!file.match(/^sess_[^_]+\.json$/)) continue;
            const sessionId = file.replace('.json', '');
            try {
              const content = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf-8'));
              // 统计真实消息数（排除 system prompt 和系统注入的工具结果消息）
              const messageCount = Array.isArray(content)
                ? content.filter(
                    (m) =>
                      m.role !== 'system' &&
                      !(m.role === 'user' && m.content.startsWith('[系统返回的工具执行结果]')),
                  ).length
                : 0;
              recovered.push({
                id: sessionId,
                name: `会话 ${recovered.length + 1}`,
                createdAt: new Date().toISOString(),
                lastActiveAt: new Date().toISOString(),
                isActive: sessionId === meta.activeId,
                messageCount,
              });
            } catch {
              // 跳过损坏的文件
            }
          }

          if (recovered.length > 0) {
            sessions = recovered;
            // 同步回 meta.json
            meta.sessions = recovered.map((s) => ({
              id: s.id,
              name: s.name,
              createdAt: s.createdAt,
              lastActiveAt: s.lastActiveAt,
              messageCount: s.messageCount || 0,
            }));
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
            try {
              if (process.platform === 'win32') {
                execFileSync(
                  'icacls',
                  [metaPath, '/inheritance:r', '/grant:r', `${os.userInfo().username}:RW`],
                  { windowsHide: true },
                );
              } else {
                fs.chmodSync(metaPath, 0o600);
              }
            } catch {}
            console.log(`[主进程] 已从磁盘恢复 ${recovered.length} 个会话`);
          }
        } catch {
          // 目录不存在时忽略
        }
      }

      // 读取每个会话文件的第一条真实用户消息作为预览
      for (const session of sessions) {
        // 校验 session.id 防止路径穿越：meta.json 由 agent-bridge 写入 WebSocket 推送的
        // msg.meta，未校验即落盘。攻击者构造 session.id="../../../etc/passwd" 可读取任意文件。
        if (!isValidSessionId(session.id)) continue;
        try {
          const sessionFile = path.join(sessionsDir, `${session.id}.json`);
          if (fs.existsSync(sessionFile)) {
            const messages = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
            // 找第一条真实用户消息作为预览（排除系统注入的工具结果）
            const firstUserMsg = messages.find(
              (m) => m.role === 'user' && !m.content.startsWith('[系统返回的工具执行结果]'),
            );
            if (firstUserMsg) {
              session.preview = firstUserMsg.content.substring(0, 50);
            }
          }
        } catch {
          // 忽略读取失败
        }
      }
      return sessions;
    } catch (e) {
      console.error('[主进程] 读取会话列表失败:', e.message);
    }
    return [];
  });

  // 切换会话（通过 WebSocket 发送给 Agent）
  ipcMain.on('switch-session', (_event, sessionId) => {
    // 校验 sessionId 防止命令注入：未校验即拼入 /switch 命令字符串发给 Agent，
    // 可能触发 Agent 端路径/命令注入。
    if (!isValidSessionId(sessionId)) {
      console.warn('[主进程] 拒绝非法 sessionId:', sessionId);
      return;
    }
    sendToAgent(`/switch ${sessionId}`);
  });

  // 获取当前会话 ID
  ipcMain.handle('get-current-session', () => {
    const metaPath = path.join(USER_DATA_DIR, 'data', 'sessions', 'meta.json');
    try {
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        return meta.activeId;
      }
    } catch (e) {
      console.error('[主进程] 读取当前会话失败:', e.message);
    }
    return null;
  });

  // 获取指定会话的历史消息（排除 system prompt 和系统注入的工具结果消息）
  ipcMain.handle('get-session-history', (_event, sessionId) => {
    if (!isValidSessionId(sessionId)) return [];
    const sessionFile = path.join(USER_DATA_DIR, 'data', 'sessions', `${sessionId}.json`);
    try {
      if (fs.existsSync(sessionFile)) {
        const messages = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
        // 过滤掉 system prompt 和系统注入的工具结果 user 消息
        // 工具结果在实时聊天时已通过 tool-result 事件显示为卡片，历史中不需要重复显示
        return messages
          .filter((m) => m.role !== 'system')
          .filter((m) => !(m.role === 'user' && m.content.startsWith('[系统返回的工具执行结果]')))
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));
      }
    } catch (e) {
      console.error('[主进程] 读取会话历史失败:', e.message);
    }
    return [];
  });

  ipcMain.handle('open-external', async (_event, url) => {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:', 'mailto:', 'ftp:'].includes(parsed.protocol)) {
        throw new Error('不支持的协议');
      }
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        throw new Error('不允许访问本地地址');
      }
      shell.openExternal(url);
    } catch {
      console.warn('[主进程] 拒绝打开无效或危险的 URL:', url);
    }
  });

  ipcMain.on('open-setup', () => {
    // 如果 setup 窗口已存在，聚焦到它
    if (setupWindow) {
      if (setupWindow.isMinimized()) setupWindow.restore();
      setupWindow.focus();
      return;
    }
    // 关闭现有窗口，重新创建 setup（传递 reconfigure 模式）
    createSetupWindow(true);
  });

  // ===== IPC: 微信相关 =====
  ipcMain.on('wechat-login', () => {
    sendToAgent('/wechat/login');
  });

  ipcMain.on('wechat-logout', () => {
    sendToAgent('/wechat/logout');
  });

  ipcMain.on('wechat-request-status', () => {
    sendToAgent('/wechat/status');
  });

  ipcMain.handle('get-wechat-history', () => {
    const wechatFile = path.join(USER_DATA_DIR, 'data', 'wechat', 'weichat.json');
    try {
      if (fs.existsSync(wechatFile)) {
        const data = JSON.parse(fs.readFileSync(wechatFile, 'utf-8'));
        return data.messages || [];
      }
    } catch (e) {
      console.error('[主进程] 读取微信历史消息失败:', e.message);
    }
    return [];
  });

  // ===== 启动逻辑 =====
  if (!isConfigured()) {
    console.log('[主进程] 未配置，显示配置向导');
    createSetupWindow();
  } else {
    console.log('[主进程] 已配置，启动主应用');
    launchMainApp();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!isConfigured()) {
        createSetupWindow();
      } else {
        launchMainApp();
      }
    }
  });
});

/**
 * 从 persona.md 内容解析 persona ID。
 * 约定：第一行格式为 "# Name (persona-id)"，取括号内 ID 并将空格替换为连字符
 * （与 personas 目录名一致，如 "Shaanbei Youth" → "Shaanbei-Youth"）。
 * 此前此处直接调用未定义的 parsePersonaName 导致 ReferenceError 被外层 try/catch 吞掉，
 * persona.md 回退解析彻底失效。实现参照 get-persona-media handler 中的同类逻辑。
 */
function parsePersonaName(content) {
  try {
    const firstLine = content
      .split('\n')[0]
      .replace(/^#+\s*/, '')
      .trim();
    const match = firstLine.match(/\(([^)]+)\)$/);
    if (match) {
      return match[1].trim().replace(/\s+/g, '-');
    }
  } catch (e) {
    console.error('[主进程] 解析 persona 名称失败:', e.message);
  }
  return '';
}

/**
 * 获取当前 persona ID（优先从 .env 读取）
 */
function getCurrentPersona() {
  if (currentPersona) return currentPersona;

  // 优先从 .env 文件读取
  try {
    const envConfig = loadEnvFile();
    if (envConfig['COGITO_PERSONA']) {
      currentPersona = envConfig['COGITO_PERSONA'];
      return currentPersona;
    }
  } catch (e) {
    console.error('[主进程] 从 .env 读取 persona 失败:', e.message);
  }

  // 回退到从 persona.md 获取
  try {
    if (fs.existsSync(PERSONA_FILE)) {
      currentPersona = parsePersonaName(fs.readFileSync(PERSONA_FILE, 'utf-8'));
      if (currentPersona) return currentPersona;
    }
  } catch (e) {
    console.error('[主进程] 读取 persona.md 失败:', e.message);
  }

  return '';
}

/**
 * 启动主应用
 */
async function launchMainApp() {
  // 防止重复调用（例如来自渲染进程的多次 IPC）
  if (
    isTransitioningToMain ||
    mainWindow ||
    mainWindowCreated ||
    dashboardWindow ||
    dashboardWindowCreated
  ) {
    console.log('[主进程] launchMainApp 已被调用，跳过');
    return;
  }

  try {
    // 先关闭配置向导窗口（如果存在）
    if (setupWindow) {
      isTransitioningToMain = true; // 防止 window-all-closed 误退出
      setupWindow.close();
      setupWindow = null;
    }

    // 读取当前 persona
    getCurrentPersona();
    if (currentPersona) {
      console.log('[主进程] 当前 persona:', currentPersona);
    }

    // 读取启动模式
    const envConfig = loadEnvFile();
    const mode = envConfig['COGITO_MODE'] || process.env.COGITO_MODE || 'dashboard';
    currentMode = mode;
    console.log('[主进程] 启动模式:', mode);

    killPortProcess(9527);
    console.log('[主进程] 正在启动终端 Agent...');
    await startAgentProcess();
    console.log('[主进程] Agent 就绪，创建窗口');

    if (mode === 'dashboard') {
      createDashboardWindow();
    } else {
      createMainWindow();
    }
  } catch (e) {
    // Agent 启动失败/超时：显示错误并退出，避免创建无后端的 UI 窗口
    console.error('[主进程] launchMainApp 失败:', e.message);
    dialog.showErrorBox(
      'Agent 启动失败',
      `Agent 启动失败: ${e.message}\n\n请检查配置和网络后重试。`,
    );
    app.quit();
  } finally {
    isTransitioningToMain = false; // 过渡完成（异常时也必须重置）
  }
}
