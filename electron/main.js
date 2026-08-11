/**
 * Electron 主进程
 * 创建透明无边框窗口，嵌入桌面背景
 * 支持首次配置向导模式
 */

import { app, BrowserWindow, ipcMain, screen, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFileSync } from 'child_process';
import { initAgentBridge, sendToAgent, setUserDataDir, sendToAgentRaw } from './agent-bridge.js';
import fs from 'fs';
import os from 'os';
import { decrypt as decryptCredential } from './shared/credentials.js';
import { writeEnvConfig } from './shared/config-writer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 全局未捕获 Promise 拒绝处理器：防止异步操作中意外遗漏 .catch() 导致错误被静默吞没。
// 主进程中的 unhandledRejection 不会像渲染进程那样显示错误对话框，缺少此处理器会使
// 问题极难定位。记录完整错误以便故障排查，但不终止进程（与 uncaughtException 不同）。
process.on('unhandledRejection', (reason, _promise) => {
  console.error('[主进程] 未捕获的 Promise 拒绝:', reason);
  // 输出堆栈以便定位
  if (reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
});

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
 * 校验并归一化 persona 目录名，防止 `../../..` 遍历到 personas 之外。
 * persona 名来自渲染进程 IPC（update-current-persona）与 config.json，均不可信。
 * @returns {string} 合法的目录名；非法时返回 ''（调用方回退默认人设）
 */
function sanitizePersonaId(name) {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  // 只允许字母数字、下划线、连字符与中文，长度 <= 64；显式排除任何分隔符与 '..'
  if (!/^[\w\u4e00-\u9fa5-]{1,64}$/.test(trimmed)) return '';
  if (trimmed === '.' || trimmed === '..') return '';
  // 二次校验：解析后必须仍位于 personas/ 之下
  const personasRoot = path.join(PROJECT_ROOT, 'personas');
  const resolved = path.resolve(personasRoot, trimmed);
  const rel = path.relative(personasRoot, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return '';
  return trimmed;
}

/**
 * 校验 persona.md 中声明的媒体文件名，禁止路径分隔符与遍历。
 */
function isSafeMediaName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 128 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..') &&
    path.basename(name) === name
  );
}

/**
 * 原子写文件：tmp + fsync + rename。
 * 直接 writeFileSync 在写入中途崩溃/断电会留下半截 JSON，
 * 下次读取解析失败即静默丢失全部配置。
 */
function writeFileAtomicSync(filePath, content) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, content, 0, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw e;
  }
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
    // 先读出现有 config.json：设置向导只覆盖它认识的字段，
    // 其余顶层键（mcp / tools.permissions / plugins 等）必须原样保留，
    // 否则用户在扩展面板配置的 MCP 服务与工具权限会在"重新配置"时被静默清空。
    let existing = {};
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed;
        }
      }
    } catch {
      // 读取/解析失败则视为无已有配置
    }

    // 人设不再写入 .env；此处持久化到 config.json 顶层 persona 字段，
    // 若传入 config 不含 persona（如设置向导），则保留 config.json 已有值。
    const persona = sanitizePersonaId(config?.persona || existing.persona || '');

    // 保存 config.json（过滤敏感字段），在已有配置之上做浅合并
    const configData = {
      ...existing,
      persona,
      api: {
        ...(existing.api && typeof existing.api === 'object' ? existing.api : {}),
        provider: config.api?.provider || 'custom',
        baseURL: config.api?.baseURL || '',
        model: config.api?.model || '',
        // 不保存 apiKey
      },
      chat: {
        ...(existing.chat && typeof existing.chat === 'object' ? existing.chat : {}),
        maxTokens: 384000,
        temperature: 0.7,
        topP: 0.7,
        topK: 50,
        frequencyPenalty: 0,
        language: config.chat?.language || 'zh',
      },
      search: {
        ...(existing.search && typeof existing.search === 'object' ? existing.search : {}),
        enabled: true,
        baseURL: existing.search?.baseURL || '',
      },
      workspace:
        config.workspace || existing.workspace || path.join(os.homedir(), 'cogito-workspace'),
      database: {
        ...(existing.database && typeof existing.database === 'object' ? existing.database : {}),
        path: existing.database?.path || './data/example.db',
      },
    };
    // apiKey 绝不落盘到 config.json（历史文件里若混入需主动清除）
    delete configData.api.apiKey;

    writeFileAtomicSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
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
      } catch {
        // 无法查询端口占用时按无占用处理
      }
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
        } catch {
          // 进程可能已被清理，忽略
        }
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
          } catch {
            // 进程可能已被清理，忽略
          }
        }
        if (pids.length > 0) {
          console.log(`[主进程] 已清理端口 ${port} 占用进程`);
        }
      } catch {
        // 非 Windows 平台端口清理失败时忽略
      }
    }
  } catch {
    // 端口清理整体失败不影响主流程
  }
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
        content = content
          .replace(/^\uFEFF/, '')
          .split('\u0000')
          .join('');

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

