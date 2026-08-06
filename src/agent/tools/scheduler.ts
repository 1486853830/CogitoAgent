import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const TASKS_FILE = path.resolve(DATA_DIR, 'data', 'schedule.json');

let tasks: any[] = [];
let intervals: any = {};

/**
 * 安全解析 ID，返回数字或 null（无效时）
 */
function safeParseId(id: any): number | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return typeof numId === 'number' && !isNaN(numId) ? numId : null;
}

/**
 * 加载定时任务
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
      tasks = JSON.parse(data);
    }
  } catch {
    tasks = [];
  }
}

/**
 * 保存定时任务
 * @returns {Promise<boolean>} 保存是否成功
 * @throws 当保存失败时抛出错误
 */
async function saveTasks(): Promise<boolean> {
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
    await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    return true;
  } catch (e: any) {
    const error = new Error(`[定时任务] 保存失败: ${e.message}`);
    (error as any).code = 'SCHEDULER_SAVE_FAILED';
    console.error(error.message);
    throw error;
  }
}

/**
 * 添加定时任务
 */
async function addScheduleTask(
  name: string,
  cronExpr: string,
  action: string,
  params: any = {},
): Promise<any> {
  await loadTasks();

  const task = {
    id: Date.now(),
    name,
    cronExpr,
    action,
    params,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRun: null,
    nextRun: null,
    runCount: 0,
    lastError: null,
  };

  tasks.push(task);
  await saveTasks();

  scheduleTask(task);

  return {
    success: true,
    data: task,
  };
}

/**
 * 删除定时任务
 */
async function removeScheduleTask(id: any): Promise<any> {
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
      error: `定时任务不存在: ${id}`,
    };
  }

  const task = tasks[index];
  tasks.splice(index, 1);
  await saveTasks();

  if (intervals[numId]) {
    clearInterval(intervals[numId]);
    delete intervals[numId];
  }

  return {
    success: true,
    data: `定时任务已删除: ${task.name}`,
  };
}

/**
 * 获取定时任务列表
 */
async function getScheduleTasks(): Promise<any> {
  await loadTasks();

  return {
    success: true,
    data: tasks,
  };
}

/**
 * 获取单个定时任务
 */
async function getScheduleTask(id: any): Promise<any> {
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
      error: `定时任务不存在: ${id}`,
    };
  }

  return {
    success: true,
    data: task,
  };
}

/**
 * 更新定时任务
 */
async function updateScheduleTask(id: any, updates: any): Promise<any> {
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
      error: `定时任务不存在: ${id}`,
    };
  }

  if (updates.name !== undefined) task.name = updates.name;
  if (updates.cronExpr !== undefined) {
    task.cronExpr = updates.cronExpr;
    rescheduleTask(task);
  }
  if (updates.action !== undefined) task.action = updates.action;
  if (updates.params !== undefined) task.params = updates.params;
  if (updates.enabled !== undefined) {
    task.enabled = updates.enabled;
    if (task.enabled) {
      scheduleTask(task);
    } else {
      unscheduleTask(task.id);
    }
  }

  await saveTasks();

  return {
    success: true,
    data: task,
  };
}

/**
 * 启用/禁用定时任务
 */
async function toggleScheduleTask(id: any): Promise<any> {
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
      error: `定时任务不存在: ${id}`,
    };
  }

  task.enabled = !task.enabled;

  if (task.enabled) {
    scheduleTask(task);
  } else {
    unscheduleTask(task.id);
  }

  await saveTasks();

  return {
    success: true,
    data: {
      id: task.id,
      name: task.name,
      enabled: task.enabled,
    },
  };
}

/**
 * 调度任务
 */
function scheduleTask(task: any): void {
  if (!task.enabled) return;

  unscheduleTask(task.id);

  const ms = parseCronToMs(task.cronExpr);
  if (ms <= 0) {
    console.error(`[定时任务] 无效的 cron 表达式: ${task.cronExpr}`);
    return;
  }

  const runTask = async () => {
    try {
      task.lastRun = new Date().toISOString();
      task.runCount++;
      task.lastError = null;

      console.log(`[定时任务] 执行: ${task.name}`);

      await executeAction(task.action, task.params);
    } catch (e: any) {
      task.lastError = e.message;
      console.error(`[定时任务] 执行失败: ${task.name} - ${e.message}`);
    }

    // saveTasks 必须在 try/catch 内，否则 setInterval 回调产生 unhandledRejection。
    try {
      await saveTasks();
    } catch (e: any) {
      console.error(`[定时任务] 保存任务状态失败: ${task.name} - ${e.message}`);
    }
  };

  // 不再立即执行：调度任务时只注册定时器，等下一个周期到了再运行。
  // 此前 runTask() 在此直接调用，导致 addScheduleTask / startScheduler
  // 时所有任务都会立即触发一次，违背 cron 语义且可能产生副作用。
  intervals[task.id] = setInterval(runTask, ms);
  task.nextRun = new Date(Date.now() + ms).toISOString();
}

/**
 * 取消调度任务
 */
function unscheduleTask(id: any): void {
  if (intervals[id]) {
    clearInterval(intervals[id]);
    delete intervals[id];
  }
}

/**
 * 重新调度任务
 */
function rescheduleTask(task: any): void {
  unscheduleTask(task.id);
  if (task.enabled) {
    scheduleTask(task);
  }
}

/**
 * 解析 cron 表达式为毫秒
 * 支持简单关键字和标准5字段cron表达式
 * 注意：复杂cron表达式（如范围、步进）将返回估算的最小间隔
 */
