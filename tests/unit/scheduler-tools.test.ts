import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Set COGITO_USER_DATA_DIR to a temp directory before importing the scheduler module,
// so tests use isolated storage rather than the real data directory.
const TMP_DIR = path.join(
  os.tmpdir(),
  `cogito-scheduler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;

import {
  addScheduleTask,
  removeScheduleTask,
  getScheduleTasks,
  getScheduleTask,
  updateScheduleTask,
  toggleScheduleTask,
  startScheduler,
  stopScheduler,
} from '../../src/agent/tools/scheduler.ts';

const TASKS_FILE = path.join(TMP_DIR, 'data', 'schedule.json');
// 使用无效的 cron 表达式，避免 scheduleTask 立即触发 runTask()（fire-and-forget）
// 带来的异步副作用（mutation + saveTasks 竞态），同时不会创建 setInterval。
const INVALID_CRON = 'invalid-cron';

describe('scheduler tools', () => {
  beforeEach(async () => {
    stopScheduler();
    // 写入空数组到存储文件，再通过 getScheduleTasks 触发 loadTasks，
    // 以重置模块内部的 in-memory tasks 数组（loadTasks 在文件缺失时不会清空）。
    await fs.mkdir(path.dirname(TASKS_FILE), { recursive: true });
    await fs.writeFile(TASKS_FILE, '[]', 'utf-8');
    await getScheduleTasks();
    // 屏蔽无效 cron 表达式产生的 console.error 噪音
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stopScheduler();
    (console.error as jest.Mock).mockRestore?.();
  });

  afterAll(async () => {
    stopScheduler();
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('addScheduleTask', () => {
    it('should create a task with name, cronExpr, action, params, enabled=true', async () => {
      const result = await addScheduleTask('Test Task', INVALID_CRON, 'system.check', {
        key: 'value',
      });
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.name).toBe('Test Task');
      expect(result.data.cronExpr).toBe(INVALID_CRON);
      expect(result.data.action).toBe('system.check');
      expect(result.data.params).toEqual({ key: 'value' });
      expect(result.data.enabled).toBe(true);
      expect(result.data.createdAt).toBeDefined();
      expect(result.data.lastRun).toBeNull();
      expect(result.data.nextRun).toBeNull();
      expect(result.data.runCount).toBe(0);
      expect(result.data.lastError).toBeNull();
    });

    it('should use default params', async () => {
      const result = await addScheduleTask('Default Params Task', INVALID_CRON, 'system.check');
      expect(result.success).toBe(true);
      expect(result.data.params).toEqual({});
    });
  });

  describe('getScheduleTasks', () => {
    it('should return all scheduled tasks', async () => {
      const t1 = await addScheduleTask('TaskListA', INVALID_CRON, 'system.check');
      const t2 = await addScheduleTask('TaskListB', INVALID_CRON, 'memory.clean');

      const result = await getScheduleTasks();
      expect(result.success).toBe(true);
      // Filter to only the tasks we just created (module state may leak between tests)
      const ours = result.data.filter((t: any) => t.id === t1.data.id || t.id === t2.data.id);
      expect(ours).toHaveLength(2);
      expect(ours[0].name).toBe('TaskListA');
      expect(ours[1].name).toBe('TaskListB');
    });
  });

  describe('getScheduleTask', () => {
    it('should return task by id', async () => {
      const created = await addScheduleTask('Find Me', INVALID_CRON, 'system.check');
      const result = await getScheduleTask(created.data.id);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(created.data.id);
      expect(result.data.name).toBe('Find Me');
    });

    it('should return error for invalid id', async () => {
      const result = await getScheduleTask('abc');
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的 ID');
    });

    it('should return error for non-existent id', async () => {
      const result = await getScheduleTask(999999999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('定时任务不存在');
    });
  });

  describe('removeScheduleTask', () => {
    it('should delete a task', async () => {
      const created = await addScheduleTask('To Delete', INVALID_CRON, 'system.check');
      const result = await removeScheduleTask(created.data.id);
      expect(result.success).toBe(true);
      expect(result.data).toContain('已删除');

      const check = await getScheduleTask(created.data.id);
      expect(check.success).toBe(false);
    });

    it('should return error for invalid id', async () => {
      const result = await removeScheduleTask('not-a-number');
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的 ID');
    });

    it('should return error for non-existent id', async () => {
      const result = await removeScheduleTask(999999999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('定时任务不存在');
    });
  });

  describe('updateScheduleTask', () => {
    it('should update name, action, params', async () => {
      const created = await addScheduleTask('Original', INVALID_CRON, 'system.check', { a: 1 });
      const result = await updateScheduleTask(created.data.id, {
        name: 'Updated',
        action: 'memory.clean',
        params: { b: 2 },
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated');
      expect(result.data.action).toBe('memory.clean');
      expect(result.data.params).toEqual({ b: 2 });
    });

    it('should return error for non-existent id', async () => {
      const result = await updateScheduleTask(999999999, { name: 'X' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('定时任务不存在');
    });
  });

  describe('toggleScheduleTask', () => {
    it('should toggle enabled status', async () => {
      const created = await addScheduleTask('Toggle Me', INVALID_CRON, 'system.check');
      expect(created.data.enabled).toBe(true);

      const toggled = await toggleScheduleTask(created.data.id);
      expect(toggled.success).toBe(true);
      expect(toggled.data.id).toBe(created.data.id);
      expect(toggled.data.enabled).toBe(false);

      const toggledBack = await toggleScheduleTask(created.data.id);
      expect(toggledBack.success).toBe(true);
      expect(toggledBack.data.enabled).toBe(true);
    });

    it('should return error for non-existent id', async () => {
      const result = await toggleScheduleTask(999999999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('定时任务不存在');
    });
  });

  describe('startScheduler', () => {
    it('should not throw', async () => {
      await expect(startScheduler()).resolves.not.toThrow();
    });
  });

  describe('stopScheduler', () => {
    it('should not throw', () => {
      expect(() => stopScheduler()).not.toThrow();
    });
  });
});
