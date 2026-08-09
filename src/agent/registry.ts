import * as tools from './tools/index.ts';
import { loadConfig } from '../config.ts';
import { safeParseJSON } from '../utils/llm-validator.ts';
import type { ToolRegistryEntry, ToolCategory } from '../types/index.ts';

const TOOL_CATEGORIES: Record<ToolCategory, string> = {
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
  image: '图像生成',
  office: 'Office文档',
  cluster: '集群管理',
  wechat: '微信消息',
  chemistry: '化学信息学',
  bioinformatics: '生物信息学',
  literature: '文献检索',
  mcp: '外部MCP工具',
};

const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  ls: { fn: tools.ls, argCount: 1, category: 'file' },
  read: { fn: tools.read, argCount: 1, category: 'file' },
  copy: { fn: tools.copy, argCount: 2, category: 'file' },
  mkdir: { fn: tools.mkdir, argCount: 1, category: 'file' },
  create: { fn: tools.create, argCount: 2, category: 'file', customArgs: true },

  search: { fn: tools.search, argCount: 1, category: 'web', customArgs: true },
  browse: { fn: tools.browse, argCount: 1, category: 'web' },
  fetchPage: { fn: tools.fetchPage, argCount: 1, category: 'web' },

  listApps: { fn: tools.listApps, argCount: 0, category: 'system' },
  openApp: { fn: tools.openApp, argCount: 1, category: 'system' },
  closeApp: { fn: tools.closeApp, argCount: 1, category: 'system' },

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

  executeCode: { fn: tools.executeCode, argCount: 2, category: 'code' },
  executeFile: { fn: tools.executeFile, argCount: 2, category: 'code' },
  runJavaScript: { fn: tools.runJavaScript, argCount: 1, category: 'code' },
  runPython: { fn: tools.runPython, argCount: 1, category: 'code' },
  formatCode: { fn: tools.formatCode, argCount: 2, category: 'code' },

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

  createTask: { fn: tools.createTask, argCount: 4, category: 'task' },
  getTasks: { fn: tools.getTasks, argCount: 1, category: 'task' },
  getTask: { fn: tools.getTask, argCount: 1, category: 'task' },
  updateTask: { fn: tools.updateTask, argCount: 2, category: 'task' },
  deleteTask: { fn: tools.deleteTask, argCount: 1, category: 'task' },
  completeTask: { fn: tools.completeTask, argCount: 1, category: 'task' },
  splitTask: { fn: tools.splitTask, argCount: 2, category: 'task', parseJson: [false, true] },
  getTaskStats: { fn: tools.getTaskStats, argCount: 0, category: 'task' },
  clearTasks: { fn: tools.clearTasks, argCount: 0, category: 'task' },

  addMemory: {
    fn: tools.addMemory,
    argCount: 3,
    category: 'memory',
    parseJson: [false, true, false],
    jsonParams: ['content', 'tags', 'category'],
  },
  searchMemory: { fn: tools.searchMemory, argCount: 2, category: 'memory' },
  getAllMemories: { fn: tools.getAllMemories, argCount: 1, category: 'memory' },
  getMemory: { fn: tools.getMemory, argCount: 1, category: 'memory' },
  updateMemory: {
    fn: tools.updateMemory,
    argCount: 2,
    category: 'memory',
    parseJson: [false, true],
    jsonParams: ['id', 'updates'],
  },
  deleteMemory: { fn: tools.deleteMemory, argCount: 1, category: 'memory' },
  getMemoryStats: { fn: tools.getMemoryStats, argCount: 0, category: 'memory' },
  getRelatedMemories: { fn: tools.getRelatedMemories, argCount: 2, category: 'memory' },
  clearMemory: { fn: tools.clearMemory, argCount: 0, category: 'memory' },

  readCSV: { fn: tools.readCSV, argCount: 1, category: 'data' },
  writeCSV: { fn: tools.writeCSV, argCount: 3, category: 'data', parseJson: [false, true, true] },
  readJSON: { fn: tools.readJSON, argCount: 1, category: 'data' },
  writeJSON: { fn: tools.writeJSON, argCount: 2, category: 'data', parseJson: [false, true] },
  csvToJSON: { fn: tools.csvToJSON, argCount: 2, category: 'data' },
  jsonToCSV: { fn: tools.jsonToCSV, argCount: 2, category: 'data' },
  queryData: { fn: tools.queryData, argCount: 2, category: 'data', parseJson: [false, true] },
  analyzeData: { fn: tools.analyzeData, argCount: 1, category: 'data' },
  sortData: { fn: tools.sortData, argCount: 3, category: 'data' },

  executeSQL: { fn: tools.executeSQL, argCount: 2, category: 'db', parseJson: [false, true] },
  query: { fn: tools.query, argCount: 3, category: 'db', parseJson: [false, true, true] },
  insert: { fn: tools.insert, argCount: 2, category: 'db', parseJson: [false, true] },
  update: { fn: tools.update, argCount: 3, category: 'db', parseJson: [false, true, true] },
  deleteData: { fn: tools.deleteData, argCount: 2, category: 'db', parseJson: [false, true] },
  createTable: { fn: tools.createTable, argCount: 2, category: 'db', parseJson: [false, true] },
  dropTable: { fn: tools.dropTable, argCount: 1, category: 'db' },
  getTables: { fn: tools.getTables, argCount: 0, category: 'db' },
  getTableSchema: { fn: tools.getTableSchema, argCount: 1, category: 'db' },
  executeTransaction: {
    fn: tools.executeTransaction,
    argCount: 1,
    category: 'db',
    parseJson: [true],
  },
  closeDB: { fn: tools.closeDB, argCount: 0, category: 'db' },

  sendEmail: {
    fn: tools.sendEmail,
    argCount: 4,
    category: 'email',
    parseJson: [false, false, false, true],
  },
  sendTextEmail: { fn: tools.sendTextEmail, argCount: 3, category: 'email' },
  sendHtmlEmail: { fn: tools.sendHtmlEmail, argCount: 3, category: 'email' },
  sendTemplateEmail: {
    fn: tools.sendTemplateEmail,
    argCount: 4,
    category: 'email',
    parseJson: [false, false, false, true],
  },
  sendEmailWithAttachments: {
    fn: tools.sendEmailWithAttachments,
    argCount: 4,
    category: 'email',
    parseJson: [false, false, false, true],
  },
  checkEmailConfig: { fn: tools.checkEmailConfig, argCount: 0, category: 'email' },

  getCPUInfo: { fn: tools.getCPUInfo, argCount: 0, category: 'monitor' },
  getMemoryInfo: { fn: tools.getMemoryInfo, argCount: 0, category: 'monitor' },
  getDiskInfo: { fn: tools.getDiskInfo, argCount: 0, category: 'monitor' },
  getNetworkInfo: { fn: tools.getNetworkInfo, argCount: 0, category: 'monitor' },
  getProcesses: { fn: tools.getProcesses, argCount: 0, category: 'monitor' },
  getSystemInfo: { fn: tools.getSystemInfo, argCount: 0, category: 'monitor' },
  getCurrentProcess: { fn: tools.getCurrentProcess, argCount: 0, category: 'monitor' },
  getSystemLoad: { fn: tools.getSystemLoad, argCount: 0, category: 'monitor' },
  monitorSystem: { fn: tools.monitorSystem, argCount: 0, category: 'monitor' },

  addScheduleTask: {
    fn: tools.addScheduleTask,
    argCount: 4,
    category: 'scheduler',
    parseJson: [false, false, false, true],
  },
  getScheduleTasks: { fn: tools.getScheduleTasks, argCount: 0, category: 'scheduler' },
  getScheduleTask: { fn: tools.getScheduleTask, argCount: 1, category: 'scheduler' },
  updateScheduleTask: {
    fn: tools.updateScheduleTask,
    argCount: 2,
    category: 'scheduler',
    parseJson: [false, true],
  },
  toggleScheduleTask: { fn: tools.toggleScheduleTask, argCount: 1, category: 'scheduler' },
  removeScheduleTask: { fn: tools.removeScheduleTask, argCount: 1, category: 'scheduler' },
  startScheduler: { fn: tools.startScheduler, argCount: 0, category: 'scheduler' },
  stopScheduler: { fn: tools.stopScheduler, argCount: 0, category: 'scheduler' },

  ocr: { fn: tools.ocr, argCount: 2, category: 'ocr' },
  ocrBatch: { fn: tools.ocrBatch, argCount: 1, category: 'ocr' },

  vision: { fn: tools.vision, argCount: 2, category: 'vision' },
  visionFromUrl: { fn: tools.visionFromUrl, argCount: 2, category: 'vision' },

  generateImage: { fn: tools.generateImage, argCount: 8, category: 'image' },

  createPpt: { fn: tools.createPpt, argCount: 1, category: 'office' },
  createWord: { fn: tools.createWord, argCount: 1, category: 'office' },
  createExcel: { fn: tools.createExcel, argCount: 1, category: 'office' },
  readExcel: { fn: tools.readExcel, argCount: 1, category: 'office' },
  readWord: { fn: tools.readWord, argCount: 1, category: 'office' },
  readPpt: { fn: tools.readPpt, argCount: 1, category: 'office' },

  spawnAgent: { fn: tools.spawnAgent, argCount: 3, category: 'cluster' },
  delegateTask: { fn: tools.delegateTask, argCount: 2, category: 'cluster' },
  getClusterStatus: { fn: tools.getClusterStatus, argCount: 0, category: 'cluster' },
  stopAgent: { fn: tools.stopAgent, argCount: 1, category: 'cluster' },
  stopAllAgents: { fn: tools.stopAllAgents, argCount: 0, category: 'cluster' },
  parallelExecute: {
    fn: tools.parallelExecute,
    argCount: 1,
    category: 'cluster',
    parseJson: [true],
  },
  getAgent: { fn: tools.getAgent, argCount: 1, category: 'cluster' },
  getAgentTranscript: { fn: tools.getAgentTranscript, argCount: 1, category: 'cluster' },
  panelDiscussion: {
    fn: tools.panelDiscussion,
    argCount: 2,
    category: 'cluster',
    parseJson: [false, true],
  },
  pipeline: { fn: tools.pipeline, argCount: 1, category: 'cluster', parseJson: [true] },
  voting: { fn: tools.voting, argCount: 2, category: 'cluster', parseJson: [false, true] },

  loginWechat: { fn: tools.loginWechat, argCount: 0, category: 'wechat' },
  logoutWechat: { fn: tools.logoutWechat, argCount: 0, category: 'wechat' },
  sendWechatMessage: { fn: tools.sendWechatMessage, argCount: 2, category: 'wechat' },
  sendWechatImage: { fn: tools.sendWechatImage, argCount: 2, category: 'wechat' },
  getWechatStatus: { fn: tools.getWechatStatus, argCount: 0, category: 'wechat' },
  generateWechatQRCode: { fn: tools.generateWechatQRCode, argCount: 0, category: 'wechat' },
};

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
  'removeScheduleTask',
  'executeSQL',
  'executeTransaction',
]);