function parseCronToMs(cronExpr: string): number {
  const parts = cronExpr.trim().split(' ');

  // 简单关键字格式
  if (parts.length === 1) {
    const simple = parts[0].toLowerCase();
    const simpleMap: any = {
      secondly: 1000,
      minutely: 60000,
      hourly: 3600000,
      daily: 86400000,
      weekly: 604800000,
      monthly: 2592000000,
    };
    return simpleMap[simple] || 0;
  }

  // 标准5字段cron表达式: minute hour day month weekday
  if (parts.length === 5) {
    const [minute, hour, day, month, weekday] = parts;

    // 全通配符：每分钟
    if (minute === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
      return 60000;
    }

    // 解析分钟字段
    if (minute !== '*') {
      // 处理范围表达式 (如 1-5)
      if (minute.includes('-')) {
        const [start, end] = minute.split('-').map((n) => parseInt(n, 10));
        if (!isNaN(start) && !isNaN(end)) {
          // 范围表达式返回最小间隔（分钟）
          return 60000;
        }
      }
      // 处理步进表达式 (如 */5)
      if (minute.startsWith('*/')) {
        const step = parseInt(minute.slice(2), 10);
        if (!isNaN(step) && step > 0) {
          return step * 60000;
        }
      }
      // 处理列表表达式 (如 0,15,30)
      if (minute.includes(',')) {
        const values = minute
          .split(',')
          .map((n) => parseInt(n, 10))
          .filter((n) => !isNaN(n));
        if (values.length > 0) {
          // 返回最小间隔（分钟）
          return 60000;
        }
      }
      // 简单数字（如 "0"、"30"）：cron 语义是"每小时的第 N 分钟"，
      // 不是"每 N 分钟"。固定分钟 + hour=* → 间隔为 1 小时。
      // 此前返回 mins * 60000，导致 "0" 返回 0（被判为无效），"30" 返回 30 分钟（错误）。
      const mins = parseInt(minute, 10);
      if (!isNaN(mins)) {
        return 3600000; // 1 小时
      }
    }

    // 解析小时字段
    if (hour !== '*' && minute === '*') {
      // 处理范围表达式 (如 9-17)
      if (hour.includes('-')) {
        return 3600000; // 返回最小间隔（小时）
      }
      // 处理步进表达式 (如 */2)
      if (hour.startsWith('*/')) {
        const step = parseInt(hour.slice(2), 10);
        if (!isNaN(step) && step > 0) {
          return step * 3600000;
        }
      }
      const hrs = parseInt(hour, 10);
      if (!isNaN(hrs)) {
        // minute === '*' 且 hour 是具体数字时，cron 语义是"该小时内的每一分钟"，
        // 间隔应为 1 分钟（60000ms），而非 hrs * 3600000（后者错误地变成每 N 小时执行一次）。
        return 60000;
      }
    }

    // 复杂表达式：返回默认最小间隔（分钟）
    return 60000;
  }

  // 自然语言格式：如 "5 minutes"
  const match = cronExpr.match(/(\d+)\s*(seconds?|minutes?|hours?|days?)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const unitMap: any = {
      second: 1000,
      seconds: 1000,
      minute: 60000,
      minutes: 60000,
      hour: 3600000,
      hours: 3600000,
      day: 86400000,
      days: 86400000,
    };

    return (unitMap[unit] || 0) * num;
  }

  // 无法解析，返回0表示无效
  return 0;
}

/**
 * 执行任务动作
 */
async function executeAction(action: string, _params: any): Promise<void> {
  // 内置 action 均为无参函数，params 当前不生效（保留接口以便扩展自定义 action）。
  // 此前 fn()(params) 把 params 传给无参函数被静默丢弃，这里改为显式不传，避免误用。
  const actions: Record<string, () => Promise<void>> = {
    'system.check': checkSystem,
    'memory.clean': cleanMemory,
    'tasks.summary': summarizeTasks,
  };

  const fn = actions[action];
  if (fn) {
    await fn();
  }
}

/**
 * 系统检查动作
 */
async function checkSystem(): Promise<void> {
  const { monitorSystem } = await import('./monitor.ts');
  const result = await monitorSystem();
  console.log('[定时任务] 系统检查:', JSON.stringify(result.data, null, 2));
}

/**
 * 清理记忆动作
 */
async function cleanMemory(): Promise<void> {
  const { getMemoryStats } = await import('./memory.ts');
  const stats = await getMemoryStats();
  console.log('[定时任务] 记忆统计:', JSON.stringify(stats.data, null, 2));
}

/**
 * 任务汇总动作
 */
async function summarizeTasks(): Promise<void> {
  const { getTaskStats } = await import('./task.ts');
  const stats = await getTaskStats();
  console.log('[定时任务] 任务统计:', JSON.stringify(stats.data, null, 2));
}

/**
 * 启动所有定时任务
 */
async function startScheduler(): Promise<void> {
  await loadTasks();

  for (const task of tasks) {
    if (task.enabled) {
      scheduleTask(task);
    }
  }

  console.log(`[定时任务] 已启动 ${tasks.filter((t) => t.enabled).length} 个任务`);
}

/**
 * 停止所有定时任务
 */
function stopScheduler(): void {
  for (const id in intervals) {
    clearInterval(intervals[id]);
  }
  intervals = {};
  console.log('[定时任务] 已停止所有任务');
}

export {
  addScheduleTask,
  removeScheduleTask,
  getScheduleTasks,
  getScheduleTask,
  updateScheduleTask,
  toggleScheduleTask,
  startScheduler,
  stopScheduler,
};
