/**
 * Electron 主进程
 * 创建透明无边框窗口，嵌入桌面背景
 * 支持首次配置向导模式
 */

import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { initAgentBridge } from './agent-bridge.js';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let setupWindow = null;
let agentProcess = null;
let isQuitting = false;  // 标记是否为用户主动退出
let mainWindowCreated = false;  // 标记主窗口是否曾经创建过
let isTransitioningToMain = false;  // 标记正在从配置向导过渡到主窗口
let currentPersona = '';  // 当前选中的 persona

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config.json');
const PERSONA_FILE = path.join(PROJECT_ROOT, 'persona.md');

/**
 * 检查是否已配置
 */
function isConfigured() {
  // 检查 .env 文件中的关键配置
  const envPath = path.join(PROJECT_ROOT, '.env');
  try {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const hasApiKey = envContent.includes('COGITO_API_KEY=') &&
        !envContent.match(/^COGITO_API_KEY=\s*$/m);
      const hasBaseURL = envContent.includes('COGITO_API_BASE_URL=') &&
        !envContent.match(/^COGITO_API_BASE_URL=\s*$/m);
      const hasModel = envContent.includes('COGITO_MODEL=') &&
        !envContent.match(/^COGITO_MODEL=\s*$/m);

      return !!(hasApiKey && hasBaseURL && hasModel);
    }
  } catch (e) {
    console.error('[主进程] 配置检查失败:', e.message);
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
        model: config.api?.model || ''
        // 不保存 apiKey
      },
      chat: {
        maxTokens: 384000,
        temperature: 0.7,
        topP: 0.7,
        topK: 50,
        frequencyPenalty: 1,
        thinkingInterval: 3000
      },
      search: {
        enabled: true,
        baseURL: ''
      },
      workspace: config.workspace || os.homedir(),
      database: {
        path: './data/example.db'
      }
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2), 'utf-8');
    console.log('[主进程] 配置已保存到 config.json');

    // 保存 .env 文件
    const envPath = path.join(PROJECT_ROOT, '.env');
    const envLines = [
      '# CogitoAgent 配置文件',
      '# 由设置向导自动生成',
      '',
      '# API 配置',
      `COGITO_API_KEY=${config.api?.apiKey || ''}`,
      `COGITO_API_BASE_URL=${config.api?.baseURL || ''}`,
      `COGITO_API_PROVIDER=${config.api?.provider || 'custom'}`,
      `COGITO_MODEL=${config.api?.model || ''}`,
      '',
      '# 工作区配置',
      `COGITO_WORKSPACE=${config.workspace || os.homedir()}`,
      '',
      '# 人设配置',
      `COGITO_PERSONA=${config.persona || ''}`,
      '',
      '# 其他配置可在 .env.example 中查看',
    ];

    fs.writeFileSync(envPath, envLines.join('\n'), 'utf-8');
    console.log('[主进程] 配置已保存到 .env');

    // 复制 persona 文件
    if (config.persona) {
      const srcPath = path.join(PROJECT_ROOT, 'personas', config.persona, 'persona.md');
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, PERSONA_FILE);
        currentPersona = config.persona;
        console.log('[主进程] 人设已应用:', config.persona);
      }
    }

    return true;
  } catch (e) {
    console.error('[主进程] 保存配置失败:', e.message);
    return false;
  }
}

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
 * 从 .env 文件读取环境变量
 */
function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  const envConfig = {};

  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, value] = trimmed.split('=', 2);
          if (key && value !== undefined) {
            envConfig[key] = value;
          }
        }
      }
    } catch (e) {
      console.error('[主进程] 读取 .env 文件失败:', e.message);
    }
  }

  return envConfig;
}

/**
 * 启动终端 Agent 进程
 */
function startAgentProcess() {
  // 从 .env 文件重新读取环境变量，确保使用最新配置
  const fileEnv = loadEnvFile();

  const env = {
    ...process.env,
    ...fileEnv,  // 用文件中的配置覆盖现有环境变量
    ELECTRON_RUN_AS_NODE: undefined,
    ELECTRON_MODE: 'true'
  };

  agentProcess = spawn('node', ['src/index.js'], {
    cwd: PROJECT_ROOT,
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

/**
 * 创建配置向导窗口
 */
function createSetupWindow() {
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
    },
  });

  setupWindow.setMenuBarVisibility(false);
  setupWindow.loadFile(path.join(__dirname, 'setup', 'setup.html'));

  setupWindow.on('closed', () => {
    setupWindow = null;
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
    },
  });

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
  }
  mainWindow.loadFile(path.join(__dirname, 'desktop', 'index.html'));

  initAgentBridge(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindowCreated = true;  // 标记主窗口已创建
  console.log('[主进程] 主窗口已创建');
}

