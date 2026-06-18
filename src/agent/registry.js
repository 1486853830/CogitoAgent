/**
 * 工具注册模块
 * 管理工具注册表，提供工具查找和调用功能
 */

import * as tools from './tools/index.js';

// 工具注册表
// 格式: { toolName: { fn: asyncFunction, argCount: number, parseJson: boolean } }
const TOOL_REGISTRY = {
  // 文件操作
  ls: { fn: tools.ls, argCount: 1 },
  read: { fn: tools.read, argCount: 1 },
  copy: { fn: tools.copy, argCount: 2 },
  mkdir: { fn: tools.mkdir, argCount: 1 },
  create: { fn: tools.create, argCount: 2, customArgs: true },

  // 网络
  search: { fn: tools.search, argCount: 1, customArgs: true },
  browse: { fn: tools.browse, argCount: 1 },
  fetchPage: { fn: tools.fetchPage, argCount: 1 },

  // 系统
  listApps: { fn: tools.listApps, argCount: 0 },
  openApp: { fn: tools.openApp, argCount: 1 },
  closeApp: { fn: tools.closeApp, argCount: 1 },

  // 浏览器自动化
  initBrowser: { fn: tools.initBrowser, argCount: 1 },
  clickElement: { fn: tools.clickElement, argCount: 2 },
  fillField: { fn: tools.fillField, argCount: 3 },
  selectOption: { fn: tools.selectOption, argCount: 2 },
  viewChanges: { fn: tools.viewChanges, argCount: 0 },
  getPageContent: { fn: tools.getPageContent, argCount: 0 },
  takeScreenshot: { fn: tools.takeScreenshot, argCount: 1 },
  closeBrowser: { fn: tools.closeBrowser, argCount: 0 },
  searchOnPage: { fn: tools.searchOnPage, argCount: 2 },
  findElements: { fn: tools.findElements, argCount: 2 },
  searchOnEngine: { fn: tools.searchOnEngine, argCount: 2 },
  downloadFile: { fn: tools.downloadFile, argCount: 3 },

  // 代码执行
  executeCode: { fn: tools.executeCode, argCount: 2 },
  executeFile: { fn: tools.executeFile, argCount: 2 },
  runJavaScript: { fn: tools.runJavaScript, argCount: 1 },
  runPython: { fn: tools.runPython, argCount: 1 },
  formatCode: { fn: tools.formatCode, argCount: 2 },

  // Git
  gitInit: { fn: tools.gitInit, argCount: 1 },
  gitClone: { fn: tools.gitClone, argCount: 3 },
  gitAdd: { fn: tools.gitAdd, argCount: 2 },
  gitCommit: { fn: tools.gitCommit, argCount: 2 },
  gitPush: { fn: tools.gitPush, argCount: 3 },
  gitPull: { fn: tools.gitPull, argCount: 3 },
  gitStatus: { fn: tools.gitStatus, argCount: 1 },
  gitLog: { fn: tools.gitLog, argCount: 2 },
  gitBranchCreate: { fn: tools.gitBranchCreate, argCount: 2 },
  gitBranchDelete: { fn: tools.gitBranchDelete, argCount: 2 },
  gitBranchList: { fn: tools.gitBranchList, argCount: 1 },
  gitCheckout: { fn: tools.gitCheckout, argCount: 2 },
  gitCheckoutNew: { fn: tools.gitCheckoutNew, argCount: 2 },
  gitMerge: { fn: tools.gitMerge, argCount: 2 },
  gitDiff: { fn: tools.gitDiff, argCount: 2 },
  gitRemoteAdd: { fn: tools.gitRemoteAdd, argCount: 3 },
  gitRemoteList: { fn: tools.gitRemoteList, argCount: 1 },
  gitConfigUser: { fn: tools.gitConfigUser, argCount: 3 },
  gitReset: { fn: tools.gitReset, argCount: 2 },
  gitStash: { fn: tools.gitStash, argCount: 1 },
  gitStashPop: { fn: tools.gitStashPop, argCount: 1 },

  // 任务管理
  createTask: { fn: tools.createTask, argCount: 4 },
  getTasks: { fn: tools.getTasks, argCount: 1 },
  getTask: { fn: tools.getTask, argCount: 1 },
  updateTask: { fn: tools.updateTask, argCount: 2 },
  deleteTask: { fn: tools.deleteTask, argCount: 1 },
  completeTask: { fn: tools.completeTask, argCount: 1 },
  splitTask: { fn: tools.splitTask, argCount: 2, parseJson: [false, true] },
  getTaskStats: { fn: tools.getTaskStats, argCount: 0 },
  clearTasks: { fn: tools.clearTasks, argCount: 0 },

  // 记忆系统
  addMemory: { fn: tools.addMemory, argCount: 3, parseJson: [false, true, false] },
  searchMemory: { fn: tools.searchMemory, argCount: 2 },
  getAllMemories: { fn: tools.getAllMemories, argCount: 1 },
  getMemory: { fn: tools.getMemory, argCount: 1 },
  updateMemory: { fn: tools.updateMemory, argCount: 2 },
  deleteMemory: { fn: tools.deleteMemory, argCount: 1 },
  getMemoryStats: { fn: tools.getMemoryStats, argCount: 0 },
  getRelatedMemories: { fn: tools.getRelatedMemories, argCount: 2 },
  clearMemory: { fn: tools.clearMemory, argCount: 0 },

  // 数据处理
  readCSV: { fn: tools.readCSV, argCount: 1 },
  writeCSV: { fn: tools.writeCSV, argCount: 3, parseJson: [false, true, true] },
  readJSON: { fn: tools.readJSON, argCount: 1 },
  writeJSON: { fn: tools.writeJSON, argCount: 2, parseJson: [false, true] },
  csvToJSON: { fn: tools.csvToJSON, argCount: 2 },
  jsonToCSV: { fn: tools.jsonToCSV, argCount: 2 },
  queryData: { fn: tools.queryData, argCount: 2, parseJson: [false, true] },
  analyzeData: { fn: tools.analyzeData, argCount: 1 },
  sortData: { fn: tools.sortData, argCount: 3 },

  // 数据库
  executeSQL: { fn: tools.executeSQL, argCount: 2, parseJson: [false, true] },
  query: { fn: tools.query, argCount: 3, parseJson: [false, true, true] },
  insert: { fn: tools.insert, argCount: 2, parseJson: [false, true] },
  update: { fn: tools.update, argCount: 3, parseJson: [false, true, true] },
  deleteData: { fn: tools.deleteData, argCount: 2, parseJson: [false, true] },
  createTable: { fn: tools.createTable, argCount: 2, parseJson: [false, true] },
  dropTable: { fn: tools.dropTable, argCount: 1 },
  getTables: { fn: tools.getTables, argCount: 0 },
  getTableSchema: { fn: tools.getTableSchema, argCount: 1 },
  executeTransaction: { fn: tools.executeTransaction, argCount: 1, parseJson: [true] },
  closeDB: { fn: tools.closeDB, argCount: 0 },

  // 邮件
  sendEmail: { fn: tools.sendEmail, argCount: 4, parseJson: [false, false, false, true] },
  sendTextEmail: { fn: tools.sendTextEmail, argCount: 3 },
  sendHtmlEmail: { fn: tools.sendHtmlEmail, argCount: 3 },
  sendTemplateEmail: { fn: tools.sendTemplateEmail, argCount: 4, parseJson: [false, false, false, true] },
  sendEmailWithAttachments: { fn: tools.sendEmailWithAttachments, argCount: 4, parseJson: [false, false, false, true] },
  checkEmailConfig: { fn: tools.checkEmailConfig, argCount: 0 },

  // 系统监控
  getCPUInfo: { fn: tools.getCPUInfo, argCount: 0 },
  getMemoryInfo: { fn: tools.getMemoryInfo, argCount: 0 },
  getDiskInfo: { fn: tools.getDiskInfo, argCount: 0 },
  getNetworkInfo: { fn: tools.getNetworkInfo, argCount: 0 },
  getProcesses: { fn: tools.getProcesses, argCount: 0 },
  getSystemInfo: { fn: tools.getSystemInfo, argCount: 0 },
  getCurrentProcess: { fn: tools.getCurrentProcess, argCount: 0 },
  getSystemLoad: { fn: tools.getSystemLoad, argCount: 0 },
  monitorSystem: { fn: tools.monitorSystem, argCount: 0 },

  // 定时任务
  addScheduleTask: { fn: tools.addScheduleTask, argCount: 4, parseJson: [false, false, false, true] },
  getScheduleTasks: { fn: tools.getScheduleTasks, argCount: 0 },
  getScheduleTask: { fn: tools.getScheduleTask, argCount: 1 },
  updateScheduleTask: { fn: tools.updateScheduleTask, argCount: 2, parseJson: [false, true] },
  toggleScheduleTask: { fn: tools.toggleScheduleTask, argCount: 1 },
  removeScheduleTask: { fn: tools.removeScheduleTask, argCount: 1 },
  startScheduler: { fn: tools.startScheduler, argCount: 0 },
  stopScheduler: { fn: tools.stopScheduler, argCount: 0 },
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
 * 按类别获取工具列表
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
    scheduler: ['addScheduleTask', 'getScheduleTasks', 'getScheduleTask', 'updateScheduleTask', 'toggleScheduleTask', 'removeScheduleTask', 'startScheduler', 'stopScheduler']
  };
}

export {
  TOOL_REGISTRY,
  DANGEROUS_OPERATIONS,
  getToolNames,
  getToolRegistry,
  hasTool,
  isDangerousOperation,
  isConfirmEnabled,
  getToolsByCategory
};
