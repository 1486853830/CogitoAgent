import fs from 'fs/promises';
import path from 'path';
import { ls, read, copy, mkdir, create } from '../../src/agent/tools/file.ts';

describe('file tools', () => {
  const testDir = path.join(process.cwd(), 'cogito-test-files');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('mkdir', () => {
    it('should create a directory', async () => {
      const targetPath = path.join(testDir, 'new-dir');
      const result = await mkdir(targetPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('new-dir');
    });

    it('should create nested directories', async () => {
      const targetPath = path.join(testDir, 'level1', 'level2', 'level3');
      const result = await mkdir(targetPath);
      expect(result.success).toBe(true);
    });

    it('should handle existing directory', async () => {
      const targetPath = path.join(testDir, 'existing');
      await fs.mkdir(targetPath, { recursive: true });
      const result = await mkdir(targetPath);
      expect(result.success).toBe(true);
    });
  });

  describe('create', () => {
    it('should create a file with content', async () => {
      const targetPath = path.join(testDir, 'test.txt');
      const result = await create(targetPath, 'Hello World');
      expect(result.success).toBe(true);
      const content = await fs.readFile(targetPath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should create file with auto-created directories', async () => {
      const targetPath = path.join(testDir, 'nested', 'file.txt');
      const result = await create(targetPath, 'Nested file');
      expect(result.success).toBe(true);
      const content = await fs.readFile(targetPath, 'utf-8');
      expect(content).toBe('Nested file');
    });
  });

  describe('ls', () => {
    it('should list directory contents', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content2');
      await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });

      const result = await ls(testDir);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle non-existent directory', async () => {
      const result = await ls(path.join(testDir, 'nonexistent'));
      expect(result.success).toBe(false);
    });
  });

  describe('read', () => {
    it('should read text file content', async () => {
      const filePath = path.join(testDir, 'readtest.txt');
      await fs.writeFile(filePath, 'Test content');

      const result = await read(filePath);
      expect(result.success).toBe(true);
      expect(result.data).toBe('Test content');
    });

    it('should handle large file truncation', async () => {
      const filePath = path.join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(60000);
      await fs.writeFile(filePath, largeContent);

      const result = await read(filePath);
      expect(result.success).toBe(true);
      expect(result.data.length).toBeLessThan(60000);
      expect(result.data).toContain('已截断');
    });

    it('should handle non-existent file', async () => {
      const result = await read(path.join(testDir, 'nonexistent.txt'));
      expect(result.success).toBe(false);
    });
  });

  describe('copy', () => {
    it('should copy a file', async () => {
      const src = path.join(testDir, 'source.txt');
      const dest = path.join(testDir, 'dest.txt');
      await fs.writeFile(src, 'Source content');

      const result = await copy(src, dest);
      expect(result.success).toBe(true);

      const destContent = await fs.readFile(dest, 'utf-8');
      expect(destContent).toBe('Source content');
    });

    it('should handle non-existent source', async () => {
      const src = path.join(testDir, 'nonexistent.txt');
      const dest = path.join(testDir, 'dest.txt');

      const result = await copy(src, dest);
      expect(result.success).toBe(false);
    });
  });
});
