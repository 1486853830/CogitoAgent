import { execFile } from 'child_process';

type SystemResult = { success: boolean; data?: string; error?: string };

/** 受保护的系统进程名（不区分大小写），终止这些进程可能导致系统不稳定或崩溃。 */
const PROTECTED_PROCESSES = new Set([
  'system',
  'smss',
  'csrss',
  'wininit',
  'winlogon',
  'services',
  'lsass',
  'svchost',
  'explorer',
  'taskhost',
  'spoolsv',
  'dwm',
  'fontdrvhost',
  'logonui',
  'sihost',
  'taskhostw',
  'ctfmon',
  'shellexperiencehost',
  'searchindexer',
  'securityhealthservice',
  'wlms',
  'audiodg',
]);

function sanitizeAppName(appName: string): string {
  const sanitized = appName.trim();

  if (sanitized.length === 0) {
    throw new Error('应用名称不能为空');
  }

  const dangerousChars = /[`|;&$<>(){}[\]'"%^]/;
  if (dangerousChars.test(sanitized)) {
    throw new Error('应用名称包含非法字符');
  }

  return sanitized;
}

async function listApps(): Promise<SystemResult> {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      [
        '-Command',
        'Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName } | Select-Object -ExpandProperty DisplayName | Sort-Object',
      ],
      { encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          resolve({ success: false, error: `读取软件列表失败: ${error.message}` });
          return;
        }
        const apps = stdout
          .split('\n')
          .map((a) => a.trim())
          .filter((a) => a);
        if (apps.length === 0) {
          resolve({ success: true, data: '未找到已安装的软件' });
        } else {
          resolve({ success: true, data: apps.join('\n') });
        }
      },
    );
  });
}

async function openApp(appName: string): Promise<SystemResult> {
  return new Promise((resolve) => {
    try {
      const sanitizedName = sanitizeAppName(appName);
      execFile('cmd', ['/c', 'start', '', sanitizedName], (error) => {
        if (error) {
          resolve({ success: false, error: `打开失败: ${error.message}` });
        } else {
          resolve({ success: true, data: `已启动: ${sanitizedName}` });
        }
      });
    } catch (err) {
      resolve({ success: false, error: (err as Error).message });
    }
  });
}

async function closeApp(appName: string): Promise<SystemResult> {
  return new Promise((resolve) => {
    try {
      const sanitizedName = sanitizeAppName(appName);
      const processName = sanitizedName.replace(/\.exe$/i, '');
      // 拒绝终止关键系统进程，防止 Agent 被恶意利用导致系统崩溃
      if (PROTECTED_PROCESSES.has(processName.toLowerCase())) {
        resolve({
          success: false,
          error: `拒绝终止系统关键进程: ${processName}。终止此进程可能导致系统不稳定。`,
        });
        return;
      }
      execFile('taskkill', ['/f', '/im', `${processName}.exe`], (error) => {
        if (error) {
          resolve({ success: false, error: `关闭失败: ${error.message}` });
        } else {
          resolve({ success: true, data: `已关闭: ${sanitizedName}` });
        }
      });
    } catch (err) {
      resolve({ success: false, error: (err as Error).message });
    }
  });
}

export { listApps, openApp, closeApp };
