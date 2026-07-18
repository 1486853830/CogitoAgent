import os from 'os';
import { execFile } from 'child_process';

/**
 * 获取 CPU 信息
 */
function getCPUInfo(): any {
  const cpus = os.cpus();
  const totalCores = cpus.length;
  const model = cpus[0]?.model || 'Unknown';

  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  const usage = ((totalTick - totalIdle) / totalTick * 100).toFixed(2);

  return {
    model,
    cores: totalCores,
    usage: `${usage}%`,
    usagePercent: parseFloat(usage)
  };
}

/**
 * 获取内存信息
 */
function getMemoryInfo(): any {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;

  return {
    total: formatBytes(total),
    used: formatBytes(used),
    free: formatBytes(free),
    usage: `${((used / total) * 100).toFixed(2)}%`,
    usagePercent: ((used / total) * 100).toFixed(2)
  };
}

/**
 * 获取磁盘信息（Windows）
 */
async function getDiskInfoWindows(): Promise<any> {
  return new Promise((resolve) => {
    execFile('wmic', ['logicaldisk', 'get', 'Size,FreeSpace,DeviceID,VolumeName'], (error: any, stdout: string) => {
      if (error) {
        resolve({
          success: false,
          error: `获取磁盘信息失败: ${error.message}`
        });
        return;
      }

      const lines = stdout.split('\n').filter(line => line.trim());
      const drives = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 3) {
          const deviceId = parts[0];
          const freeSpace = parseInt(parts[1]) || 0;
          const size = parseInt(parts[2]) || 0;
          const volumeName = parts.slice(3).join(' ') || '';

          if (size > 0) {
            const used = size - freeSpace;
            drives.push({
              deviceId,
              volumeName,
              total: formatBytes(size),
              used: formatBytes(used),
              free: formatBytes(freeSpace),
              usage: `${((used / size) * 100).toFixed(2)}%`,
              usagePercent: ((used / size) * 100).toFixed(2)
            });
          }
        }
      }

      resolve({
        success: true,
        data: drives
      });
    });
  });
}

/**
 * 获取磁盘信息（Linux/macOS）
 */
async function getDiskInfoUnix(): Promise<any> {
  return new Promise((resolve) => {
    execFile('df', ['-h'], (error: any, stdout: string) => {
      if (error) {
        resolve({
          success: false,
          error: `获取磁盘信息失败: ${error.message}`
        });
        return;
      }

      const lines = stdout.split('\n').filter(line => line.trim());
      const drives = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 6) {
          const deviceId = parts[0];
          const size = parseHumanReadableSize(parts[1]);
          const used = parseHumanReadableSize(parts[2]);
          const free = parseHumanReadableSize(parts[3]);
          const usage = parts[4].replace('%', '');
          const mountPoint = parts[5];

          if (size > 0) {
            drives.push({
              deviceId,
              volumeName: mountPoint,
              total: formatBytes(size),
              used: formatBytes(used),
              free: formatBytes(free),
              usage: `${usage}%`,
              usagePercent: parseFloat(usage)
            });
          }
        }
      }

      resolve({
        success: true,
        data: drives
      });
    });
  });
}

/**
 * 解析人类可读的大小字符串
 */
function parseHumanReadableSize(sizeStr: string): number {
  const units: any = { 'B': 1, 'K': 1024, 'M': 1024 ** 2, 'G': 1024 ** 3, 'T': 1024 ** 4 };
  const match = sizeStr.match(/^([\d.]+)([BKMGTP]?)$/i);

  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase() || 'B';

  return value * (units[unit] || 1);
}

/**
 * 获取磁盘信息（跨平台）
 */
async function getDiskInfo(): Promise<any> {
  if (os.platform() === 'win32') {
    return await getDiskInfoWindows();
  } else {
    return await getDiskInfoUnix();
  }
}

/**
 * 获取网络接口信息
 */
function getNetworkInfo(): any[] {
  const interfaces = os.networkInterfaces();
  const result = [];

  for (const [name, ifaces] of Object.entries(interfaces)) {
    const info: any = {
      name,
      addresses: []
    };

    ifaces?.forEach(iface => {
      info.addresses.push({
        family: iface.family,
        address: iface.address,
        netmask: iface.netmask,
        mac: iface.mac
      });
    });

    result.push(info);
  }

  return result;
}

