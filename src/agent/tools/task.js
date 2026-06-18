import fs from 'fs/promises';
import path from 'path';

const TASKS_FILE = path.resolve(process.cwd(), 'data', 'tasks.json');

let tasks = [];
let nextId = 1;

/**
 * 加载任务列表
 */
async function loadTasks() {
  try {
    if (await fs.access(TASKS_FILE).then(() => true).catch(() => false)) {
      const data = await fs.readFile(TASKS_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      tasks = loaded.tasks || [];
      nextId = loaded.nextId || 1;
    }
  } catch (e) {
    tasks = [];
    nextId = 1;
  }
}

/**
 * 保存任务列表
 */
async function saveTasks() {
  try {
    const dir = path.dirname(TASKS_FILE);
    if (!(await fs.access(dir).then(() => true).catch(() => false))) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(TASKS_FILE, JSON.stringify({ tasks, nextId }, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[任务] 保存失败: ${e.message}`);
  }
}

/**
 * 创建任务
 */
async function createTask(title, description = '', priority = 'medium', parentId = null) {
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
async function getTasks(filter = {}) {
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
async function getTask(id) {
  await loadTasks();
  
  const task = tasks.find(t => t.id === parseInt(id));
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
async function updateTask(id, updates) {
  await loadTasks();
  
  const task = tasks.find(t => t.id === parseInt(id));
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
async function deleteTask(id) {
  await loadTasks();
  
  const index = tasks.findIndex(t => t.id === parseInt(id));
  if (index === -1) {
    return {
      success: false,
      error: `任务不存在: ${id}`
    };
  }
  
  const task = tasks[index];
  
  tasks = tasks.filter(t => t.id !== parseInt(id) && t.parentId !== parseInt(id));
  
  tasks.forEach(t => {
    t.children = t.children.filter(c => c !== parseInt(id));
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
async function completeTask(id) {
  return await updateTask(id, { status: 'completed' });
}

/**
 * 分解任务为子任务
 */
async function splitTask(id, subtasks) {
  await loadTasks();
  
  const task = tasks.find(t => t.id === parseInt(id));
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
      parseInt(id)
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
async function getTaskStats() {
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
async function clearTasks() {
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