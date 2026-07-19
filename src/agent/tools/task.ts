import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const TASKS_FILE = path.resolve(DATA_DIR, 'data', 'tasks.json');

let tasks: any[] = [];
let nextId = 1;

/**
 * 安全解析 ID，返回数字或 null（无效时）
 */
function safeParseId(id: any): number | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return typeof numId === 'number' && !isNaN(numId) ? numId : null;
}

/**
 * 加载任务列表
 */
async function loadTasks(): Promise<void> {
  try {
    if (await fs.access(TASKS_FILE).then(() => true).catch(() => false)) {
      const data = await fs.readFile(TASKS_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      tasks = loaded.tasks || [];
      nextId = loaded.nextId || 1;
    }
  } catch (e: any) {
    console.error(`[任务] 加载失败: ${e.message}`);
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
  const dir = path.dirname(TASKS_FILE);
  try {
    if (!(await fs.access(dir).then(() => true).catch(() => false))) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(TASKS_FILE, JSON.stringify({ tasks, nextId }, null, 2), 'utf-8');
    return true;
  } catch (e: any) {
    const error = new Error(`[任务] 保存失败: ${e.message}`);
    (error as any).code = 'TASK_SAVE_FAILED';
    console.error(error.message);
    throw error;
  }
}

/**
 * 创建任务
 */
async function createTask(title: string, description: string = '', priority: string = 'medium', parentId: any = null): Promise<any> {
  await loadTasks();

  const task = {
    id: nextId++,
    title,
    description,
    priority: priority.toLowerCase(),
    status: 'pending',
    parentId,
    children: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  tasks.push(task);

  if (parentId) {
    const parent = tasks.find(t => t.id === parentId);
    if (parent) {
      parent.children.push(task.id);
    }
  }

  await saveTasks();

  return {
    success: true,
    data: task
  };
}

/**
 * 获取任务列表
 */
async function getTasks(filter: any = {}): Promise<any> {
  await loadTasks();

  let filtered = tasks;

  if (filter.status) {
    filtered = filtered.filter(t => t.status === filter.status);
  }
  if (filter.priority) {
    filtered = filtered.filter(t => t.priority === filter.priority);
  }
  if (filter.parentId !== undefined) {
    filtered = filtered.filter(t => t.parentId === filter.parentId);
  }

  return {
    success: true,
    data: filtered
  };
}

/**
 * 获取单个任务
 */
async function getTask(id: any): Promise<any> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`
    };
  }

  const task = tasks.find(t => t.id === numId);
  if (!task) {
    return {
      success: false,
      error: `任务不存在: ${id}`
    };
  }

  return {
    success: true,
    data: task
  };
}

/**
 * 更新任务
 */
async function updateTask(id: any, updates: any): Promise<any> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`
    };
  }

  const task = tasks.find(t => t.id === numId);
  if (!task) {
    return {
      success: false,
      error: `任务不存在: ${id}`
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
    data: task
  };
}

/**
 * 删除任务
 */
async function deleteTask(id: any): Promise<any> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`
    };
  }

  const index = tasks.findIndex(t => t.id === numId);
  if (index === -1) {
    return {
      success: false,
      error: `任务不存在: ${id}`
    };
  }

  const task = tasks[index];

  tasks = tasks.filter(t => t.id !== numId && t.parentId !== numId);

  tasks.forEach(t => {
    t.children = t.children.filter((c: any) => c !== numId);
  });

  await saveTasks();

  return {
    success: true,
    data: `任务已删除: ${task.title}`
  };
}

/**
 * 标记任务完成
 */
async function completeTask(id: any): Promise<any> {
  return await updateTask(id, { status: 'completed' });
}

/**
 * 分解任务为子任务
 */
async function splitTask(id: any, subtasks: any[]): Promise<any> {
  await loadTasks();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`
    };
  }

  const task = tasks.find(t => t.id === numId);
  if (!task) {
    return {
      success: false,
      error: `任务不存在: ${id}`
    };
  }

  const created = [];

  for (const subtask of subtasks) {
    const result = await createTask(
      subtask.title,
      subtask.description || '',
      subtask.priority || 'medium',
      numId
    );
    if (result.success) {
      created.push(result.data);
    }
  }

  return {
    success: true,
    data: {
      parentTask: task,
      createdSubtasks: created
    }
  };
}

/**
 * 获取任务统计
 */
async function getTaskStats(): Promise<any> {
  await loadTasks();

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    byPriority: {
      high: tasks.filter(t => t.priority === 'high').length,
      medium: tasks.filter(t => t.priority === 'medium').length,
      low: tasks.filter(t => t.priority === 'low').length
    }
  };

  return {
    success: true,
    data: stats
  };
}

/**
 * 清空所有任务
 */
async function clearTasks(): Promise<any> {
  tasks = [];
  nextId = 1;
  await saveTasks();

  return {
    success: true,
    data: '所有任务已清空'
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
  clearTasks
};
