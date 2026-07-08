/**
 * 工具注册模块
 * 管理工具注册表，提供工具查找和调用功能
 * 支持工具分类和按需加载
 */

import * as tools from './tools/index.js';
import { loadConfig } from '../config.js';

// 工具分类定义
const TOOL_CATEGORIES = {
  file: '文件操作',
  web: '网络工具',
  system: '系统操作',
  browser: '浏览器自动化',
  code: '代码执行',
  git: 'Git版本控制',
  task: '任务管理',
  memory: '记忆系统',
  data: '数据处理',
  db: '数据库',
  email: '邮件功能',
  monitor: '系统监控',
  scheduler: '定时任务',
  ocr: '图像文字识别',
  vision: '视觉分析',
  office: 'Office文档',
  cluster: '集群管理'
};

// 工具注册表
// 格式: { toolName: { fn: asyncFunction, argCount: number, parseJson: boolean, category: string } }
const TOOL_REGISTRY = {
  // 文件操作
  ls: { fn: tools.ls, argCount: 1, category: 'file' },
  read: { fn: tools.read, argCount: 1, category: 'file' },
  copy: { fn: tools.copy, argCount: 2, category: 'file' },
  mkdir: { fn: tools.mkdir, argCount: 1, category: 'file' },
  create: { fn: tools.create, argCount: 2, category: 'file', customArgs: true },

  // 网络
  search: { fn: tools.search, argCount: 1, category: 'web', customArgs: true },
  browse: { fn: tools.browse, argCount: 1, category: 'web' },
  fetchPage: { fn: tools.fetchPage, argCount: 1, category: 'web' },

  // 系统
  listApps: { fn: tools.listApps, argCount: 0, category: 'system' },
  openApp: { fn: tools.openApp, argCount: 1, category: 'system' },
  closeApp: { fn: tools.closeApp, argCount: 1, category: 'system' },

  // 浏览器自动化
  initBrowser: { fn: tools.initBrowser, argCount: 1, category: 'browser' },
  clickElement: { fn: tools.clickElement, argCount: 2, category: 'browser' },
  fillField: { fn: tools.fillField, argCount: 3, category: 'browser' },
  selectOption: { fn: tools.selectOption, argCount: 2, category: 'browser' },
  viewChanges: { fn: tools.viewChanges, argCount: 0, category: 'browser' },
  getPageContent: { fn: tools.getPageContent, argCount: 0, category: 'browser' },
  takeScreenshot: { fn: tools.takeScreenshot, argCount: 1, category: 'browser' },
  closeBrowser: { fn: tools.closeBrowser, argCount: 0, category: 'browser' },
  searchOnPage: { fn: tools.searchOnPage, argCount: 2, category: 'browser' },
  findElements: { fn: tools.findElements, argCount: 2, category: 'browser' },
  searchOnEngine: { fn: tools.searchOnEngine, argCount: 2, category: 'browser' },
  downloadFile: { fn: tools.downloadFile, argCount: 3, category: 'browser' },

  // 代码执行
  executeCode: { fn: tools.executeCode, argCount: 2, category: 'code' },
  executeFile: { fn: tools.executeFile, argCount: 2, category: 'code' },
  runJavaScript: { fn: tools.runJavaScript, argCount: 1, category: 'code' },
  runPython: { fn: tools.runPython, argCount: 1, category: 'code' },
  formatCode: { fn: tools.formatCode, argCount: 2, category: 'code' },

  // Git
  gitInit: { fn: tools.gitInit, argCount: 1, category: 'git' },
  gitClone: { fn: tools.gitClone, argCount: 3, category: 'git' },
  gitAdd: { fn: tools.gitAdd, argCount: 2, category: 'git' },
  gitCommit: { fn: tools.gitCommit, argCount: 2, category: 'git' },
  gitPush: { fn: tools.gitPush, argCount: 3, category: 'git' },
  gitPull: { fn: tools.gitPull, argCount: 3, category: 'git' },
  gitStatus: { fn: tools.gitStatus, argCount: 1, category: 'git' },
  gitLog: { fn: tools.gitLog, argCount: 2, category: 'git' },
  gitBranchCreate: { fn: tools.gitBranchCreate, argCount: 2, category: 'git' },
  gitBranchDelete: { fn: tools.gitBranchDelete, argCount: 2, category: 'git' },
  gitBranchList: { fn: tools.gitBranchList, argCount: 1, category: 'git' },
  gitCheckout: { fn: tools.gitCheckout, argCount: 2, category: 'git' },
  gitCheckoutNew: { fn: tools.gitCheckoutNew, argCount: 2, category: 'git' },
  gitMerge: { fn: tools.gitMerge, argCount: 2, category: 'git' },
  gitDiff: { fn: tools.gitDiff, argCount: 2, category: 'git' },
  gitRemoteAdd: { fn: tools.gitRemoteAdd, argCount: 3, category: 'git' },
  gitRemoteList: { fn: tools.gitRemoteList, argCount: 1, category: 'git' },
  gitConfigUser: { fn: tools.gitConfigUser, argCount: 3, category: 'git' },
  gitReset: { fn: tools.gitReset, argCount: 2, category: 'git' },
  gitStash: { fn: tools.gitStash, argCount: 1, category: 'git' },
  gitStashPop: { fn: tools.gitStashPop, argCount: 1, category: 'git' },

  // 任务管理
  createTask: { fn: tools.createTask, argCount: 4, category: 'task' },
  getTasks: { fn: tools.getTasks, argCount: 1, category: 'task' },
  getTask: { fn: tools.getTask, argCount: 1, category: 'task' },
  updateTask: { fn: tools.updateTask, argCount: 2, category: 'task' },
  deleteTask: { fn: tools.deleteTask, argCount: 1, category: 'task' },
  completeTask: { fn: tools.completeTask, argCount: 1, category: 'task' },
  splitTask: { fn: tools.splitTask, argCount: 2, category: 'task', parseJson: [false, true] },
  getTaskStats: { fn: tools.getTaskStats, argCount: 0, category: 'task' },
  clearTasks: { fn: tools.clearTasks, argCount: 0, category: 'task' },

  // 记忆系统
  addMemory: { fn: tools.addMemory, argCount: 3, category: 'memory', parseJson: [false, true, false] },
  searchMemory: { fn: tools.searchMemory, argCount: 2, category: 'memory' },
  getAllMemories: { fn: tools.getAllMemories, argCount: 1, category: 'memory' },
  getMemory: { fn: tools.getMemory, argCount: 1, category: 'memory' },
  updateMemory: { fn: tools.updateMemory, argCount: 2, category: 'memory' },
  deleteMemory: { fn: tools.deleteMemory, argCount: 1, category: 'memory' },
  getMemoryStats: { fn: tools.getMemoryStats, argCount: 0, category: 'memory' },
  getRelatedMemories: { fn: tools.getRelatedMemories, argCount: 2, category: 'memory' },
  clearMemory: { fn: tools.clearMemory, argCount: 0, category: 'memory' },

  // 数据处理
  readCSV: { fn: tools.readCSV, argCount: 1, category: 'data' },
  writeCSV: { fn: tools.writeCSV, argCount: 3, category: 'data', parseJson: [false, true, true] },
  readJSON: { fn: tools.readJSON, argCount: 1, category: 'data' },
  writeJSON: { fn: tools.writeJSON, argCount: 2, category: 'data', parseJson: [false, true] },
  csvToJSON: { fn: tools.csvToJSON, argCount: 2, category: 'data' },
  jsonToCSV: { fn: tools.jsonToCSV, argCount: 2, category: 'data' },
  queryData: { fn: tools.queryData, argCount: 2, category: 'data', parseJson: [false, true] },
  analyzeData: { fn: tools.analyzeData, argCount: 1, category: 'data' },
  sortData: { fn: tools.sortData, argCount: 3, category: 'data' },

  // 数据库
  executeSQL: { fn: tools.executeSQL, argCount: 2, category: 'db', parseJson: [false, true] },
  query: { fn: tools.query, argCount: 3, category: 'db', parseJson: [false, true, true] },
  insert: { fn: tools.insert, argCount: 2, category: 'db', parseJson: [false, true] },
  update: { fn: tools.update, argCount: 3, category: 'db', parseJson: [false, true, true] },
  deleteData: { fn: tools.deleteData, argCount: 2, category: 'db', parseJson: [false, true] },
  createTable: { fn: tools.createTable, argCount: 2, category: 'db', parseJson: [false, true] },
  dropTable: { fn: tools.dropTable, argCount: 1, category: 'db' },
  getTables: { fn: tools.getTables, argCount: 0, category: 'db' },
  getTableSchema: { fn: tools.getTableSchema, argCount: 1, category: 'db' },
  executeTransaction: { fn: tools.executeTransaction, argCount: 1, category: 'db', parseJson: [true] },
  closeDB: { fn: tools.closeDB, argCount: 0, category: 'db' },

  // 邮件
  sendEmail: { fn: tools.sendEmail, argCount: 4, category: 'email', parseJson: [false, false, false, true] },
  sendTextEmail: { fn: tools.sendTextEmail, argCount: 3, category: 'email' },
  sendHtmlEmail: { fn: tools.sendHtmlEmail, argCount: 3, category: 'email' },
  sendTemplateEmail: { fn: tools.sendTemplateEmail, argCount: 4, category: 'email', parseJson: [false, false, false, true] },
  sendEmailWithAttachments: { fn: tools.sendEmailWithAttachments, argCount: 4, category: 'email', parseJson: [false, false, false, true] },
  checkEmailConfig: { fn: tools.checkEmailConfig, argCount: 0, category: 'email' },

  // 系统监控
  getCPUInfo: { fn: tools.getCPUInfo, argCount: 0, category: 'monitor' },
  getMemoryInfo: { fn: tools.getMemoryInfo, argCount: 0, category: 'monitor' },
  getDiskInfo: { fn: tools.getDiskInfo, argCount: 0, category: 'monitor' },
  getNetworkInfo: { fn: tools.getNetworkInfo, argCount: 0, category: 'monitor' },
  getProcesses: { fn: tools.getProcesses, argCount: 0, category: 'monitor' },
  getSystemInfo: { fn: tools.getSystemInfo, argCount: 0, category: 'monitor' },
  getCurrentProcess: { fn: tools.getCurrentProcess, argCount: 0, category: 'monitor' },
  getSystemLoad: { fn: tools.getSystemLoad, argCount: 0, category: 'monitor' },
  monitorSystem: { fn: tools.monitorSystem, argCount: 0, category: 'monitor' },

  // 定时任务
  addScheduleTask: { fn: tools.addScheduleTask, argCount: 4, category: 'scheduler', parseJson: [false, false, false, true] },
  getScheduleTasks: { fn: tools.getScheduleTasks, argCount: 0, category: 'scheduler' },
  getScheduleTask: { fn: tools.getScheduleTask, argCount: 1, category: 'scheduler' },
  updateScheduleTask: { fn: tools.updateScheduleTask, argCount: 2, category: 'scheduler', parseJson: [false, true] },
  toggleScheduleTask: { fn: tools.toggleScheduleTask, argCount: 1, category: 'scheduler' },
  removeScheduleTask: { fn: tools.removeScheduleTask, argCount: 1, category: 'scheduler' },
  startScheduler: { fn: tools.startScheduler, argCount: 0, category: 'scheduler' },
  stopScheduler: { fn: tools.stopScheduler, argCount: 0, category: 'scheduler' },

  // OCR 图像文字识别
  ocr: { fn: tools.ocr, argCount: 2, category: 'ocr' },
  ocrBatch: { fn: tools.ocrBatch, argCount: 1, category: 'ocr' },

  // 视觉分析
  vision: { fn: tools.vision, argCount: 2, category: 'vision' },
  visionFromUrl: { fn: tools.visionFromUrl, argCount: 2, category: 'vision' },

  // Office 文档
  createPpt: { fn: tools.createPpt, argCount: 1, category: 'office' },
  createWord: { fn: tools.createWord, argCount: 1, category: 'office' },
  createExcel: { fn: tools.createExcel, argCount: 1, category: 'office' },
  readExcel: { fn: tools.readExcel, argCount: 1, category: 'office' },

  // 集群管理
  spawnAgent: { fn: tools.spawnAgent, argCount: 3, category: 'cluster' },
  delegateTask: { fn: tools.delegateTask, argCount: 2, category: 'cluster' },
  getClusterStatus: { fn: tools.getClusterStatus, argCount: 0, category: 'cluster' },
  stopAgent: { fn: tools.stopAgent, argCount: 1, category: 'cluster' },
  stopAllAgents: { fn: tools.stopAllAgents, argCount: 0, category: 'cluster' },
  parallelExecute: { fn: tools.parallelExecute, argCount: 1, category: 'cluster', parseJson: [true] },
  getAgent: { fn: tools.getAgent, argCount: 1, category: 'cluster' },
  panelDiscussion: { fn: tools.panelDiscussion, argCount: 2, category: 'cluster', parseJson: [false, true, false] },
  pipeline: { fn: tools.pipeline, argCount: 1, category: 'cluster', parseJson: [true] },
  voting: { fn: tools.voting, argCount: 2, category: 'cluster', parseJson: [false, true, true] },
};