// ===== Agent 子进程生命周期状态 =====
let isStoppingAgent = false; // 主动停止中，exit 不触发自动重启
let agentRestartAttempts = 0; // 连续异常退出重启次数
let agentRestartTimer = null; // 待执行的重启定时器
const AGENT_MAX_RESTARTS = 3;

/**
 * 杀死进程树。
 * dev 模式下用 `shell: true` 拉起 `npx tsx`，proc.kill() 只会杀掉外层 shell，
 * 真正持有 9527 端口的 node 子进程会成为僵尸，导致下次启动端口被占。
 */
function killProcessTree(proc) {
  if (!proc || proc.killed || typeof proc.pid !== 'number') return;
  const pid = proc.pid;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
      return;
    } catch {
      // taskkill 失败（进程已退出等）时回落到普通 kill
    }
  } else {
    try {
      // spawn 时未 detached，进程组 id 即父 shell pid，负号表示杀整组
      process.kill(-pid, 'SIGTERM');
      return;
    } catch {
      // 不是组长或已退出，回落
    }
  }
  try {
    proc.kill('SIGKILL');
  } catch {
    /* 已退出 */
  }
}

/**
 * Agent 异常退出后按退避策略自动重启，避免用户面对一个"活着但没有后端"的界面。
 */
function scheduleAgentRestart(code, signal) {
  if (isQuitting || isStoppingAgent) return;
  if (agentRestartAttempts >= AGENT_MAX_RESTARTS) {
    console.error(`[主进程] Agent 连续 ${AGENT_MAX_RESTARTS} 次异常退出，放弃自动重启`);
    broadcastToWindows('agent-reply', {
      text: `[系统] Agent 进程反复异常退出（code=${code}, signal=${signal}），已停止自动重启。请检查配置后重新启动应用。`,
      isError: true,
    });
    return;
  }
  agentRestartAttempts += 1;
  const delay = 2000 * 2 ** (agentRestartAttempts - 1); // 2s / 4s / 8s
  console.warn(
    `[主进程] Agent 异常退出 (code=${code}, signal=${signal})，${delay}ms 后第 ${agentRestartAttempts} 次重启`,
  );
  broadcastToWindows('agent-reply', {
    text: `[系统] Agent 进程异常退出，正在自动重启（第 ${agentRestartAttempts}/${AGENT_MAX_RESTARTS} 次）...`,
    isError: true,
  });
  if (agentRestartTimer) clearTimeout(agentRestartTimer);
  agentRestartTimer = setTimeout(() => {
    agentRestartTimer = null;
    if (isQuitting || isStoppingAgent || agentProcess) return;
    startAgentProcess().catch((err) => {
      console.error('[主进程] 自动重启 Agent 失败:', err.message);
    });
  }, delay);
  if (typeof agentRestartTimer.unref === 'function') agentRestartTimer.unref();
}

/**
 * 向所有存活窗口广播事件（用于系统级提示）
 */
