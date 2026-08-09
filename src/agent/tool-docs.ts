import type { ToolParamDoc, ToolAnnotations } from '../types/index.ts';

/**
 * 工具文档单一来源（R1.5）。
 *
 * 这里是所有工具「参数名 / 说明 / 注解」的唯一事实来源：
 *  - tool-schema.ts 根据 TOOL_DOCS 生成 JSON Schema（R1.1）；
 *  - system-prompt.ts 根据 TOOL_DOCS 生成系统提示词里的工具列表；
 *  - 未在 TOOL_DOCS 中登记的工具由 tool-schema.ts 按 argCount 自动退化为
 *    位置参数 schema（arg0/arg1/...），保证协议层始终可用。
 */

export interface ToolDoc {
  description: string;
  params: ToolParamDoc[];
  annotations?: ToolAnnotations;
  securityWarning?: string;
}

function p(
  name: string,
  type: ToolParamDoc['type'] = 'string',
  description?: string,
): ToolParamDoc {
  return { name, type, description };
}

export const TOOL_DOCS: Record<string, ToolDoc> = {
  // ---- file ----
  ls: { description: '列出目录内容', params: [p('path', 'string', '目标目录路径')] },
  read: { description: '读取文件内容', params: [p('path')] },
  copy: { description: '复制文件', params: [p('src'), p('dest')] },
  mkdir: { description: '创建文件夹', params: [p('path')] },
  create: {
    description: '创建文件',
    params: [p('path', 'string', '文件路径'), p('content', 'string', '文件内容')],
    annotations: { destructiveHint: true },
  },

  // ---- web ----
  search: { description: '联网搜索', params: [p('query')] },
  browse: { description: '在默认浏览器中打开网址', params: [p('url')] },
  fetchPage: { description: '抓取网页正文内容', params: [p('url')] },

  // ---- system ----
  listApps: { description: '列出已安装软件', params: [] },
  openApp: { description: '打开软件', params: [p('name')] },
  closeApp: { description: '关闭软件', params: [p('name')] },

  // ---- browser ----
  initBrowser: { description: '初始化浏览器', params: [p('url')] },
  clickElement: {
    description: '点击网页元素',
    params: [p('selector'), p('description', 'string', '元素用途描述（可选）')],
  },
  fillField: {
    description: '填写表单',
    params: [p('selector'), p('value'), p('description', 'string', '字段用途描述（可选）')],
  },
  selectOption: {
    description: '选择下拉选项',
    params: [p('selector'), p('value')],
  },
  viewChanges: { description: '查看页面变化', params: [] },
  getPageContent: { description: '获取页面内容', params: [] },
  takeScreenshot: { description: '截图', params: [p('name', 'string', '截图文件名（可选）')] },
  closeBrowser: { description: '关闭浏览器', params: [] },
  searchOnPage: {
    description: '在页面中搜索文本',
    params: [p('text'), p('selector')],
  },
  findElements: {
    description: '查找页面上符合选择器的元素',
    params: [p('selector'), p('description')],
  },
  searchOnEngine: {
    description: '在搜索引擎上搜索关键词',
    params: [p('keyword'), p('engine')],
  },
  downloadFile: {
    description: '从页面下载文件',
    params: [p('selector'), p('path'), p('description')],
  },

  // ---- code ----
  executeCode: {
    description: '执行代码（JavaScript/Python）',
    params: [p('code'), p('language', 'string', '语言（javascript/python），可选')],
  },
  executeFile: {
    description: '执行本地脚本文件',
    params: [p('file'), p('language')],
  },
  runJavaScript: {
    description: '执行 JavaScript 代码',
    params: [p('code')],
    securityWarning: '',
  },
  runPython: {
    description: '执行 Python 代码',
    params: [p('code')],
    securityWarning: '',
  },
  formatCode: {
    description: '格式化代码',
    params: [p('code'), p('language')],
  },

  // ---- git ----
  gitInit: { description: '初始化 git 仓库', params: [p('cwd')] },
  gitClone: {
    description: '克隆仓库',
    params: [p('url'), p('dest'), p('cwd')],
  },
  gitAdd: { description: '添加文件到暂存区', params: [p('files'), p('cwd')] },
  gitCommit: { description: '提交更改', params: [p('message'), p('cwd')] },
  gitPush: {
    description: '推送代码到远程仓库',
    params: [p('remote'), p('branch'), p('cwd')],
    annotations: { destructiveHint: true },
  },
  gitPull: {
    description: '拉取远程变更',
    params: [p('remote'), p('branch'), p('cwd')],
  },
  gitStatus: { description: '查看工作区状态', params: [p('cwd')] },
  gitLog: {
    description: '查看提交历史',
    params: [p('options', 'string', 'git log 选项，如 --oneline -5'), p('cwd')],
  },
  gitBranchCreate: {
    description: '创建分支',
    params: [p('branch'), p('cwd')],
  },
  gitBranchDelete: {
    description: '删除本地分支',
    params: [p('branch'), p('cwd')],
    annotations: { destructiveHint: true },
  },
  gitBranchList: { description: '列出分支', params: [p('cwd')] },
  gitCheckout: {
    description: '切换分支',
    params: [p('branch'), p('cwd')],
  },
  gitCheckoutNew: {
    description: '创建并切换到新分支',
    params: [p('branch'), p('cwd')],
  },
  gitMerge: {
    description: '合并分支',
    params: [p('branch'), p('cwd')],
  },
  gitDiff: {
    description: '查看差异',
    params: [p('options'), p('cwd')],
  },
  gitRemoteAdd: {
    description: '添加远程仓库别名',
    params: [p('name'), p('url'), p('cwd')],
  },
  gitRemoteList: {
    description: '列出远程仓库',
    params: [p('cwd')],
  },
  gitConfigUser: {
    description: '配置 git 用户信息',
    params: [p('name'), p('email'), p('cwd')],
  },
  gitReset: {
    description: '重置本地分支',
    params: [p('options'), p('cwd')],
    annotations: { destructiveHint: true },
  },
  gitStash: { description: '暂存更改', params: [p('cwd')] },
  gitStashPop: { description: '恢复暂存更改', params: [p('cwd')] },

  // ---- task ----
  createTask: {
    description: '创建任务',
    params: [
      p('title'),
      p('description', 'any', '任务描述（JSON 对象，可选）'),
      p('priority', 'any', '优先级，如 high/medium/low'),
      p('parentId', 'any', '父任务 ID（可选）'),
    ],
  },
  getTasks: {
    description: '获取任务列表',
    params: [p('filter', 'any', '过滤条件（JSON 对象，可选）')],
  },
  getTask: { description: '获取单个任务', params: [p('id', 'any', '任务 ID')] },
  updateTask: {
    description: '更新任务',
    params: [p('id', 'any', '任务 ID'), p('updates', 'any', '更新字段（JSON 对象）')],
  },
  deleteTask: { description: '删除任务', params: [p('id', 'any', '任务 ID')] },
  completeTask: { description: '完成任务', params: [p('id', 'any', '任务 ID')] },
  splitTask: {
    description: '将任务分解为子任务',
    params: [p('id', 'any', '任务 ID'), p('subtasks', 'any', '子任务数组')],
  },
  getTaskStats: { description: '获取任务统计', params: [] },
  clearTasks: {
    description: '清空全部任务',
    params: [],
    annotations: { destructiveHint: true },
  },

  // ---- memory ----
  addMemory: {
    description: '添加记忆',
    params: [
      p('content', 'string', '记忆内容'),
      p('tags', 'any', '标签数组'),
      p('category', 'string', '分类（可选）'),
    ],
  },
  searchMemory: {
    description: '搜索记忆',
    params: [p('query'), p('limit', 'number', '返回条数上限')],
  },
  getAllMemories: {
    description: '获取所有记忆',
    params: [p('category', 'string', '按分类过滤（可选）')],
  },
  getMemory: { description: '获取单条记忆', params: [p('id', 'any', '记忆 ID')] },
  updateMemory: {
    description: '更新记忆',
    params: [p('id', 'any', '记忆 ID'), p('updates', 'any', '更新字段（JSON 对象）')],
  },
  deleteMemory: { description: '删除记忆', params: [p('id', 'any', '记忆 ID')] },
  getMemoryStats: { description: '获取记忆统计', params: [] },
  getRelatedMemories: {
    description: '获取相关记忆',
    params: [p('query'), p('limit', 'number')],
  },
  clearMemory: {
    description: '清空智能体记忆',
    params: [],
    annotations: { destructiveHint: true },
  },

  // ---- data ----
  readCSV: { description: '读取 CSV 文件', params: [p('filePath')] },
  writeCSV: {
    description: '写入 CSV 文件',
    params: [p('filePath'), p('headers', 'any', '表头数组'), p('rows', 'any', '数据行数组')],
  },
  readJSON: { description: '读取 JSON 文件', params: [p('filePath')] },
  writeJSON: {
    description: '写入 JSON 文件',
    params: [p('filePath'), p('data', 'any', '要写入的数据')],
  },
  csvToJSON: {
    description: 'CSV 转 JSON',
    params: [p('csvPath'), p('jsonPath')],
  },
  jsonToCSV: {
    description:
      'JSON 转 CSV。JSON 文件必须是对象数组 [{...}, ...] 或 { headers: [...], rows: [...] } 格式',
    params: [p('jsonPath'), p('csvPath')],
  },
  queryData: {
    description:
      '按条件查询 JSON/CSV 数据。JSON 文件必须是对象数组 [{...}, ...] 或 { rows: [...] } 格式',
    params: [p('filePath'), p('query', 'any', '查询条件（JSON 对象）')],
  },
  analyzeData: {
    description: '分析数据',
    params: [p('filePath')],
  },
  sortData: {
    description:
      '按指定列排序 JSON/CSV 数据。JSON 文件必须是对象数组 [{...}, ...] 或 { headers: [...], rows: [...] } 格式',
    params: [p('filePath'), p('by'), p('order', 'string', 'asc / desc')],
  },

  // ---- db ----
  executeSQL: {
    description: '执行 SQL 语句',
    params: [p('sql'), p('params', 'any', '参数数组（可选）')],
    annotations: { destructiveHint: true },
  },
  query: {
    description: '查询数据表',
    params: [
      p('table'),
      p('conditions', 'any', '查询条件（JSON 对象）'),
      p('options', 'any', '查询选项（可选）'),
    ],
  },
  insert: {
    description: '向表插入数据',
    params: [p('table'), p('data', 'any', '数据（JSON 对象）')],
  },
  update: {
    description: '更新表数据',
    params: [
      p('table'),
      p('data', 'any', '更新字段（JSON 对象）'),
      p('conditions', 'any', '更新条件（JSON 对象）'),
    ],
  },
  deleteData: {
    description: '删除表数据',
    params: [p('table'), p('conditions', 'any', '删除条件（JSON 对象）')],
    annotations: { destructiveHint: true },
  },
  createTable: {
    description: '创建表',
    params: [p('name'), p('columns', 'any', '列定义数组')],
  },
  dropTable: {
    description: '删除表',
    params: [p('name')],
    annotations: { destructiveHint: true },
  },
  getTables: { description: '获取全部表', params: [] },
  getTableSchema: { description: '查看表结构', params: [p('tableName')] },
  executeTransaction: {
    description: '执行一组 SQL 事务',
    params: [p('sqlStatements', 'any', 'SQL 语句数组')],
    annotations: { destructiveHint: true },
  },
  closeDB: { description: '关闭数据库连接', params: [] },

  // ---- email ----
  sendEmail: {
    description: '发送邮件',
    params: [p('to'), p('subject'), p('body'), p('options', 'any', '邮件选项（对象）')],
  },
  sendTextEmail: {
    description: '发送纯文本邮件',
    params: [p('to'), p('subject'), p('body')],
  },
  sendHtmlEmail: {
    description: '发送 HTML 邮件',
    params: [p('to'), p('subject'), p('html')],
  },
  sendTemplateEmail: {
    description: '发送模板邮件',
    params: [p('to'), p('subject'), p('template'), p('data', 'any', '模板数据（对象）')],
  },
  sendEmailWithAttachments: {
    description: '发送带附件邮件',
    params: [p('to'), p('subject'), p('body'), p('attachments', 'any', '附件路径数组')],
  },
  checkEmailConfig: { description: '检查邮件配置', params: [] },

  // ---- monitor ----
  getCPUInfo: { description: '获取 CPU 信息', params: [] },
  getMemoryInfo: { description: '获取内存信息', params: [] },
  getDiskInfo: { description: '获取磁盘信息', params: [] },
  getNetworkInfo: { description: '获取网络信息', params: [] },
  getProcesses: { description: '获取进程列表', params: [] },
  getSystemInfo: { description: '获取系统信息', params: [] },
  getCurrentProcess: { description: '获取当前进程信息', params: [] },
  getSystemLoad: { description: '获取系统负载', params: [] },
  monitorSystem: { description: '监控系统资源', params: [] },

  // ---- scheduler ----
  addScheduleTask: {
    description: '添加定时任务',
    params: [p('name'), p('cronExpr'), p('action'), p('params', 'any', '任务参数（对象）')],
  },
  getScheduleTasks: { description: '获取定时任务列表', params: [] },
  getScheduleTask: { description: '获取单个定时任务', params: [p('id', 'any', '任务 ID')] },
  updateScheduleTask: {
    description: '更新定时任务',
    params: [p('id', 'any', '任务 ID'), p('updates', 'any', '更新字段（对象）')],
  },
  toggleScheduleTask: {
    description: '启用/禁用定时任务',
    params: [p('id', 'any', '任务 ID')],
  },
  removeScheduleTask: {
    description: '删除定时任务',
    params: [p('id', 'any', '任务 ID')],
    annotations: { destructiveHint: true },
  },
  startScheduler: { description: '启动定时器', params: [] },
  stopScheduler: { description: '停止定时器', params: [] },

  // ---- ocr ----
  ocr: {
    description: '识别图片中的文字',
    params: [p('imagePath'), p('prompt', 'string', '识别提示词（可选）')],
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ocrBatch: {
    description: '批量识别多张图片文字',
    params: [p('images', 'any', '图片路径数组（或逗号分隔字符串）')],
    annotations: { readOnlyHint: true, openWorldHint: true },
  },

  // ---- vision ----
  vision: {
    description: '视觉分析本地图片',
    params: [p('imagePath'), p('prompt', 'string', '分析提示词（可选）')],
    annotations: { readOnlyHint: true },
  },
  visionFromUrl: {
    description: '视觉分析网络图片',
    params: [p('imageUrl'), p('prompt', 'string', '分析提示词（可选）')],
    annotations: { readOnlyHint: true, openWorldHint: true },
  },

  // ---- office ----
  createPpt: {
    description: '创建 PPT 文件',
    params: [p('options', 'any', 'PPT 配置对象（outputPath/slides/title/author）')],
  },
  createWord: {
    description: '创建 Word 文档',
    params: [p('options', 'any', 'Word 配置对象（outputPath/paragraphs/title/author）')],
  },
  createExcel: {
    description: '创建 Excel 文件',
    params: [p('options', 'any', 'Excel 配置对象（outputPath/sheets）')],
  },
  readExcel: {
    description: '读取 Excel(.xlsx) 文件内容。不支持 .csv，请用 readCSV',
    params: [p('filePath')],
  },
  readWord: { description: '读取 Word(.docx) 文件', params: [p('filePath')] },
  readPpt: { description: '读取 PPT(.pptx) 文件', params: [p('filePath')] },

  // ---- cluster ----
  spawnAgent: {
    description: '生成子智能体',
    params: [p('persona'), p('name'), p('instruction')],
  },
  delegateTask: { description: '委托任务给子智能体', params: [p('agentId'), p('task')] },
  getClusterStatus: { description: '获取子智能体集群状态', params: [] },
  stopAgent: { description: '停止子智能体', params: [p('agentId')] },
  stopAllAgents: { description: '停止所有子智能体', params: [] },
  parallelExecute: {
    description: '并行执行多个任务',
    params: [p('tasks', 'any', '任务数组（每项含 agentId/task）')],
  },
  getAgent: { description: '获取单个智能体详情', params: [p('agentId')] },
  panelDiscussion: {
    description: '多智能体同主题讨论',
    params: [p('topic'), p('agentIds', 'any', '智能体 ID 数组')],
  },
  pipeline: {
    description: '智能体流水线（结果自动传递）',
    params: [p('steps', 'any', '步骤数组（每项含 agentId/task）')],
  },
  voting: {
    description: '多智能体投票表决',
    params: [p('question'), p('agentIds', 'any', '智能体 ID 数组')],
  },

  // ---- wechat ----
  loginWechat: { description: '登录微信', params: [] },
  logoutWechat: { description: '退出微信', params: [] },
  sendWechatMessage: {
    description: '发送微信消息',
    params: [p('message'), p('to', 'string', '接收人（可选）')],
  },
  sendWechatImage: {
    description: '发送微信图片',
    params: [p('imagePath'), p('to', 'string', '接收人（可选）')],
  },
  getWechatStatus: { description: '获取微信状态', params: [] },
  generateWechatQRCode: { description: '生成登录二维码', params: [] },
};