/**
 * 获取系统进程列表（Windows）
 */
async function getProcessesWindows(): Promise<any> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/fo', 'csv', '/nh'], { encoding: 'utf8' }, (error: any, stdout: string) => {
      if (error) {
        resolve({
          success: false,
          error: `获取进程列表失败: ${error.message}`
        });
        return;
      }

      const lines = stdout.split('\n').filter(line => line.trim());
      const processes = [];

      for (const line of lines) {
        const parts = parseCSVLine(line);
        if (parts.length >= 4) {
          processes.push({
            name: parts[0]?.replace(/"/g, '') || '',
            pid: parts[1]?.replace(/"/g, '') || '',
            sessionName: parts[2]?.replace(/"/g, '') || '',
            sessionNumber: parts[3]?.replace(/"/g, '') || '',
            memUsage: parts[4]?.replace(/"/g, '') || ''
          });
        }
      }

      resolve({
        success: true,
        data: processes.slice(0, 20)
      });
    });
  });
}

/**
 * 获取系统进程列表（Linux/macOS）
 */
async function getProcessesUnix(): Promise<any> {
  return new Promise((resolve) => {
    execFile('ps', ['aux', '--no-headers'], { encoding: 'utf8' }, (error: any, stdout: string) => {
      if (error) {
        resolve({
          success: false,
          error: `获取进程列表失败: ${error.message}`
        });
        return;
      }

      const lines = stdout.split('\n').filter(line => line.trim());
      const processes = [];

      for (const line of lines.slice(0, 20)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 11) {
          processes.push({
            name: parts[10] || '',
            pid: parts[1] || '',
            user: parts[0] || '',
            cpu: parts[2] || '',
            mem: parts[3] || '',
            command: parts.slice(10).join(' ')
          });
        }
      }

      resolve({
        success: true,
        data: processes
      });
    });
  });
}

/**
 * 获取系统进程列表（跨平台）
 */
async function getProcesses(): Promise<any> {
  if (os.platform() === 'win32') {
    return await getProcessesWindows();
  } else {
    return await getProcessesUnix();
  }
}

/**
 * 获取系统信息
 */
function getSystemInfo(): any {
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    release: os.release(),
    type: os.type(),
    uptime: formatUptime(os.uptime())
  };
}

/**
 * 获取当前进程信息
 */
function getCurrentProcess(): any {
  const procInfo = {
    pid: process.pid,
    memoryUsage: {
      rss: formatBytes(process.memoryUsage().rss),
      heapTotal: formatBytes(process.memoryUsage().heapTotal),
      heapUsed: formatBytes(process.memoryUsage().heapUsed),
      external: formatBytes(process.memoryUsage().external)
    },
    cpuUsage: process.cpuUsage ? process.cpuUsage() : null,
    argv: process.argv,
    execPath: process.execPath,
    cwd: process.cwd()
  };

  return procInfo;
}

/**
 * 获取系统负载
 */
async function getSystemLoad(): Promise<any> {
  const cpu = getCPUInfo();
  const memory = getMemoryInfo();
  const disk = await getDiskInfo();

  return {
    success: true,
    data: {
      cpu,
      memory,
      disk: disk.success ? disk.data : []
    }
  };
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days}天 ${hours}小时 ${minutes}分钟 ${secs}秒`;
}

/**
 * 解析 CSV 行
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"' && inQuotes) {
      inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * 监控系统资源
 */
async function monitorSystem(): Promise<any> {
  const info: any = {
    timestamp: new Date().toISOString(),
    system: getSystemInfo(),
    cpu: getCPUInfo(),
    memory: getMemoryInfo(),
    network: getNetworkInfo(),
    process: getCurrentProcess()
  };

  const diskResult = await getDiskInfo();
  info.disk = diskResult.success ? diskResult.data : [];

  return {
    success: true,
    data: info
  };
}

export {
  getCPUInfo,
  getMemoryInfo,
  getDiskInfo,
  getNetworkInfo,
  getProcesses,
  getSystemInfo,
  getCurrentProcess,
  getSystemLoad,
  monitorSystem,
  formatBytes,
  formatUptime
};
