/**
 * 会话管理模块 - 支持多会话
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import { getBasePath } from './tools/index.js';
import { getEnabledCategories, getAllCategories, getToolsByCategory, TOOL_CATEGORIES } from './registry.js';

const SESSIONS_DIR = path.resolve(process.cwd(), 'data', 'sessions');
const META_FILE = path.join(SESSIONS_DIR, 'meta.json');

// 生成唯一 ID
function generateId() {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 确保目录存在
function ensureDir() {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * 加载会话元数据
 */
function loadMeta() {
  ensureDir();
  try {
    if (existsSync(META_FILE)) {
      const data = readFileSync(META_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`[会话] 元数据加载失败: ${e.message}`);
  }
  return { sessions: [], activeId: null };
}

/**
 * 保存会话元数据
 */
function saveMeta(meta) {
  try {
    ensureDir();
    writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 元数据保存失败: ${e.message}`);
  }
}

/**
 * 加载单个会话历史
 */
function loadSession(sessionId) {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error(`[会话] 加载会话 ${sessionId} 失败: ${e.message}`);
  }
  return [];
}

/**
 * 保存单个会话历史
 */
function saveSession(sessionId, messages) {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    ensureDir();
    writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 保存会话 ${sessionId} 失败: ${e.message}`);
  }
}

// 当前会话状态
let currentSessionId = null;
let conversationHistory = [];
let turnCount = 0;
const COMPRESS_TURNS = 150;
const KEEP_RECENT_TURNS = 10;
const ARCHIVE_SUFFIX = '_archive';

// 上下文长度限制（Token 估算，约 128K 上下文）
const MAX_TOKEN_ESTIMATE = 100000;
const WARN_TOKEN_THRESHOLD = 80000;  // 80% 时发出警告

/**
 * 动态生成工具列表
 */
function buildToolList() {
  const enabledCategories = getEnabledCategories();
  const categories = getToolsByCategory();
  const categoryNames = getAllCategories();
  
  let toolList = '';
  
  for (const cat of enabledCategories) {
    const catName = categoryNames[cat] || cat;
    const tools = categories[cat] || [];
    
    // 根据分类生成工具列表
    switch (cat) {
      case 'file':
        toolList += `### 文件操作工具
- ls(path) - 列出目录内容
- read(path) - 读取文件内容
- copy(src, dest) - 复制文件
- mkdir(path) - 创建文件夹
- create(path, content) - 创建文件

`;
        break;
      case 'web':
        toolList += `### 网络工具
- search(query) - 联网搜索
- browse(url) - 在默认浏览器中打开网址
- fetchPage(url) - 抓取网页正文内容

`;
        break;
      case 'browser':
        toolList += `### 浏览器自动化工具
- initBrowser(url) - 初始化浏览器
- clickElement(selector, description) - 点击网页元素
- fillField(selector, value, description) - 填写表单
- getPageContent() - 获取页面内容
- takeScreenshot(name) - 截图
- closeBrowser() - 关闭浏览器

`;
        break;
      case 'system':
        toolList += `### 系统工具
- listApps() - 列出已安装软件
- openApp(name) - 打开软件
- closeApp(name) - 关闭软件

`;
        break;
      case 'code':
        toolList += `### 代码执行工具
- executeCode(code, language) - 执行代码（JavaScript/Python）
- runJavaScript(code) - 执行 JavaScript
- runPython(code) - 执行 Python

`;
        break;
      case 'git':
        toolList += `### Git 工具
- gitInit(cwd) - 初始化仓库
- gitClone(url, dest, cwd) - 克隆仓库
- gitStatus(cwd) - 查看状态
- gitLog(options, cwd) - 查看日志
- gitDiff(options, cwd) - 查看差异
- gitAdd(files, cwd) - 添加文件
- gitCommit(message, cwd) - 提交
- gitPush(remote, branch, cwd) - 推送
- gitPull(remote, branch, cwd) - 拉取
- gitBranchList(cwd) - 列出分支
- gitCheckout(branch, cwd) - 切换分支

`;
        break;
      case 'task':
        toolList += `### 任务管理工具
- createTask(title, description, priority, parentId) - 创建任务
- getTasks(filter) - 获取任务列表
- updateTask(id, updates) - 更新任务
- completeTask(id) - 完成任务
- splitTask(id, subtasks) - 分解任务
- getTaskStats() - 任务统计

`;
        break;
      case 'memory':
        toolList += `### 记忆系统工具
- addMemory(content, tags, category) - 添加记忆
- searchMemory(query, limit) - 搜索记忆
- getAllMemories(category) - 获取所有记忆
- updateMemory(id, updates) - 更新记忆
- deleteMemory(id) - 删除记忆
- getMemoryStats() - 记忆统计

`;
        break;
      case 'data':
        toolList += `### 数据处理工具
- readCSV(filePath) - 读取 CSV
- writeCSV(filePath, headers, rows) - 写入 CSV
- readJSON(filePath) - 读取 JSON
- writeJSON(filePath, data) - 写入 JSON
- csvToJSON(csvPath, jsonPath) - CSV 转 JSON
- jsonToCSV(jsonPath, csvPath) - JSON 转 CSV

`;
        break;
      case 'db':
        toolList += `### 数据库工具
- executeSQL(sql, params) - 执行 SQL
- query(table, conditions, options) - 查询数据
- insert(table, data) - 插入数据
- update(table, data, conditions) - 更新数据
- deleteData(table, conditions) - 删除数据
- getTables() - 获取表列表

`;
        break;
      case 'email':
        toolList += `### 邮件工具
- sendEmail(to, subject, body, options) - 发送邮件
- sendTextEmail(to, subject, body) - 发送文本邮件
- checkEmailConfig() - 检查邮件配置

`;
        break;
      case 'monitor':
        toolList += `### 系统监控工具
- getCPUInfo() - 获取 CPU 信息
- getMemoryInfo() - 获取内存信息
- getDiskInfo() - 获取磁盘信息
- getProcesses() - 获取进程列表
- monitorSystem() - 监控系统资源

`;
        break;
      case 'scheduler':
        toolList += `### 定时任务工具
- addScheduleTask(name, cronExpr, action, params) - 添加定时任务
- getScheduleTasks() - 获取定时任务列表
- toggleScheduleTask(id) - 启用/禁用任务
- removeScheduleTask(id) - 删除任务

`;
        break;
    }
  }
  
  return toolList;
}

