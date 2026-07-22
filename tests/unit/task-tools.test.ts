import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Set COGITO_USER_DATA_DIR to a temp directory before importing the task module,
// so tests use isolated storage rather than the real data directory.
const TMP_DIR = path.join(
  os.tmpdir(),
  `cogito-task-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;

import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  completeTask,
  splitTask,
  getTaskStats,
  clearTasks,
} from '../../src/agent/tools/task.ts';

describe('task tools', () => {
  beforeEach(async () => {
    await clearTasks();
  });

  afterAll(async () => {
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('createTask', () => {
    it('should create a task with title, description, priority, status=pending', async () => {
      const result = await createTask('Test Task', 'A description', 'high');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(1);
      expect(result.data.title).toBe('Test Task');
      expect(result.data.description).toBe('A description');
      expect(result.data.priority).toBe('high');
      expect(result.data.status).toBe('pending');
      expect(result.data.parentId).toBeNull();
      expect(result.data.children).toEqual([]);
      expect(result.data.createdAt).toBeDefined();
      expect(result.data.updatedAt).toBeDefined();
    });

    it('should use default description and priority', async () => {
      const result = await createTask('Default Task');
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Default Task');
      expect(result.data.description).toBe('');
      expect(result.data.priority).toBe('medium');
      expect(result.data.status).toBe('pending');
    });

    it('should add child to parent when parentId is provided', async () => {
      const parent = await createTask('Parent', 'parent desc', 'high');
      const parentId = parent.data.id;
      const child = await createTask('Child', 'child desc', 'low', parentId);

      expect(child.success).toBe(true);
      expect(child.data.parentId).toBe(parentId);

      const parentCheck = await getTask(parentId);
      expect(parentCheck.success).toBe(true);
      expect(parentCheck.data.children).toContain(child.data.id);
    });
  });

  describe('getTasks', () => {
    it('should return all tasks', async () => {
      await createTask('Task 1');
      await createTask('Task 2');
      await createTask('Task 3');

      const result = await getTasks();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    it('should filter by status', async () => {
      await createTask('Task 1');
      await createTask('Task 2');
      const t3 = await createTask('Task 3');
      await updateTask(t3.data.id, { status: 'in_progress' });

      const result = await getTasks({ status: 'in_progress' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('Task 3');
    });

    it('should filter by priority', async () => {
      await createTask('Task 1', '', 'high');
      await createTask('Task 2', '', 'low');
      await createTask('Task 3', '', 'high');

      const result = await getTasks({ priority: 'high' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('getTask', () => {
    it('should return task by id', async () => {
      const created = await createTask('My Task', 'desc', 'high');
      const result = await getTask(created.data.id);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(created.data.id);
      expect(result.data.title).toBe('My Task');
    });

    it('should return error for invalid id', async () => {
      const result = await getTask('abc');
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的 ID');
    });

    it('should return error for non-existent id', async () => {
      const result = await getTask(9999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('任务不存在');
    });
  });

  describe('updateTask', () => {
    it('should update title, description, status, priority', async () => {
      const created = await createTask('Original', 'orig desc', 'low');
      const result = await updateTask(created.data.id, {
        title: 'Updated',
        description: 'new desc',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
      });
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Updated');
      expect(result.data.description).toBe('new desc');
      expect(result.data.status).toBe('in_progress');
      expect(result.data.priority).toBe('high');
    });

    it('should return error for non-existent id', async () => {
      const result = await updateTask(9999, { title: 'X' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('任务不存在');
    });
  });

  describe('deleteTask', () => {
    it('should delete task and its children', async () => {
      const parent = await createTask('Parent');
      const child = await createTask('Child', '', 'medium', parent.data.id);

      const result = await deleteTask(parent.data.id);
      expect(result.success).toBe(true);
      expect(result.data).toContain('已删除');

      const parentCheck = await getTask(parent.data.id);
      expect(parentCheck.success).toBe(false);

      const childCheck = await getTask(child.data.id);
      expect(childCheck.success).toBe(false);
    });

    it('should return error for non-existent id', async () => {
      const result = await deleteTask(9999);
      expect(result.success).toBe(false);
      expect(result.error).toContain('任务不存在');
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed', async () => {
      const created = await createTask('Task to complete');
      const result = await completeTask(created.data.id);
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('completed');
    });
  });

  describe('splitTask', () => {
    it('should create subtasks for a parent task', async () => {
      const parent = await createTask('Parent Task');
      const subtasks = [
        { title: 'Sub 1', description: 'desc 1', priority: 'high' },
        { title: 'Sub 2', description: 'desc 2', priority: 'low' },
      ];
      const result = await splitTask(parent.data.id, subtasks);
      expect(result.success).toBe(true);
      expect(result.data.createdSubtasks).toHaveLength(2);
      expect(result.data.createdSubtasks[0].title).toBe('Sub 1');
      expect(result.data.createdSubtasks[0].parentId).toBe(parent.data.id);
      expect(result.data.createdSubtasks[1].title).toBe('Sub 2');

      const parentCheck = await getTask(parent.data.id);
      expect(parentCheck.success).toBe(true);
      expect(parentCheck.data.children).toHaveLength(2);
    });

    it('should return error for non-existent parent', async () => {
      const result = await splitTask(9999, [{ title: 'Sub' }]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('任务不存在');
    });
  });

  describe('getTaskStats', () => {
    it('should return total, pending, inProgress, completed counts', async () => {
      await createTask('T1', '', 'high');
      await createTask('T2', '', 'medium');
      const t3 = await createTask('T3', '', 'low');
      const t4 = await createTask('T4', '', 'high');
      await updateTask(t3.data.id, { status: 'in_progress' });
      await completeTask(t4.data.id);

      const result = await getTaskStats();
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(4);
      expect(result.data.pending).toBe(2);
      expect(result.data.inProgress).toBe(1);
      expect(result.data.completed).toBe(1);
      expect(result.data.byPriority.high).toBe(2);
      expect(result.data.byPriority.medium).toBe(1);
      expect(result.data.byPriority.low).toBe(1);
    });
  });

  describe('clearTasks', () => {
    it('should clear all tasks', async () => {
      await createTask('T1');
      await createTask('T2');

      const result = await clearTasks();
      expect(result.success).toBe(true);
      expect(result.data).toContain('清空');

      const tasks = await getTasks();
      expect(tasks.data).toHaveLength(0);
    });
  });
});