/**
 * 危险操作的中文描述，用于前端确认框展示，帮助用户判断是否放行。
 * 若工具未在此登记则回退到工具名。
 */
const DANGEROUS_OPERATION_HINTS: Record<string, string> = {
  gitPush: '执行 git push 推送代码到远程仓库',
  gitReset: '执行 git reset 重置本地分支（可能丢弃提交）',
  gitBranchDelete: '删除 git 分支',
  executeCode: '在本地沙箱中执行代码',
  executeFile: '执行本地文件',
  runJavaScript: '在本地运行 JavaScript 代码',
  runPython: '在本地运行 Python 代码',
  deleteData: '删除数据库表数据',
  dropTable: '删除数据库表结构',
  clearTasks: '清空全部定时任务',
  clearMemory: '清空智能体记忆',
  removeScheduleTask: '删除定时任务',
  executeSQL: '执行任意 SQL 语句（请确认写操作范围）',
  executeTransaction: '执行一组 SQL 事务（可能包含写入/删除操作）',
};

function getDangerousOperationHint(toolName: string): string {
  return DANGEROUS_OPERATION_HINTS[toolName] || toolName;
}

function getToolNames(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

function getToolRegistry(toolName: string): ToolRegistryEntry | null {
  return TOOL_REGISTRY[toolName] || null;
}

function hasTool(toolName: string): boolean {
  return toolName in TOOL_REGISTRY;
}

function isDangerousOperation(toolName: string): boolean {
  return DANGEROUS_OPERATIONS.has(toolName);
}

function isConfirmEnabled(): boolean {
  // 环境变量显式关闭（最高优先级，用于 CI/测试环境）
  if (process.env.COGITO_CONFIRM_DANGEROUS === 'false') {
    return false;
  }
  // 其次检查 config.json 中的 security.confirmDangerous
  const config = loadConfig();
  const security = (config as unknown as Record<string, unknown>).security as
    Record<string, unknown> | undefined;
  if (security && security.confirmDangerous === false) {
    return false;
  }
  return true;
}

function getToolsByCategory(): Record<ToolCategory, string[]> {
  // 从 TOOL_REGISTRY 动态派生，避免与注册表维护两份硬编码清单（曾因此分叉：
  // 注册表新增工具后忘记同步此处的分类列表，导致 /tools 与系统提示词漏列工具）。
  const result = {} as Record<ToolCategory, string[]>;
  for (const cat of Object.keys(TOOL_CATEGORIES) as ToolCategory[]) {
    result[cat] = [];
  }
  for (const [name, info] of Object.entries(TOOL_REGISTRY)) {
    const cat = info.category as ToolCategory;
    if (result[cat]) {
      result[cat].push(name);
    }
  }
  return result;
}

function getEnabledCategories(): ToolCategory[] {
  const cfg = loadConfig();
  const enabled = cfg.tools?.enabledCategories;

  if (!enabled || !Array.isArray(enabled) || enabled.length === 0) {
    return Object.keys(TOOL_CATEGORIES) as ToolCategory[];
  }

  return enabled.filter((cat): cat is ToolCategory => cat in TOOL_CATEGORIES);
}

/**
 * 供前端「技能与工具」面板渲染的工具总览：分类 + 工具 + 危险操作清单。
 * 从注册表动态派生，避免前端硬编码清单与注册表分叉（曾因此漏展示大量工具）。
 */
function getToolsOverview(): {
  categories: Array<{ id: string; name: string; tools: string[] }>;
  dangerous: string[];
} {
  const byCategory = getToolsByCategory();
  const categories = (Object.keys(byCategory) as ToolCategory[])
    .filter((cat) => (byCategory[cat] || []).length > 0)
    .map((cat) => ({
      id: cat,
      name: TOOL_CATEGORIES[cat] || cat,
      tools: byCategory[cat],
    }));
  return { categories, dangerous: Array.from(DANGEROUS_OPERATIONS) };
}

function getAllCategories(): Record<ToolCategory, string> {
  return { ...TOOL_CATEGORIES };
}

function getEnabledToolNames(): string[] {
  const enabledCategories = getEnabledCategories();
  const toolNames: string[] = [];

  for (const [name, info] of Object.entries(TOOL_REGISTRY)) {
    if (enabledCategories.includes(info.category as ToolCategory)) {
      toolNames.push(name);
    }
  }

  return toolNames;
}

/**
 * 工具调用前的参数预处理。
 * 此前该逻辑只存在于 Agent.ts 的 executeTool 内，子智能体（orchestrator.ts）直接用原始参数
 * 调用 registry.fn，导致依赖 JSON 解析的工具（parallelExecute/pipeline/voting 等）在子智能体
 * 场景下收到字符串而非对象，行为异常。提取为共享函数消除分叉。
 */
function preprocessToolArgs(toolName: string, args: unknown): unknown {
  const registry = TOOL_REGISTRY[toolName];
  if (!registry) return args;

  const { parseJson, jsonParams } = registry;
  let processedArgs = args;

  if (
    args &&
    typeof args === 'object' &&
    'isJson' in args &&
    (args as { isJson: boolean }).isJson === true
  ) {
    const jsonData = (args as unknown as { data: Record<string, unknown> }).data;
    if (jsonParams) {
      processedArgs = jsonParams.map((paramName: string) => jsonData[paramName]);
    } else {
      processedArgs = [jsonData];
    }
  } else if (Array.isArray(args)) {
    if (toolName === 'create') {
      processedArgs = [args[0], args.slice(1).join(',')];
    } else if (toolName === 'search') {
      processedArgs = [args.join(',').trim()];
    } else if (parseJson) {
      processedArgs = args.map((arg, i) => {
        if (Array.isArray(parseJson) && parseJson[i] && typeof arg === 'string') {
          const parsed = safeParseJSON(arg);
          return parsed.success && parsed.data !== null ? parsed.data : arg;
        }
        return arg;
      });
    }
  }

  return processedArgs;
}

export {
  TOOL_REGISTRY,
  TOOL_CATEGORIES,
  DANGEROUS_OPERATIONS,
  getToolNames,
  getToolRegistry,
  hasTool,
  isDangerousOperation,
  getDangerousOperationHint,
  isConfirmEnabled,
  getToolsByCategory,
  getEnabledCategories,
  getToolsOverview,
  getAllCategories,
  getEnabledToolNames,
  preprocessToolArgs,
};