/**
 * 获取系统提示词
 */
function buildSystemPrompt() {
  const workspace = getBasePath();
  const enabledCategories = getEnabledCategories();
  const enabledCount = enabledCategories.length;
  const totalCount = Object.keys(TOOL_CATEGORIES).length;
  
  const basePrompt = `你是 CogitoAgent，一个持续思考的智能体。

## 活动范围
你在 ${workspace} 目录下活动，可以自由探索。

## 可用工具（共 ${enabledCount}/${totalCount} 个分类已启用）

${buildToolList()}
## 行为规则
1. 可以直接执行 copy 或 create 操作，不需要等待确认
2. 用户可以通过输入文字打断你的思考

## 探索节奏
### 主动探索模式
没有特别想说的话时，专注于探索文件。不要输出 [WAIT]。

### 对话等待模式
想分享发现、问问题或互动时，在结尾加 [WAIT]。

## 输出格式
使用工具：[TOOL] toolName("参数") [/TOOL]
普通对话：直接输出文字，结束时可加 [WAIT]。

开始你的探索吧！`;

  return basePrompt;
}

/**
 * 初始化或加载会话
 */
function initializeSession(sessionId = null) {
  const meta = loadMeta();
  
  if (sessionId) {
    // 切换到指定会话
    if (!meta.sessions.find(s => s.id === sessionId)) {
      console.error(`[会话] 会话 ${sessionId} 不存在`);
      return false;
    }
    currentSessionId = sessionId;
  } else if (meta.activeId && meta.sessions.find(s => s.id === meta.activeId)) {
    // 恢复上次会话
    currentSessionId = meta.activeId;
  } else {
    // 创建新会话
    createNewSession();
  }

  // 加载会话历史
  const messages = loadSession(currentSessionId);
  if (messages.length === 0) {
    conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
  } else {
    conversationHistory = messages;
    // 重新构建系统提示（路径可能变化）
    conversationHistory[0] = { role: 'system', content: buildSystemPrompt() };
  }
  
  turnCount = conversationHistory.filter(m => m.role !== 'system').length;
  meta.activeId = currentSessionId;
  saveMeta(meta);
  
  console.error(`[会话] 已加载会话: ${currentSessionId} (${turnCount} 条消息)`);
  return true;
}

/**
 * 创建新会话
 */
