import { exec } from 'child_process';

/**
 * 列出电脑安装的所有软件
 */
async function listApps(): Promise<any> {
  return new Promise((resolve) => {
    // 读取注册表中的已安装软件列表
    exec(
      `powershell -Command "Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object { $_.DisplayName } | Select-Object -ExpandProperty DisplayName | Sort-Object"`,
      { encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          resolve({ success: false, error: `读取软件列表失败: ${error.message}` });
          return;
        }
        const apps = stdout.split('\n').map(a => a.trim()).filter(a => a);
        if (apps.length === 0) {
          resolve({ success: true, data: '未找到已安装的软件' });
        } else {
          resolve({ success: true, data: apps.join('\n') });
        }
      }
    );
  });
}

/**
 * 打开指定软件
 */
async function openApp(appName: string): Promise<any> {
  return new Promise((resolve) => {
    exec(`start "" "${appName}"`, (error) => {
      if (error) {
        resolve({ success: false, error: `打开失败: ${error.message}` });
      } else {
        resolve({ success: true, data: `已启动: ${appName}` });
      }
    });
  });
}

/**
 * 关闭指定软件
 */
async function closeApp(appName: string): Promise<any> {
  return new Promise((resolve) => {
    // 使用 taskkill 关闭进程（按名称，不带 .exe 后缀）
    const processName = appName.replace('.exe', '');
    exec(`taskkill /f /im "${processName}.exe"`, (error) => {
      if (error) {
        resolve({ success: false, error: `关闭失败: ${error.message}` });
      } else {
        resolve({ success: true, data: `已关闭: ${appName}` });
      }
    });
  });
}

export { listApps, openApp, closeApp };
