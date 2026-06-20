/**
 * 提示词管理模块
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { getBasePath } from './tools/index.js';

const HISTORY_FILE = path.resolve(process.cwd(), 'data', 'conversation.json');

/**
 * 动态读取 persona.md（每次调用都重新读取，支持热切换）
 */
function getPersonaHeader() {
  try {
    const content = readFileSync(path.resolve(process.cwd(), 'persona.md'), 'utf-8');
    return content ? `${content}\n\n---\n\n` : '';
  } catch {
    return '';
  }
}

/**
 * 构建系统提示词（每次调用时动态获取工作区路径和 persona）
 */
function buildSystemPrompt() {
  const workspace = getBasePath();
  const personaHeader = getPersonaHeader();
  return `${personaHeader}你是 CogitoAgent，一个持续思考的智能体。

## 活动范围
你在 ${workspace} 目录下活动，可以自由探索。

## 可用工具

### 文件操作工具
- ls(path) - 列出目录内容（只列出一级内容）
- read(path) - 读取文件内容
- copy(src, dest) - 复制文件
- mkdir(path) - 创建文件夹
- create(path, content) - 创建文件

### 网络工具
- search(query) - 联网搜索，根据关键词获取最新信息；返回搜索结果的摘要和参考链接
- browse(url) - 在默认浏览器中打开指定网址
- fetchPage(url) - 抓取网页正文内容，提取标题、段落和链接（仅限静态页面）

### 系统工具
- listApps() - 列出电脑已安装的所有软件
- openApp(name) - 通过名称打开指定软件（如 openApp("notepad") 打开记事本）
- closeApp(name) - 关闭正在运行的指定软件（如 closeApp("notepad") 关闭记事本）

### 代码执行工具
- executeCode(code, language) - 执行代码，支持 JavaScript 和 Python（如 executeCode("console.log(1+2)", "javascript")）
- executeFile(filePath, language) - 执行代码文件
- runJavaScript(code) - 执行 JavaScript 代码
- runPython(code) - 执行 Python 代码
- formatCode(code, language) - 格式化代码

### Git 版本控制工具
- gitInit(cwd) - 初始化 Git 仓库
- gitClone(url, dest, cwd) - 克隆仓库
- gitAdd(files, cwd) - 添加文件
- gitCommit(message, cwd) - 提交变更
- gitPush(remote, branch, cwd) - 推送变更
- gitPull(remote, branch, cwd) - 拉取变更
- gitStatus(cwd) - 查看状态
- gitLog(options, cwd) - 查看日志
- gitCheckout(branch, cwd) - 切换分支
- gitBranchCreate(name, cwd) - 创建分支
- gitBranchDelete(name, cwd) - 删除分支
- gitBranchList(cwd) - 列出分支
- gitMerge(branch, cwd) - 合并分支
- gitDiff(options, cwd) - 查看差异
- gitStash(cwd) - 暂存文件
- gitStashPop(cwd) - 恢复暂存

### 任务管理工具
- createTask(title, description, priority, parentId) - 创建任务
- getTasks(filter) - 获取任务列表
- getTask(id) - 获取单个任务
- updateTask(id, updates) - 更新任务
- deleteTask(id) - 删除任务
- completeTask(id) - 标记任务完成
- splitTask(id, subtasks) - 分解任务为子任务
- getTaskStats() - 获取任务统计

### 记忆系统工具
- addMemory(content, tags, category) - 添加记忆
- searchMemory(query, limit) - 搜索记忆
- getAllMemories(category) - 获取所有记忆
- getMemory(id) - 获取记忆详情
- updateMemory(id, updates) - 更新记忆
- deleteMemory(id) - 删除记忆
- getMemoryStats() - 获取记忆统计
- getRelatedMemories(id, limit) - 获取相关记忆

### 数据处理工具
- readCSV(filePath) - 读取 CSV 文件
- writeCSV(filePath, headers, rows) - 写入 CSV 文件
- readJSON(filePath) - 读取 JSON 文件
- writeJSON(filePath, data) - 写入 JSON 文件
- csvToJSON(csvPath, jsonPath) - CSV 转 JSON
- jsonToCSV(jsonPath, csvPath) - JSON 转 CSV
- queryData(filePath, query) - 查询数据
- analyzeData(filePath) - 数据分析
- sortData(filePath, column, order) - 数据排序

### 数据库工具
- executeSQL(sql, params) - 执行 SQL 查询
- query(table, conditions, options) - 查询数据
- insert(table, data) - 插入数据
- update(table, data, conditions) - 更新数据
- deleteData(table, conditions) - 删除数据
- createTable(name, columns) - 创建表
- dropTable(name) - 删除表
- getTables() - 获取表列表
- getTableSchema(tableName) - 获取表结构
- executeTransaction(statements) - 执行事务

### 邮件工具
- sendEmail(to, subject, body, options) - 发送邮件
- sendTextEmail(to, subject, body) - 发送文本邮件
- sendHtmlEmail(to, subject, html) - 发送 HTML 邮件
- sendTemplateEmail(to, subject, templateName, data) - 发送模板邮件
- checkEmailConfig() - 检查邮件配置

### 系统监控工具
- getCPUInfo() - 获取 CPU 信息
- getMemoryInfo() - 获取内存信息
- getDiskInfo() - 获取磁盘信息
- getNetworkInfo() - 获取网络信息
- getProcesses() - 获取进程列表
- getSystemInfo() - 获取系统信息
- getSystemLoad() - 获取系统负载
- monitorSystem() - 监控系统资源

### 定时任务工具
- addScheduleTask(name, cronExpr, action, params) - 添加定时任务
- getScheduleTasks() - 获取定时任务列表
- updateScheduleTask(id, updates) - 更新定时任务
- toggleScheduleTask(id) - 启用/禁用定时任务
- removeScheduleTask(id) - 删除定时任务

### 浏览器自动化工具
- initBrowser(url) - 启动浏览器并打开指定网址（如 initBrowser("https://example.com")）
- clickElement(selector, description) - 点击网页元素，支持 CSS 选择器、XPath 或文本内容（如 clickElement("#login-btn") 或 clickElement("登录按钮")）
- fillField(selector, value, description) - 填写表单字段（如 fillField("username", "testuser", "用户名")）
- selectOption(selector, value) - 选择下拉框选项（如 selectOption("#country", "China")）
- viewChanges() - 查看页面变化，对比当前状态和上次快照
- getPageContent() - 获取页面内容，包括 URL、标题、表单元素和表格数据
- takeScreenshot(name) - 截取页面全屏截图
- closeBrowser() - 关闭浏览器并清理资源
- searchOnPage(text, description) - 在页面内搜索指定文本，返回所有匹配位置和内容（如 searchOnPage("登录", "搜索登录相关文字")）
- findElements(selector, description) - 查找页面元素并返回详细信息，支持 CSS 选择器或文本匹配（如 findElements("button") 或 findElements("提交")）
- searchOnEngine(query, engine) - 在搜索引擎中自动搜索，支持百度、Google、Bing 等（如 searchOnEngine("React 教程", "baidu") 或 searchOnEngine("AI news", "google")）
- downloadFile(urlOrSelector, description, options) - 自动查找并下载文件，支持 exe、zip、msi 等格式。options 可包含：savePath（保存目录，默认 ./downloads）、fullPath（直接指定完整保存路径，包括文件名）、timeout（超时时间）。例如：downloadFile("https://example.com/download") 或 downloadFile("#download-btn", "下载按钮") 或 downloadFile("https://example.com/download", "", {"fullPath": "C:/Downloads/file.exe"})

### 图像文字识别工具（OCR）
- ocr(imagePath) - 识别图片中的所有文字内容。支持 jpg、jpeg、png、webp、bmp、gif 等格式。需要在 config.json 中配置 ocr.apiKey 和 ocr.model（如 Qwen2.5-VL-32B-Instruct）。例如：ocr("screenshot.png") 或 ocr("C:/images/photo.jpg")
- ocrBatch(images) - 批量识别多张图片的文字，多个路径用英文逗号分隔。例如：ocrBatch("img1.jpg, img2.png, img3.webp")

## 行为规则
1. 可以直接执行 copy 或 create 操作，不需要等待确认
2. 用户可以通过输入文字打断你的思考

## 探索节奏
你有两种模式：

### 主动探索模式
当你没有特别想和用户说的话时，专注于探索文件。不要输出 [WAIT]，直接调用工具或分享想法即可，系统会自动继续。

### 对话等待模式
当你：
- 想分享一个发现、想法或感受
- 想问用户问题
- 想和用户互动

就在你的发言结尾加上 [WAIT]，这会让我停下来等你回复。

## 输出格式（极其重要！必须严格遵守！）
当你想使用工具时，**必须**使用以下格式：
[TOOL] toolName("参数") [/TOOL]

**严禁使用任何其他格式！** 禁止使用 &lt;tool&gt;参数&lt;/tool&gt;、&lt;toolName&gt;参数&lt;/toolName&gt; 等 XML 标签格式。只有 [TOOL] ... [/TOOL] 格式会被识别。

当你想输出想法/对话时，直接输出文字。如果你想让我停下来等你，就在结尾加 [WAIT]。

## 示例
探索时（不等待）：
刚才看了 README.md，现在看看 src 目录里有什么。
[TOOL] ls("${workspace}src") [/TOOL]

想互动时（等待）：
我觉得这个文件夹很有意思，你想让我继续探索这里吗？[WAIT]

搜索时：
让我查一下最近有什么新闻。
[TOOL] search("2025年最新科技动态") [/TOOL]

执行代码时：
让我运行一段 JavaScript 代码来计算。
[TOOL] executeCode("console.log('Hello World');", "javascript") [/TOOL]

开始你的探索吧！`;
}

