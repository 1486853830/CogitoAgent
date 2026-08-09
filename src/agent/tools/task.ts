import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const TASKS_FILE = path.resolve(DATA_DIR, 'data', 'tasks.json');

interface Task {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  parentId: number | null;
  children: number[];
  createdAt: string;
  updatedAt: string;
}

type TaskUpdates = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority'>>;

interface TaskFilter {
  status?: string;
  priority?: string;
  parentId?: number | null;
}

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

let tasks: Task[] = [];
/** 写入锁：序列化并发 saveTasks，避免 createTask/deleteTask/updateTask 等
 *  并发调用时的后保存者覆盖先保存者的修改（TOCTOU 竞态）。 */
let taskSaveLock: Promise<unknown> = Promise.resolve();
let nextId = 1;

/**
 * 安全解析 ID，返回数字或 null（无效时）
 */
function safeParseId(id: unknown): number | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return typeof numId === 'number' && !isNaN(numId) ? numId : null;
}

/**
 * 加载任务列表
 */
async function loadTasks(): Promise<void> {
  try {
    if (
      await fs
        .access(TASKS_FILE)
        .then(() => true)
        .catch(() => false)
    ) {
      const data = await fs.readFile(TASKS_FILE, 'utf-8');
      const loaded = JSON.parse(data) as { tasks?: Task[]; nextId?: number };
      tasks = loaded.tasks || [];
      nextId = loaded.nextId || 1;
    }
  } catch (e: unknown) {
    console.error(`[任务] 加载失败: ${e instanceof Error ? e.message : String(e)}`);
    tasks = [];
    nextId = 1;
  }
}

/**
 * 保存任务列表
 * @returns {Promise<boolean>} 保存是否成功
 * @throws 当保存失败时抛出错误
 */
async function saveTasks(): Promise<boolean> {
  const task = taskSaveLock.then(async () => {
    const dir = path.dirname(TASKS_FILE);
    try {
      if (
        !(await fs
          .access(dir)
          .then(() => true)
          .catch(() => false))
      ) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(TASKS_FILE, JSON.stringify({ tasks, nextId }, null, 2), 'utf-8');
      return true;
    } catch (e: unknown) {
      const error = new Error(`[任务] 保存失败: ${e instanceof Error ? e.message : String(e)}`);
      (error as Error & { code?: string }).code = 'TASK_SAVE_FAILED';
      console.error(error.message);
      throw error;
    }
  });
  taskSaveLock = task.catch(() => {
    /* 已在上层 log，不让锁链断裂 */
  });
  return task;
}

/**
 * 创建任务
 */
async function createTask(
  title: string,
  description: string = '',
  priority: string = 'medium',
  parentId: unknown = null,
): Promise<ActionResult<Task>> {
  await loadTasks();

  // parentId 兼容多种输入："null"/空/null → null，数字字符串 → number
  const parsedParentId = normalizeParentId(parentId);

  const task: Task = {
    id: nextId++,
    title,
    description,
    priority: priority.toLowerCase(),
    status: 'pending',
    parentId: parsedParentId,
    children: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tasks.push(task);

  if (parsedParentId) {
    const parent = tasks.find((t) => t.id === parsedParentId);
    if (parent) {
      parent.children.push(task.id);
    }
  }

  await saveTasks();

  return {
    success: true,
    data: task,
  };
}

/**
 * 规范化 parentId：null/undefined/"null"/空 → null；数字字符串 → number；其余保持原值。
 */
function normalizeParentId(parentId: unknown): number | null {
  if (parentId === null || parentId === undefined) return null;
  if (typeof parentId === 'string') {
    const trimmed = parentId.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? null : num;
  }
  if (typeof parentId === 'number') return isNaN(parentId) ? null : parentId;
  return null;
}

/**
 * 获取任务列表
 */
async function getTasks(filter: TaskFilter = {}): Promise<ActionResult<Task[]>> {
  await loadTasks();

  let filtered = tasks;

  if (filter.status) {
    filtered = filtered.filter((t) => t.status === filter.status);
  }
  if (filter.priority) {
    filtered = filtered.filter((t) => t.priority === filter.priority);
  }
  if (filter.parentId !== undefined) {
    filtered = filtered.filter((t) => t.parentId === filter.parentId);
  }

  return {
    success: true,
    data: filtered,
  };
}

/**
 * 获取单个任务
 */
async function getTask(id: unknown): Promise<ActionResult<Task>> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const task = tasks.find((t) => t.id === numId);
  if (!task) {
    return {
      success: false,
      error: `任务不存在: ${id}`,
    };
  }

  return {
    success: true,
    data: task,
  };
}