function createNewSession(name = null) {
  // 归档当前会话
  if (currentSessionId) {
    archiveCurrentSession();
  }

  const meta = loadMeta();
  const id = generateId();
  const session = {
    id,
    name: name || `会话 ${meta.sessions.length + 1}`,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    messageCount: 0
  };

  meta.sessions.push(session);
  meta.activeId = id;
  saveMeta(meta);

  currentSessionId = id;
  conversationHistory = [{ role: 'system', content: buildSystemPrompt() }];
  turnCount = 0;
  saveSession(id, conversationHistory);

  console.error(`[会话] 已创建新会话: ${session.name}`);
  return session;
}

/**
 * 归档当前会话
 */
function archiveCurrentSession() {
  if (!currentSessionId) return;
  
  const messages = conversationHistory.filter(m => m.role !== 'system');
  if (messages.length === 0) return;

  const archiveFile = path.join(SESSIONS_DIR, `${currentSessionId}${ARCHIVE_SUFFIX}.json`);
  try {
    let archives = [];
    if (existsSync(archiveFile)) {
      archives = JSON.parse(readFileSync(archiveFile, 'utf-8'));
    }
    
    archives.push({
      timestamp: new Date().toISOString(),
      messages: messages.slice(0, -KEEP_RECENT_TURNS)
    });

    // 只保留最近 3 个归档
    if (archives.length > 3) {
      archives = archives.slice(-3);
    }

    writeFileSync(archiveFile, JSON.stringify(archives, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[会话] 归档失败: ${e.message}`);
  }
}

/**
 * 切换会话
 */
function switchSession(sessionId) {
  const meta = loadMeta();
  const session = meta.sessions.find(s => s.id === sessionId);
  
  if (!session) {
    return { success: false, error: '会话不存在' };
  }

  // 归档当前会话
  archiveCurrentSession();
  saveSession(currentSessionId, conversationHistory);

  // 切换
  currentSessionId = sessionId;
  meta.activeId = sessionId;
  session.lastActiveAt = new Date().toISOString();
  saveMeta(meta);

  // 加载新会话
  const messages = loadSession(sessionId);
  conversationHistory = messages.length > 0 ? messages : [{ role: 'system', content: buildSystemPrompt() }];
  turnCount = conversationHistory.filter(m => m.role !== 'system').length;

  return { success: true, session };
}

/**
 * 删除会话
 */
function deleteSession(sessionId) {
  const meta = loadMeta();
  const index = meta.sessions.findIndex(s => s.id === sessionId);
  
  if (index === -1) {
    return { success: false, error: '会话不存在' };
  }

  // 不能删除最后一个会话
  if (meta.sessions.length <= 1) {
    return { success: false, error: '至少保留一个会话' };
  }

  // 如果删除的是当前会话，先切换
  if (currentSessionId === sessionId) {
    const nextSession = meta.sessions.find(s => s.id !== sessionId);
    if (nextSession) {
      switchSession(nextSession.id);
    }
  }

  // 删除文件和元数据
  const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
  const archiveFile = path.join(SESSIONS_DIR, `${sessionId}${ARCHIVE_SUFFIX}.json`);
  
  try {
    if (existsSync(sessionFile)) {
      unlinkSync(sessionFile);
    }
    if (existsSync(archiveFile)) {
      unlinkSync(archiveFile);
    }
  } catch (e) {
    // 忽略删除失败
  }

  meta.sessions.splice(index, 1);
  saveMeta(meta);

  return { success: true };
}

/**
 * 重命名会话
 */
function renameSession(sessionId, newName) {
  const meta = loadMeta();
  const session = meta.sessions.find(s => s.id === sessionId);
  
  if (!session) {
    return { success: false, error: '会话不存在' };
  }

  session.name = newName;
  saveMeta(meta);

  return { success: true, session };
}

/**
 * 获取所有会话列表
 */
function listSessions() {
  const meta = loadMeta();
  return meta.sessions.map(s => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    isActive: s.id === currentSessionId
  }));
}

/**
 * 获取当前会话信息
 */
function getCurrentSession() {
  if (!currentSessionId) return null;
  const meta = loadMeta();
  return meta.sessions.find(s => s.id === currentSessionId);
}

/**
 * 获取消息历史
 */
function getMessages() {
  return [...conversationHistory];
}

/**
 * 添加用户消息
 */
function addUserMessage(content) {
  conversationHistory.push({ role: 'user', content });
  turnCount++;
  saveSession(currentSessionId, conversationHistory);
  
  // 更新元数据
  const meta = loadMeta();
  const session = meta.sessions.find(s => s.id === currentSessionId);
  if (session) {
    session.lastActiveAt = new Date().toISOString();
    session.messageCount = turnCount;
    saveMeta(meta);
  }
}

/**
 * 添加助手消息
 */
function addAssistantMessage(content) {
  conversationHistory.push({ role: 'assistant', content });
  turnCount++;
  saveSession(currentSessionId, conversationHistory);
}

/**
 * 估算 Token 数量（简单估算）
 * 中文字符约 1 token ≈ 1.5 字符
 * 英文字符约 1 token ≈ 4 字符
 */
function estimateTokens(text) {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5) + Math.ceil(otherChars / 4);
}

/**
 * 获取当前上下文 Token 估算
 */
function getContextTokenEstimate() {
  let totalTokens = 0;
  for (const msg of conversationHistory) {
    totalTokens += estimateTokens(msg.content);
  }
  return totalTokens;
}

/**
 * 检查是否需要压缩（基于轮数和 Token 数量）
 */
function shouldCompress() {
  // 超过轮数限制
  if (turnCount >= COMPRESS_TURNS) {
    return true;
  }
  
  // 超过 Token 限制
  const tokenEstimate = getContextTokenEstimate();
  if (tokenEstimate >= MAX_TOKEN_ESTIMATE) {
    return true;
  }
  
  return false;
}

/**
 * 检查是否接近限制（用于警告）
 */
function isApproachingLimit() {
  const tokenEstimate = getContextTokenEstimate();
  return tokenEstimate >= WARN_TOKEN_THRESHOLD && tokenEstimate < MAX_TOKEN_ESTIMATE;
}

/**
 * 获取压缩建议
 */
function getCompressionAdvice() {
  const tokenEstimate = getContextTokenEstimate();
  const usage = Math.round((tokenEstimate / MAX_TOKEN_ESTIMATE) * 100);
  
  if (usage >= 100) {
    return { level: 'critical', usage, message: '上下文即将爆满，建议压缩' };
  } else if (usage >= 80) {
    return { level: 'warning', usage, message: '上下文使用率较高，建议适时压缩' };
  } else if (usage >= 50) {
    return { level: 'info', usage, message: '上下文使用适中' };
  }
  return { level: 'ok', usage, message: '上下文充足' };
}

/**
 * 压缩历史记录
 */
function compressHistory() {
  const nonSystemMessages = conversationHistory.filter(m => m.role !== 'system');

  if (nonSystemMessages.length <= KEEP_RECENT_TURNS) {
    return;
  }

  // 归档到文件
  const toArchive = nonSystemMessages.slice(0, -KEEP_RECENT_TURNS);
  if (toArchive.length > 0) {
    archiveCurrentSession();
  }

  // 保留最近对话
  const recentMessages = nonSystemMessages.slice(-KEEP_RECENT_TURNS);
  
  // 生成摘要
  const summary = generateSummary(recentMessages);

  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `[上下文摘要] ${summary}` },
    ...recentMessages
  ];

  turnCount = recentMessages.length;
  saveSession(currentSessionId, conversationHistory);
}

/**
 * 生成上下文摘要
 */
function generateSummary(messages) {
  const tools = new Set();
  const requests = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      requests.push(msg.content.slice(0, 80));
    }
    const matches = msg.content.matchAll(/\[TOOL\]\s*(\w+)/g);
    for (const match of matches) {
      tools.add(match[1]);
    }
  }

  let summary = `最近 ${messages.length} 轮对话摘要：\n`;
  if (tools.size > 0) {
    summary += `- 使用工具: ${[...tools].join(', ')}\n`;
  }
  if (requests.length > 0) {
    summary += `- 用户请求: ${requests.slice(-3).join(' | ')}`;
  }

  return summary;
}

/**
 * 获取历史长度
 */
function getHistoryLength() {
  return conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);
}

export {
  initializeSession,
  createNewSession,
  switchSession,
  deleteSession,
  renameSession,
  listSessions,
  getCurrentSession,
  getMessages,
  addUserMessage,
  addAssistantMessage,
  shouldCompress,
  compressHistory,
  getHistoryLength,
  estimateTokens,
  getContextTokenEstimate,
  isApproachingLimit,
  getCompressionAdvice
};
