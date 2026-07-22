import { listApps, openApp, closeApp } from '../../src/agent/tools/system.ts';

describe('system tools', () => {
  describe('openApp', () => {
    it('should return success:false for empty app name', async () => {
      const result = await openApp('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不能为空');
    });

    it('should return success:false for app name with dangerous characters', async () => {
      const result = await openApp('app|malicious');
      expect(result.success).toBe(false);
      expect(result.error).toContain('非法字符');
    });

    it('should resolve with an object containing success property for valid name', async () => {
      const result = await openApp('notepad');
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('closeApp', () => {
    it('should return success:false for empty app name', async () => {
      const result = await closeApp('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不能为空');
    });

    it('should return success:false for app name with dangerous characters', async () => {
      const result = await closeApp('app|malicious');
      expect(result.success).toBe(false);
      expect(result.error).toContain('非法字符');
    });

    it('should resolve with an object containing success property for valid name', async () => {
      const result = await closeApp('notepad.exe');
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('listApps', () => {
    it('should resolve and return an object with success property', async () => {
      const result = await listApps();
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });
});
