import { execFile } from 'child_process';

type SystemResult = { success: boolean; data?: string; error?: string };

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
