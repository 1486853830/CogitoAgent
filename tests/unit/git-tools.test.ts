import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  gitStatus,
  gitLog,
  gitDiff,
  gitAdd,
  gitCommit,
  gitBranchList,
} from '../../src/agent/tools/git.ts';

describe('git tools', () => {
  let tmpDir: string;
  let originalCwd: string;
  const createdDirs: string[] = [];

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cogito-git-test-'));
    createdDirs.push(tmpDir);
    process.chdir(tmpDir);
    execSync('git init', { cwd: tmpDir });
    execSync('git config user.name "Test User"', { cwd: tmpDir });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const dir of createdDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    createdDirs.length = 0;
  });

  describe('gitStatus', () => {
    it('should return success:true with status info for a git repo', async () => {
      const result = await gitStatus();
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('string');
      expect(result.data).toContain('On branch');
    });

    it('should return error for non-git directory', async () => {
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cogito-git-nongit-'));
      createdDirs.push(nonGitDir);
      process.chdir(nonGitDir);
      const result = await gitStatus();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('gitLog', () => {
    it('should return commit history', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello');
      await gitAdd('file.txt');
      await gitCommit('Initial commit');
      const result = await gitLog();
      expect(result.success).toBe(true);
      expect(result.data).toContain('Initial commit');
    });
  });

  describe('gitDiff', () => {
    it('should return diff output', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
      await gitAdd('file.txt');
      await gitCommit('Initial commit');
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'modified content');
      const result = await gitDiff();
      expect(result.success).toBe(true);
      expect(result.data).toContain('modified content');
    });
  });

  describe('gitAdd', () => {
    it('should stage files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
      const result = await gitAdd('file.txt');
      expect(result.success).toBe(true);
      const status = await gitStatus();
      expect(status.data).toContain('file.txt');
    });
  });

  describe('gitCommit', () => {
    it('should create a commit', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
      await gitAdd('file.txt');
      const result = await gitCommit('Test commit message');
      expect(result.success).toBe(true);
      const log = await gitLog();
      expect(log.data).toContain('Test commit message');
    });
  });

  describe('gitBranch', () => {
    it('should list branches', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
      await gitAdd('file.txt');
      await gitCommit('Initial commit');
      const result = await gitBranchList();
      expect(result.success).toBe(true);
      expect(result.data).toMatch(/master|main/);
    });
  });
});