function broadcastToWindows(channel, payload) {
  for (const win of [mainWindow, dashboardWindow, monitorWindow]) {
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send(channel, payload);
      } catch {
        /* 窗口正在销毁 */
      }
    }
  }
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
    COGITO_USER_DATA_DIR: USER_DATA_DIR,
    ELECTRON_MODE: 'true',
    COGITO_SRC_PATH: srcPath,
  };
  if (isPackaged) {
    // 打包模式下 process.execPath 是 Electron 可执行文件（CogitoAgent.exe），
    // 必须设置 ELECTRON_RUN_AS_NODE=1 才能以纯 Node.js 模式运行 tsx 执行 Agent 脚本；
    // 否则 CogitoAgent.exe 会作为新 Electron 实例启动，读取 package.json 的 main
    // 再次进入 main.js → startAgentProcess，导致进程无限繁殖。
    env.ELECTRON_RUN_AS_NODE = '1';
  } else {
    // dev 模式经 npx 调用系统 Node，无需此变量；显式删除避免字符串 "undefined" 干扰。
    delete env.ELECTRON_RUN_AS_NODE;
  }

  let tsxPath;
  if (isPackaged) {
    // tsx v4 的 bin 入口为 dist/cli.mjs（见 tsx/package.json "bin" 字段）。
    // 旧代码 require.resolve('tsx') 解析到的是 loader.mjs（exports["."]）而非 CLI，
    // fallback 的 dist/bin.js 在 v4 中不存在，两者均导致子进程无法启动。
    tsxPath = path.join(workingDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
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
        agentRestartAttempts = 0; // 成功就绪，重置退避计数
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

    agentProcess.on('exit', (code, signal) => {
      console.log(`[主进程] Agent 已退出 (code: ${code}, signal: ${signal})`);
      agentProcess = null;
      // 启动阶段就退出：视为启动失败，让调用方感知
      if (!resolved) {
        resolved = true;
        reject(new Error(`Agent 进程在就绪前退出 (code=${code}, signal=${signal})`));
        return;
      }
      // 运行期异常退出：自动重启（主动 stop / 应用退出时不触发）
      if (code !== 0) {
        scheduleAgentRestart(code, signal);
      }
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
  // 取消待执行的自动重启，避免"停了又被拉起来"
  if (agentRestartTimer) {
    clearTimeout(agentRestartTimer);
    agentRestartTimer = null;
  }
  isStoppingAgent = true;
  return new Promise((resolve) => {
    if (!agentProcess) {
      isStoppingAgent = false;
      resolve();
      return;
    }
    let resolved = false;
    let timer = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      isStoppingAgent = false;
      resolve();
    };
    // 进程主动退出时（startAgentProcess 中注册的 exit 处理器会置 agentProcess=null）
    agentProcess.on('exit', finish);
    try {
      agentProcess.stdin.write('exit\n');
    } catch (e) {
      console.warn('[主进程] 写入 exit 指令失败:', e.message);
    }
    timer = setTimeout(() => {
      if (agentProcess) {
        // 必须杀进程树：dev 模式经 shell 拉起 npx tsx，只 kill 外层 shell 会留下
        // 仍占用 9527 端口的 node 僵尸进程。
        killProcessTree(agentProcess);
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
  ipcMain.on('setup-submit-config', async (event, config) => {
    // 仅允许 setup 窗口提交：该接口可改写 .env / config.json（包括 API baseURL、
    // 密钥与安全开关）。若任意渲染进程（含被注入脚本的 dashboard/monitor）都能调用，
    // 一次 XSS 即可把流量导向攻击者的 baseURL 或关闭安全限制。
    if (
      !setupWindow ||
      setupWindow.isDestroyed() ||
      setupWindow.webContents.id !== event.sender.id
    ) {
      console.warn('[主进程] 拒绝非配置向导窗口的 setup-submit-config 调用');
      return;
    }
    if (!config || typeof config !== 'object') return;
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
            } catch (err) {
              // startAgentProcess 可能因端口占用/脚本缺失而 reject。
              // 不捕获会变成 unhandledRejection，用户界面停在"保存成功"却没有 Agent。
              console.error('[主进程] 重新配置后重启 Agent 失败:', err);
              isReconfiguring = false;
              const msg = err && err.message ? err.message : String(err);
              for (const win of [dashboardWindow, mainWindow]) {
                if (win && !win.isDestroyed()) {
                  win.webContents.send('agent-reply', {
                    text: `[系统] 配置已保存，但重启 Agent 失败：${msg}`,
                    isError: true,
                  });
                }
              }
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
  // 仅允许 setup 窗口调用：该接口返回明文 API Key 与解密后的邮箱密码，
  // 不能暴露给 dashboard/desktop/monitor 等其他窗口。
  ipcMain.handle('load-config', (event) => {
    const senderId = event.sender.id;
    if (!setupWindow || setupWindow.webContents.id !== senderId) {
      return null;
    }
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
      language: configJson.chat?.language || 'zh',
      mode: env['COGITO_MODE'] || 'dashboard',
      email: {
        smtpHost: env['COGITO_EMAIL_HOST'] || '',
        smtpPort: env['COGITO_EMAIL_PORT'] || '',
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
        maxExecutionTime: env['COGITO_CODE_TIMEOUT'] || '',
        maxOutputSize: env['COGITO_CODE_MAX_OUTPUT'] || '',
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
        writeFileAtomicSync(CONFIG_FILE, JSON.stringify(configJson, null, 2));
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

  // E4: 已移除 'get-default-workspace' handler。
  // 它未在 preload.cjs 的 contextBridge 白名单中暴露，渲染进程无法 invoke，
  // 主进程内部也无法自调用 ipcMain.handle —— 属于完全不可达的死通道。
  // 如需恢复，必须同时在 preload.cjs 暴露对应方法。

  // 获取可用的 personas 列表
  ipcMain.handle('get-personas', () => {
    const personasDir = path.join(PROJECT_ROOT, 'personas');
    const personas = [];
    // 默认人设（Cogito）由前端"默认"选项表示，不重复列入列表
    const DEFAULT_PERSONA = 'cogito';

    try {
      const dirs = fs
        .readdirSync(personasDir, { withFileTypes: true })
        .filter((dir) => dir.isDirectory())
        .map((dir) => dir.name);

      for (const dir of dirs) {
        if (dir === DEFAULT_PERSONA) continue;
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
  // 直接按名称读取 personas/ 文件夹，不再依赖数据目录拷贝的 PERSONA_FILE。
  ipcMain.handle('get-persona-media', () => {
    // 默认人设文件夹（Cogito）
    const DEFAULT_PERSONA = 'cogito';

    // 当前人设：优先用渲染进程同步过来的 currentPersona（Agent 侧切换人设时广播）
    // 该值来自 IPC/config.json，必须校验后才能拼接路径，否则 `../../..` 可枚举任意目录
    const persona = sanitizePersonaId(currentPersona);

    // 确定人设文件夹名：空/非法 -> 默认文件夹
    const personaDir = persona || DEFAULT_PERSONA;
    const personaDirPath = path.join(PROJECT_ROOT, 'personas', personaDir);

    let personaContent = '';
    try {
      const personaFile = path.join(personaDirPath, 'persona.md');
      if (fs.existsSync(personaFile)) {
        personaContent = fs.readFileSync(personaFile, 'utf-8');
      }
    } catch (e) {
      console.error('[主进程] 读取 persona.md 失败:', e.message);
    }

    // 1) persona.md 显式声明了"## 形象"媒体文件且存在 -> 优先使用
    if (personaContent) {
      const mediaDecl = parsePersonaMedia(personaContent);
      if (mediaDecl && isSafeMediaName(mediaDecl.name)) {
        const mediaPath = path.join(personaDirPath, mediaDecl.name);
        if (fs.existsSync(mediaPath)) {
          return { type: mediaDecl.type, path: `../../personas/${personaDir}/${mediaDecl.name}` };
        }
      }
    }

    // 2) 文件夹下存在图或视频 -> 直接用那个（优先视频，其次图片）
    const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
    const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
    let mediaCandidates = [];
    try {
      if (fs.existsSync(personaDirPath)) {
        mediaCandidates = fs
          .readdirSync(personaDirPath)
          .filter((f) => VIDEO_EXT.test(f) || IMAGE_EXT.test(f));
      }
    } catch (e) {
      console.error('[主进程] 读取人设文件夹媒体失败:', e.message);
    }
    if (mediaCandidates.length > 0) {
      const mediaName =
        mediaCandidates.find((f) => VIDEO_EXT.test(f)) ||
        mediaCandidates.find((f) => IMAGE_EXT.test(f));
      const mediaType = VIDEO_EXT.test(mediaName) ? 'video' : 'image';
      return { type: mediaType, path: `../../personas/${personaDir}/${mediaName}` };
    }

    // 3) 都没有 -> 回退到系统共享默认视频（electron/shared/video.mp4）
    return { type: 'video', path: 'default' };
  });

  // ===== 会话管理 IPC =====
  // 更新当前 persona（在 Agent 侧切换人设时同步）。
  // persona 是运行时概念，不持久化到 config.json——会话级人设由 session.ts 管理，
  // 启动初始人设由 config.json 的 persona 字段（setup wizard 写入）决定。
  ipcMain.on('update-current-persona', (_event, personaName) => {
    // 空串 = 回到默认人设，是合法输入；非空但非法（含分隔符/遍历）一律拒绝
    const safe = personaName ? sanitizePersonaId(personaName) : '';
    if (personaName && !safe) {
      console.warn('[主进程] 拒绝非法 persona 名:', personaName);
      return;
    }
    currentPersona = safe;
    console.log('[主进程] Persona 已同步:', safe || '默认(Cogito)');
  });

  // ===== IPC: 扩展配置（R4.3 MCP 配置面 / R5.2 插件权限） =====
  // 配置驱动：Dashboard 编辑 config.json，Agent 在（重新）加载时读取生效。

  // 读取完整 config.json（不存在时返回 {}）
  function readConfigJson() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      }
    } catch (e) {
      console.error('[主进程] 读取 config.json 失败:', e.message);
    }
    return {};
  }

  // 写回 config.json（保留其他字段）
  function writeConfigJson(patch) {
    const configJson = readConfigJson();
    const merged = { ...configJson, ...patch };
    writeFileAtomicSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
    return merged;
  }

  // 获取 MCP 配置
  ipcMain.handle('get-mcp-config', () => {
    const configJson = readConfigJson();
    return configJson.mcp || {};
  });

  // 更新 MCP 配置（合并补丁）
  ipcMain.handle('update-mcp-config', (_event, patch) => {
    try {
      if (!patch || typeof patch !== 'object') {
        return { success: false, error: '无效的配置' };
      }
      // 基本校验：servers 必须是对象（外部 server 注册表）
      if (
        patch.servers !== undefined &&
        (patch.servers === null ||
          typeof patch.servers !== 'object' ||
          Array.isArray(patch.servers))
      ) {
        return { success: false, error: 'servers 必须是对象' };
      }
      if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') {
        return { success: false, error: 'enabled 必须是布尔值' };
      }
      if (patch.prefix !== undefined && typeof patch.prefix !== 'string') {
        return { success: false, error: 'prefix 必须是字符串' };
      }
      writeConfigJson({ mcp: { ...(readConfigJson().mcp || {}), ...patch } });
      console.log('[主进程] MCP 配置已更新');
      return { success: true };
    } catch (e) {
      console.error('[主进程] 更新 MCP 配置失败:', e.message);
      return { success: false, error: e.message };
    }
  });

  // 获取扩展信息：已安装插件（静态扫描 manifest）+ MCP 配置 + 工具权限规则
  ipcMain.handle('get-extensions', () => {
    const configJson = readConfigJson();
    const pluginsDir = path.join(process.cwd(), 'plugins');
    const plugins = [];
    try {
      if (fs.existsSync(pluginsDir)) {
        for (const entry of fs.readdirSync(pluginsDir)) {
          const pluginPath = path.join(pluginsDir, entry);
          let stat;
          try {
            stat = fs.statSync(pluginPath);
          } catch {
            continue;
          }
          if (!stat.isDirectory()) continue;
          if (!fs.existsSync(path.join(pluginPath, 'index.js'))) continue;
          let meta = {};
          try {
            const pkgPath = path.join(pluginPath, 'package.json');
            if (fs.existsSync(pkgPath)) {
              meta = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            }
          } catch {
            /* 忽略 manifest 解析失败 */
          }
          plugins.push({
            name: meta.name || entry,
            id: entry,
            version: meta.version || '',
            description: meta.description || '',
          });
        }
      }
    } catch (e) {
      console.error('[主进程] 扫描插件目录失败:', e.message);
    }
    return {
      plugins,
      mcp: configJson.mcp || {},
      toolPermissions: Array.isArray(configJson.tools?.permissions)
        ? configJson.tools.permissions
        : [],
    };
  });

  // 设置完整工具权限规则集（R5.2）：替换 tools.permissions 全量
  ipcMain.handle('set-tool-permissions', (_event, payload) => {
    try {
      const rules = payload?.rules;
      if (!Array.isArray(rules)) {
        return { success: false, error: 'rules 必须是数组' };
      }
      for (const r of rules) {
        if (!r || typeof r.name !== 'string' || !['allow', 'deny', 'ask'].includes(r.level)) {
          return { success: false, error: '规则格式无效' };
        }
      }
      const configJson = readConfigJson();
      writeConfigJson({ tools: { ...(configJson.tools || {}), permissions: rules } });
      console.log(`[主进程] 工具权限规则已保存（${rules.length} 条）`);
      return { success: true };
    } catch (e) {
      console.error('[主进程] 保存工具权限失败:', e.message);
      return { success: false, error: e.message };
    }
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
            writeFileAtomicSync(metaPath, JSON.stringify(meta, null, 2));
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
            } catch {
              // 权限设置失败不影响恢复
            }
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
    const wechatDir = path.join(USER_DATA_DIR, 'data', 'wechat');
    // 先读当前使用的正确文件名，回退到旧拼写（迁移前遗留）
    const wechatFile = path.join(wechatDir, 'wechat.json');
    const legacyWechatFile = path.join(wechatDir, 'weichat.json');
    const fileToRead = fs.existsSync(wechatFile)
      ? wechatFile
      : fs.existsSync(legacyWechatFile)
        ? legacyWechatFile
        : null;
    try {
      if (fileToRead && fs.existsSync(fileToRead)) {
        const data = JSON.parse(fs.readFileSync(fileToRead, 'utf-8'));
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
 * 从 persona.md 内容解析"## 形象"声明的媒体文件。
 * 约定：`## 形象` 段落下第一行为媒体文件名，如 `video.mp4` / `image.jpg`。
 * @returns {{ type: 'video'|'image', name: string } | null}
 */
function parsePersonaMedia(content) {
  try {
    if (!content) return null;
    const lines = content.split('\n');
    const section = lines.findIndex((l) => /^##\s*形象/.test(l.trim()));
    if (section < 0) return null;
    for (let i = section + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('#')) break;
      const lower = line.toLowerCase();
      if (/\.(mp4|webm|mov|ogg)$/i.test(lower)) {
        return { type: 'video', name: line };
      }
      if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(lower)) {
        return { type: 'image', name: line };
      }
      break;
    }
  } catch (e) {
    console.error('[主进程] 解析 persona 形象失败:', e.message);
  }
  return null;
}

/**
 * 获取当前 persona ID（默认 Cogito，不读取环境变量 / 数据目录拷贝）
 */
function getCurrentPersona() {
  return currentPersona || '';
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
    const activePersona = getCurrentPersona();
    if (activePersona) {
      console.log('[主进程] 当前 persona:', activePersona);
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
