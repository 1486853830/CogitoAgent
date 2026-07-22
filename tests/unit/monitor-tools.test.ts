import {
  getCPUInfo,
  getMemoryInfo,
  getDiskInfo,
  getNetworkInfo,
  getSystemInfo,
  getCurrentProcess,
  getSystemLoad,
  monitorSystem,
  formatBytes,
  formatUptime,
} from '../../src/agent/tools/monitor.ts';

describe('monitor tools', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes as "0 B"', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format 1 byte', () => {
      expect(formatBytes(1)).toBe('1.00 B');
    });

    it('should format 1024 bytes as 1.00 KB', () => {
      expect(formatBytes(1024)).toBe('1.00 KB');
    });

    it('should format 1048576 bytes as 1.00 MB', () => {
      expect(formatBytes(1048576)).toBe('1.00 MB');
    });

    it('should format 1073741824 bytes as 1.00 GB', () => {
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    });

    it('should not throw on negative numbers', () => {
      expect(() => formatBytes(-1024)).not.toThrow();
      const result = formatBytes(-1024);
      expect(typeof result).toBe('string');
    });
  });

  describe('formatUptime', () => {
    it('should format 0 seconds', () => {
      expect(formatUptime(0)).toBe('0天 0小时 0分钟 0秒');
    });

    it('should format 60 seconds as 1 minute', () => {
      expect(formatUptime(60)).toBe('0天 0小时 1分钟 0秒');
    });

    it('should format 3600 seconds as 1 hour', () => {
      expect(formatUptime(3600)).toBe('0天 1小时 0分钟 0秒');
    });

    it('should format 86400 seconds as 1 day', () => {
      expect(formatUptime(86400)).toBe('1天 0小时 0分钟 0秒');
    });

    it('should format 90061 seconds as 1天 1小时 1分钟 1秒', () => {
      expect(formatUptime(90061)).toBe('1天 1小时 1分钟 1秒');
    });
  });

  describe('getCPUInfo', () => {
    it('should return object with model, cores, usage, usagePercent properties', () => {
      const info = getCPUInfo();
      expect(info).toBeDefined();
      expect(typeof info).toBe('object');
      expect(info).toHaveProperty('model');
      expect(info).toHaveProperty('cores');
      expect(info).toHaveProperty('usage');
      expect(info).toHaveProperty('usagePercent');
    });

    it('should return cores as a positive number', () => {
      const info = getCPUInfo();
      expect(typeof info.cores).toBe('number');
      expect(info.cores).toBeGreaterThan(0);
    });

    it('should return usage as a string ending with %', () => {
      const info = getCPUInfo();
      expect(typeof info.usage).toBe('string');
      expect(info.usage).toMatch(/%$/);
    });

    it('should return usagePercent as a number', () => {
      const info = getCPUInfo();
      expect(typeof info.usagePercent).toBe('number');
    });
  });

  describe('getMemoryInfo', () => {
    it('should return object with total, used, free, usage properties', () => {
      const info = getMemoryInfo();
      expect(info).toBeDefined();
      expect(typeof info).toBe('object');
      expect(info).toHaveProperty('total');
      expect(info).toHaveProperty('used');
      expect(info).toHaveProperty('free');
      expect(info).toHaveProperty('usage');
    });

    it('should also include usagePercent property', () => {
      const info = getMemoryInfo();
      expect(info).toHaveProperty('usagePercent');
    });

    it('should return usage as a string ending with %', () => {
      const info = getMemoryInfo();
      expect(typeof info.usage).toBe('string');
      expect(info.usage).toMatch(/%$/);
    });
  });

  describe('getSystemInfo', () => {
    it('should return object with platform, arch, hostname, release, type, uptime', () => {
      const info = getSystemInfo();
      expect(info).toBeDefined();
      expect(typeof info).toBe('object');
      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('arch');
      expect(info).toHaveProperty('hostname');
      expect(info).toHaveProperty('release');
      expect(info).toHaveProperty('type');
      expect(info).toHaveProperty('uptime');
    });

    it('should return uptime as a formatted string', () => {
      const info = getSystemInfo();
      expect(typeof info.uptime).toBe('string');
      expect(info.uptime).toContain('天');
    });
  });

  describe('getCurrentProcess', () => {
    it('should return object with pid, memoryUsage, argv, execPath, cwd', () => {
      const info = getCurrentProcess();
      expect(info).toBeDefined();
      expect(typeof info).toBe('object');
      expect(info).toHaveProperty('pid');
      expect(info).toHaveProperty('memoryUsage');
      expect(info).toHaveProperty('argv');
      expect(info).toHaveProperty('execPath');
      expect(info).toHaveProperty('cwd');
    });

    it('should return pid as a number', () => {
      const info = getCurrentProcess();
      expect(typeof info.pid).toBe('number');
      expect(info.pid).toBeGreaterThan(0);
    });

    it('should return argv as an array', () => {
      const info = getCurrentProcess();
      expect(Array.isArray(info.argv)).toBe(true);
    });

    it('should return memoryUsage as an object', () => {
      const info = getCurrentProcess();
      expect(typeof info.memoryUsage).toBe('object');
      expect(info.memoryUsage).toHaveProperty('rss');
    });
  });

  describe('getNetworkInfo', () => {
    it('should return an array', () => {
      const info = getNetworkInfo();
      expect(Array.isArray(info)).toBe(true);
    });

    it('should return entries with name and addresses', () => {
      const info = getNetworkInfo();
      expect(info.length).toBeGreaterThan(0);
      const first = info[0];
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('addresses');
      expect(Array.isArray(first.addresses)).toBe(true);
    });
  });

  describe('getDiskInfo', () => {
    it('should resolve successfully with a result object', async () => {
      const result = await getDiskInfo();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('success');
    });

    it('should resolve with data array when successful', async () => {
      const result = await getDiskInfo();
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
      }
    });
  });

  describe('getSystemLoad', () => {
    it('should resolve with success: true', async () => {
      const result = await getSystemLoad();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should resolve with data object containing cpu, memory, disk', async () => {
      const result = await getSystemLoad();
      expect(result.data).toBeDefined();
      expect(result.data).toHaveProperty('cpu');
      expect(result.data).toHaveProperty('memory');
      expect(result.data).toHaveProperty('disk');
    });
  });

  describe('monitorSystem', () => {
    it('should resolve with success: true', async () => {
      const result = await monitorSystem();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should resolve with data object', async () => {
      const result = await monitorSystem();
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('object');
    });

    it('should include system, cpu, memory, network, process in data', async () => {
      const result = await monitorSystem();
      const data = result.data;
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('system');
      expect(data).toHaveProperty('cpu');
      expect(data).toHaveProperty('memory');
      expect(data).toHaveProperty('network');
      expect(data).toHaveProperty('process');
      expect(data).toHaveProperty('disk');
    });
  });
});