// 危险操作列表
const DANGEROUS_OPERATIONS = new Set([
  'gitPush',
  'gitReset',
  'gitBranchDelete',
  'executeCode',
  'executeFile',
  'runJavaScript',
  'runPython',
  'deleteData',
  'dropTable',
  'clearTasks',
  'clearMemory',
  'removeScheduleTask'
]);

/**
 * 获取所有注册的工具名称
 */
function getToolNames() {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * 获取工具注册信息
 */
function getToolRegistry(toolName) {
  return TOOL_REGISTRY[toolName] || null;
}

/**
 * 检查工具是否存在
 */
function hasTool(toolName) {
  return toolName in TOOL_REGISTRY;
}

/**
 * 检查是否危险操作
 */
function isDangerousOperation(toolName) {
  return DANGEROUS_OPERATIONS.has(toolName);
}

/**
 * 检查危险操作确认是否启用
 */
function isConfirmEnabled() {
  if (process.env.COGITO_CONFIRM_DANGEROUS === 'false') {
    return false;
  }
  return true;
}

/**
 * 按类别获取工具列表（静态版本）
 */
function getToolsByCategory() {
  return {
    file: ['ls', 'read', 'copy', 'mkdir', 'create'],
    web: ['search', 'browse', 'fetchPage'],
    system: ['listApps', 'openApp', 'closeApp'],
    browser: ['initBrowser', 'clickElement', 'fillField', 'selectOption', 'viewChanges', 'getPageContent', 'takeScreenshot', 'closeBrowser', 'searchOnPage', 'findElements', 'searchOnEngine', 'downloadFile'],
    code: ['executeCode', 'executeFile', 'runJavaScript', 'runPython', 'formatCode'],
    git: ['gitInit', 'gitClone', 'gitAdd', 'gitCommit', 'gitPush', 'gitPull', 'gitStatus', 'gitLog', 'gitBranchCreate', 'gitBranchDelete', 'gitBranchList', 'gitCheckout', 'gitCheckoutNew', 'gitMerge', 'gitDiff', 'gitRemoteAdd', 'gitRemoteList', 'gitConfigUser', 'gitReset', 'gitStash', 'gitStashPop'],
    task: ['createTask', 'getTasks', 'getTask', 'updateTask', 'deleteTask', 'completeTask', 'splitTask', 'getTaskStats', 'clearTasks'],
    memory: ['addMemory', 'searchMemory', 'getAllMemories', 'getMemory', 'updateMemory', 'deleteMemory', 'getMemoryStats', 'getRelatedMemories', 'clearMemory'],
    data: ['readCSV', 'writeCSV', 'readJSON', 'writeJSON', 'csvToJSON', 'jsonToCSV', 'queryData', 'analyzeData', 'sortData'],
    db: ['executeSQL', 'query', 'insert', 'update', 'deleteData', 'createTable', 'dropTable', 'getTables', 'getTableSchema', 'executeTransaction', 'closeDB'],
    email: ['sendEmail', 'sendTextEmail', 'sendHtmlEmail', 'sendTemplateEmail', 'sendEmailWithAttachments', 'checkEmailConfig'],
    monitor: ['getCPUInfo', 'getMemoryInfo', 'getDiskInfo', 'getNetworkInfo', 'getProcesses', 'getSystemInfo', 'getCurrentProcess', 'getSystemLoad', 'monitorSystem'],
    scheduler: ['addScheduleTask', 'getScheduleTasks', 'getScheduleTask', 'updateScheduleTask', 'toggleScheduleTask', 'removeScheduleTask', 'startScheduler', 'stopScheduler'],
    ocr: ['ocr', 'ocrBatch'],
    vision: ['vision', 'visionFromUrl'],
    office: ['createPpt', 'createWord', 'createExcel', 'readExcel'],
    cluster: ['spawnAgent', 'delegateTask', 'getClusterStatus', 'stopAgent', 'stopAllAgents', 'parallelExecute', 'getAgent', 'panelDiscussion', 'pipeline', 'voting']
  };
}

/**
 * 获取启用的工具分类（从配置读取）
 */
function getEnabledCategories() {
  const cfg = loadConfig();
  const enabled = cfg.tools?.enabledCategories;
  
  // 如果没有配置，默认启用所有分类
  if (!enabled || !Array.isArray(enabled) || enabled.length === 0) {
    return Object.keys(TOOL_CATEGORIES);
  }
  
  // 过滤掉无效的分类名
  return enabled.filter(cat => cat in TOOL_CATEGORIES);
}

/**
 * 获取所有分类定义
 */
function getAllCategories() {
  return { ...TOOL_CATEGORIES };
}

/**
 * 按启用的分类获取工具列表（用于动态加载）
 */
function getToolsForPrompt() {
  const enabledCategories = getEnabledCategories();
  const result = {};
  
  for (const [name, info] of Object.entries(TOOL_REGISTRY)) {
    if (enabledCategories.includes(info.category)) {
      result[name] = info;
    }
  }
  
  return result;
}

/**
 * 获取启用的工具名称列表
 */
function getEnabledToolNames() {
  const enabledCategories = getEnabledCategories();
  const toolNames = [];
  
  for (const [name, info] of Object.entries(TOOL_REGISTRY)) {
    if (enabledCategories.includes(info.category)) {
      toolNames.push(name);
    }
  }
  
  return toolNames;
}

export {
  TOOL_REGISTRY,
  TOOL_CATEGORIES,
  DANGEROUS_OPERATIONS,
  getToolNames,
  getToolRegistry,
  hasTool,
  isDangerousOperation,
  isConfirmEnabled,
  getToolsByCategory,
  getEnabledCategories,
  getAllCategories,
  getToolsForPrompt,
  getEnabledToolNames
};
