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

    it('should open notepad on Windows (or return not-found on other OS)', async () => {
      const result = await openApp('notepad');
      expect(result).toHaveProperty('success');
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
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

    it('should attempt to close notepad.exe on Windows (or return not-found on other OS)', async () => {
      const result = await closeApp('notepad.exe');
      expect(result).toHaveProperty('success');
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('listApps', () => {
    it('should return list of running apps or succeed with empty list', async () => {
      const result = await listApps();
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result).toHaveProperty('data');
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });
});