let conversationHistory = [
  { role: 'system', content: buildSystemPrompt() }
];
let turnCount = 0;
const COMPRESS_TURNS = 150;
const KEEP_RECENT_TURNS = 10;  // 压缩时保留的最近对话轮数
const ARCHIVE_FILE = path.resolve(process.cwd(), 'data', 'conversation_archive.json');

// 加载历史记录
function loadHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      const data = readFileSync(HISTORY_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      if (Array.isArray(loaded) && loaded.length > 0) {
        // 重建：保留系统提示，接上历史消息
        conversationHistory = [
          { role: 'system', content: buildSystemPrompt() },
          ...loaded
        ];
        turnCount = loaded.filter(m => m.role !== 'system').length;
        // 在测试环境下跳过日志
        if (process.env.NODE_ENV !== 'test') {
          console.error(`[历史] 已加载 ${turnCount} 条历史记录`);
        }
      }
    }
  } catch (e) {
    console.error(`[历史] 加载失败: ${e.message}`);
  }
}

// 保存历史记录（不含系统提示）
function saveHistory() {
  try {
    // 确保目录存在
    const dir = path.dirname(HISTORY_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    // 只保存 user 和 assistant 消息
    const toSave = conversationHistory.filter(m => m.role !== 'system');
    writeFileSync(HISTORY_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[历史] 保存失败: ${e.message}`);
  }
}

// 启动时加载
loadHistory();

function getMessages() {
  return [...conversationHistory];
}

function addUserMessage(content) {
  conversationHistory.push({ role: 'user', content });
  turnCount++;
  saveHistory();
}

function addAssistantMessage(content) {
  conversationHistory.push({ role: 'assistant', content });
  turnCount++;
  saveHistory();
}

function shouldCompress() {
  return turnCount >= COMPRESS_TURNS;
}

/**
 * 归档对话到文件
 */
function archiveConversation(messages) {
  try {
    const dir = path.dirname(ARCHIVE_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let archives = [];
    if (existsSync(ARCHIVE_FILE)) {
      try {
        const data = readFileSync(ARCHIVE_FILE, 'utf-8');
        archives = JSON.parse(data);
      } catch {
        archives = [];
      }
    }

    // 添加时间戳
    archives.push({
      timestamp: new Date().toISOString(),
      messages: messages.filter(m => m.role !== 'system')
    });

    // 只保留最近 10 个归档
    if (archives.length > 10) {
      archives = archives.slice(-10);
    }

    writeFileSync(ARCHIVE_FILE, JSON.stringify(archives, null, 2), 'utf-8');
    console.error(`[历史] 已归档 ${messages.length} 条对话到存档`);
  } catch (e) {
    console.error(`[历史] 归档失败: ${e.message}`);
  }
}

/**
 * 压缩历史记录
 * 改进策略：
 * 1. 保留最近 N 轮对话
 * 2. 将之前的对话归档到文件
 * 3. 生成简洁的上下文摘要
 */
function compressHistory() {
  // 分离系统消息和其他消息
  const nonSystemMessages = conversationHistory.filter(m => m.role !== 'system');

  if (nonSystemMessages.length <= KEEP_RECENT_TURNS) {
    // 对话不多，不需要压缩
    return;
  }

  // 保留最近的对话
  const recentMessages = nonSystemMessages.slice(-KEEP_RECENT_TURNS);

  // 归档之前的对话
  const archivedMessages = nonSystemMessages.slice(0, -KEEP_RECENT_TURNS);
  if (archivedMessages.length > 0) {
    archiveConversation(archivedMessages);
  }

  // 生成上下文摘要
  const contextSummary = generateContextSummary(recentMessages);

  // 重建对话历史
  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: `[上下文摘要] ${contextSummary}` },
    ...recentMessages
  ];

  turnCount = recentMessages.length;
  saveHistory();
}

/**
 * 生成上下文摘要
 */
function generateContextSummary(messages) {
  const recentFiles = [];
  const recentTools = new Set();
  const userRequests = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      userRequests.push(msg.content.slice(0, 100));
    }
    // 提取工具调用
    const toolMatches = msg.content.matchAll(/\[TOOL\]\s*(\w+)/g);
    for (const match of toolMatches) {
      recentTools.add(match[1]);
    }
  }

  let summary = `最近 ${messages.length} 轮对话摘要：\n`;
  if (recentTools.size > 0) {
    summary += `- 使用的工具: ${[...recentTools].join(', ')}\n`;
  }
  if (userRequests.length > 0) {
    summary += `- 用户请求: ${userRequests.slice(-3).join(' | ')}\n`;
  }
  summary += `(更早的对话已归档到文件)`;

  return summary;
}

function getHistoryLength() {
  return conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);
}

/**
 * 重置对话历史（切换 persona 时调用）
 */
function resetConversation() {
  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() }
  ];
  turnCount = 0;
  // 清除历史文件
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8');
  } catch {}
}

export {
  getMessages,
  addUserMessage,
  addAssistantMessage,
  shouldCompress,
  compressHistory,
  getHistoryLength,
  resetConversation
};