// 当所有窗口关闭时退出
app.on('window-all-closed', () => {
  // 正在从配置向导过渡到主窗口时，不退出也不杀 Agent
  if (isTransitioningToMain) {
    console.log('[主进程] 配置完成，正在启动主窗口...');
    return;
  }
  
  // 停止 Agent 进程
  stopAgentProcess();
  
  // 只有在配置向导阶段（setupWindow 存在且 mainWindow 从未创建过）才等待
  // 否则退出应用
  if (!setupWindow || mainWindowCreated) {
    app.quit();
  } else {
    console.log('[主进程] 等待主窗口创建...');
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopAgentProcess();
});

app.whenReady().then(async () => {
  // ===== IPC: 窗口操作 =====
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-close', () => mainWindow?.close());

  ipcMain.on('window-move', (_event, { x, y }) => {
    if (mainWindow) {
      const [currentX, currentY] = mainWindow.getPosition();
      mainWindow.setPosition(currentX + x, currentY + y);
    }
  });

  // ===== IPC: 配置向导相关 =====

  // 提交配置
  ipcMain.on('setup-submit-config', async (_event, config) => {
    console.log('[主进程] 收到配置提交:', config.api?.model);

    const success = saveConfig(config);

    if (success && setupWindow) {
      setupWindow.webContents.send('setup-config-result', { success: true });
      // 等待渲染进程完成 UI 过渡后由渲染进程触发 launchMainApp
      // 不再在这里自动调用，避免与渲染进程的 setup-launch-main-app 冲突
    } else {
      setupWindow?.webContents.send('setup-config-result', {
        success: false,
        error: '保存配置失败'
      });
    }
  });

  // 选择目录对话框
  ipcMain.on('setup-select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: os.homedir()
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
      const dirs = fs.readdirSync(personasDir, { withFileTypes: true }).filter(dir => dir.isDirectory()).map(dir => dir.name);
      
      for (const dir of dirs) {
        const personaPath = path.join(personasDir, dir, 'persona.md');
        if (fs.existsSync(personaPath)) {
          const content = fs.readFileSync(personaPath, 'utf-8');
          const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim();
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
    if (!currentPersona) {
      return { type: 'video', path: '../assets/zhanshi.mp4' };
    }
    
    const personaDir = path.join(PROJECT_ROOT, 'personas', currentPersona);
    
    const videoPath = path.join(personaDir, 'video.mp4');
    if (fs.existsSync(videoPath)) {
      return { type: 'video', path: `../../personas/${currentPersona}/video.mp4` };
    }
    
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    for (const ext of imageExtensions) {
      const imagePath = path.join(personaDir, `image.${ext}`);
      if (fs.existsSync(imagePath)) {
        return { type: 'image', path: `../../personas/${currentPersona}/image.${ext}` };
      }
    }
    
    return { type: 'video', path: '../assets/zhanshi.mp4' };
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
      const content = fs.readFileSync(PERSONA_FILE, 'utf-8');
      const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim();
      const match = firstLine.match(/\(([^)]+)\)$/);
      if (match) {
        currentPersona = match[1].trim();
        return currentPersona;
      }
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
  if (isTransitioningToMain || mainWindow || mainWindowCreated) {
    console.log('[主进程] launchMainApp 已被调用，跳过');
    return;
  }

  // 先关闭配置向导窗口（如果存在）
  if (setupWindow) {
    isTransitioningToMain = true;  // 防止 window-all-closed 误退出
    setupWindow.close();
    setupWindow = null;
  }

  // 读取当前 persona
  getCurrentPersona();
  if (currentPersona) {
    console.log('[主进程] 当前 persona:', currentPersona);
  }

  killPortProcess(9527);
  console.log('[主进程] 正在启动终端 Agent...');
  await startAgentProcess();
  console.log('[主进程] Agent 就绪，创建主窗口');
  createMainWindow();
  isTransitioningToMain = false;  // 过渡完成
}