/**
 * 更新任务
 */
async function updateTask(id: unknown, updates: TaskUpdates): Promise<ActionResult<Task>> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const task = tasks.find((t) => t.id === numId);
  if (!task) {
    return {
      success: false,
      error: `任务不存在: ${id}`,
    };
  }

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.status !== undefined) task.status = updates.status.toLowerCase();
  if (updates.priority !== undefined) task.priority = updates.priority.toLowerCase();
  task.updatedAt = new Date().toISOString();

  await saveTasks();

  return {
    success: true,
    data: task,
  };
}

/**
 * 删除任务
 */
async function deleteTask(id: unknown): Promise<ActionResult<string>> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const index = tasks.findIndex((t) => t.id === numId);
  if (index === -1) {
    return {
      success: false,
      error: `任务不存在: ${id}`,
    };
  }

  const task = tasks[index];

  tasks = tasks.filter((t) => t.id !== numId && t.parentId !== numId);

  tasks.forEach((t) => {
    t.children = t.children.filter((c) => c !== numId);
  });

  await saveTasks();

  return {
    success: true,
    data: `任务已删除: ${task.title}`,
  };
}

/**
 * 标记任务完成
 */
async function completeTask(id: unknown): Promise<ActionResult<Task>> {
  return await updateTask(id, { status: 'completed' });
}

/**
 * 分解任务为子任务
 */
async function splitTask(
  id: unknown,
  subtasks: Array<{ title: string; description?: string; priority?: string }>,
): Promise<ActionResult<{ parentTask: Task; createdSubtasks: Task[] }>> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const task = tasks.find((t) => t.id === numId);
  if (!task) {
    return {
      success: false,
      error: `任务不存在: ${id}`,
    };
  }

  const created: Task[] = [];

  // 直接操作内存数组 + 一次性持久化：原有循环中每次 createTask
  // 都会 loadTasks + saveTasks，N 个子任务 → N 次磁盘 I/O。
  // 改为批量创建后单次保存。
  for (const subtask of subtasks) {
    const newId = nextId++;
    const newTask: Task = {
      id: newId,
      title: String((subtask as Record<string, unknown>).title || ''),
      description: String((subtask as Record<string, unknown>).description || ''),
      status: 'pending',
      priority: String((subtask as Record<string, unknown>).priority || 'medium'),
      parentId: numId,
      children: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    created.push(newTask);
  }
  // 将子任务 ID 写入父任务的 children 数组
  for (const newTask of created) {
    task.children.push(newTask.id);
  }
  await saveTasks();

  return {
    success: true,
    data: {
      parentTask: task,
      createdSubtasks: created,
    },
  };
}

/**
 * 获取任务统计
 */
async function getTaskStats(): Promise<
  ActionResult<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    byPriority: { high: number; medium: number; low: number };
  }>
> {
  await loadTasks();

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    byPriority: {
      high: tasks.filter((t) => t.priority === 'high').length,
      medium: tasks.filter((t) => t.priority === 'medium').length,
      low: tasks.filter((t) => t.priority === 'low').length,
    },
  };

  return {
    success: true,
    data: stats,
  };
}

/**
 * 清空所有任务
 */
async function clearTasks(): Promise<ActionResult<string>> {
  tasks = [];
  nextId = 1;
  await saveTasks();

  return {
    success: true,
    data: '所有任务已清空',
  };
}

export {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  completeTask,
  splitTask,
  getTaskStats,
  clearTasks,
};
