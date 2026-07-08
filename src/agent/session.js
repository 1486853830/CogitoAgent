/**
 * 会话管理模块 - 支持多会话
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getBasePath } from './tools/index.js';
import { getEnabledCategories, getAllCategories, getToolsByCategory, TOOL_CATEGORIES } from './registry.js';

const SESSIONS_DIR = path.resolve(process.cwd(), 'data', 'sessions');
const META_FILE = path.join(SESSIONS_DIR, 'meta.json');

// 生成唯一 ID
function generateId() {
  return 'sess_' + Date.now().toString(36) + crypto.randomUUID().split('-')[0];
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
      case 'ocr':
        toolList += `### 图像文字识别工具（OCR）
- ocr(imagePath, prompt) - 识别图片中的文字，支持 jpg/png/webp/bmp/gif 格式，可自定义提示词
- ocrBatch(images) - 批量识别多张图片的文字，路径用英文逗号分隔

【重要】使用 OCR 工具时必须：
1. 严格忠实于识别结果，不得编造、添加或美化内容
2. 如果识别结果为空或失败，必须如实告知用户"未能识别出文字"
3. 不要根据图片内容进行猜测或推断，只报告 OCR 实际返回的文字

`;
        break;
      case 'vision':
        toolList += `### 视觉分析工具（Vision）
- vision(imagePath, prompt) - 分析本地图片内容，支持流式返回思考过程和最终分析结果。支持 jpg/png/webp/bmp/gif 格式，可自定义提示词（如"请详细描述这张图片"、"图中有什么文字？"）
- visionFromUrl(imageUrl, prompt) - 分析网络图片 URL 的内容，支持流式返回思考过程和最终分析结果

【重要】使用 Vision 工具时必须：
1. 详细描述图片中的内容，包括物体、场景、文字、颜色、布局等
2. 如果图片包含文字，需准确读取并输出
3. 分析结果应包含 reasoning（思考过程）和 content（最终结论）两部分

`;
        break;
      case 'office':
        toolList += `### Office 文档工具
- createPpt(options) - 创建 PPT 文件，参数包含 outputPath(输出路径)、slides(幻灯片数组，每项含 title/content/image/bullets)、title(标题)、author(作者)
- createWord(options) - 创建 Word 文档，参数包含 outputPath(输出路径)、paragraphs(段落数组，每项含 type/text/level/items/rows/src 等)、title(标题)、author(作者)
- createExcel(options) - 创建 Excel 文件，参数包含 outputPath(输出路径)、sheets(工作表数组，每项含 name/data，data为二维数组)
- readExcel(filePath) - 读取 Excel 文件，返回各工作表数据的二维数组

【重要】使用 Office 工具时：
1. 确保 outputPath 以正确的扩展名结尾（.pptx/.docx/.xlsx）
2. PPT 的 slides 每项支持：title(标题)、content(正文)、bullets(要点数组)、image(图片路径)
3. Word 的 paragraphs 支持 type：heading(标题，带level)、text(正文)、list(列表，带items)、table(表格，带rows)、image(图片，带src/width/height)
4. Excel 的 sheets 每项含 name(表名) 和 data(二维数组数据)
5. 图片路径必须是有效的本地文件路径

`;
        break;
      case 'cluster':
        toolList += `### 智能体集群工具
你可以生成子智能体并委托任务给它们，实现多智能体协作。

**重要：用户要求你创建子智能体时，你必须主动使用这些工具，无需等待用户手动操作。**

- spawnAgent(persona, name, instruction) - 生成一个新的子智能体
  - persona: 角色名称（如 "Critic"、"Programmer"、"Explorer"、"Analyst"）
  - name: 智能体名称
  - instruction: 角色指令/职责描述
- delegateTask(agentId, task) - 委托任务给子智能体
  - agentId: 智能体 ID（spawnAgent 返回的 id）
  - task: 任务描述
- getClusterStatus() - 获取所有子智能体状态
- getAgent(agentId) - 获取单个智能体详情
- stopAgent(agentId) - 停止/销毁子智能体
-- stopAllAgents() - 停止所有子智能体
-- parallelExecute(tasks) - 并行执行多个任务（tasks 为 JSON 数组，每项含 agentId 和 task）
-- panelDiscussion(topic, agentIds, moderatorInstruction) - 多智能体就同一主题讨论
  - agentIds: 数组，如 ["agent_1","agent_2"]
  - 会依次采集每个智能体的观点
-- pipeline(steps) - 智能体流水线，前一步结果自动传给下一步
  - steps: 数组，每项含 agentId 和 task
  - 例如：A 写代码 → B 审查 → C 测试
-- voting(question, agentIds, options) - 多智能体投票表决
  - options: 选项数组（可选）
  - 返回每个智能体的投票和理由

【使用场景举例】
- 用户说"帮我创建一个智能体" → 使用 spawnAgent
- 用户说"让智能体 XX 做 YY" → 使用 delegateTask
- 用户说"让它们讨论 XX 话题" → 使用 panelDiscussion
- 用户说"做个流水线" → 使用 pipeline
- 用户说"让它们投票" → 使用 voting

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
  
  // 读取 persona（支持热切换）
  let personaHeader = '';
  try {
    const personaContent = readFileSync(path.resolve(process.cwd(), 'persona.md'), 'utf-8');
    if (personaContent.trim()) {
      personaHeader = personaContent + '\n\n---\n\n';
    }
  } catch {}

  const basePrompt = `${personaHeader}## ⚠️ 两项黄金规则

### 规则一：用 [TOOL] 调用工具
当你需要使用工具时，用以下格式：
\`\`\`
[TOOL] toolName("参数1", "参数2") [/TOOL]
\`\`\`
例如：\`[TOOL] read("src/index.js") [/TOOL]\` 或 \`[TOOL] spawnAgent("Critic", "审查官", "审查代码质量") [/TOOL]\`

**每次调用工具都必须用 [TOOL]...[/TOOL] 包裹，不要自己编造工具结果。**

### 规则二：用 [WAIT] 控制思考节奏
**[WAIT]** 是一个纯标记，**不是工具调用**。它告诉系统"我说完了，等用户回复"。

| 必须加 [WAIT]（停下来等用户） | 绝对不能加 [WAIT]（继续干活） |
|---|---|
| ✅ 完成用户交代的任务后 | ❌ 刚调用了工具，等待工具结果 |
| ✅ 向用户提问或需要反馈时 | ❌ 正在分析文件、读代码、搜索信息 |
| ✅ 工具后发现信息不足，需用户补充 | ❌ 还有未完成的子任务要处理 |
| ✅ 执行完 delegateTask 后 | ❌ 用户刚发了新消息，正在回复 |

**一句话判断：有话说给用户听 → 加 [WAIT] | 还要继续干活 → 不加 [WAIT]**

---

## 活动范围
你在 ${workspace} 目录下活动，可以自由探索。

## 可用工具（共 ${enabledCount}/${totalCount} 个分类已启用）

${buildToolList()}
## 行为规则
1. 可以直接执行 copy 或 create 操作，不需要等待确认
2. 用户可以通过输入文字打断你的思考

## 重要：关于工具调用和结果展示
当你调用工具时，系统会：
1. 执行工具并自动捕获结果
2. 将结果作为独立的 user 消息注入到对话上下文中（格式：[系统返回的工具执行结果] + [工具结果]: / [工具错误]:）
3. 在界面上用独立的工具气泡展示结果

**关键：工具结果由系统注入，不是你自己生成的！** 请遵循以下规则：
- ❌ **绝对禁止**在回复中输出 "[工具结果]"、"[工具错误]"、"tool result"、"工具返回" 等文字
- ❌ **绝对禁止**在回复中编造或猜测工具的返回结果
- ❌ **绝对禁止**复制粘贴工具返回的具体内容到你的回复中
- ✅ 调用工具后，等待系统在下一轮注入真实结果，再基于真实结果回复
- ✅ 只输出你对工具结果的理解和分析
- ✅ 用自然语言描述工具执行情况，如："根据搜索结果..."、"文件已创建成功"
- ✅ 可以引用工具返回的关键信息，但要用自己的话总结，不要直接粘贴原始输出

**如果工具尚未返回结果，你绝不能自行编造结果。宁可说"正在查询..."也不要猜测。**

## 工具调用失败或无结果时的处理规则

### 失败场景处理
当工具调用失败（如文件不存在、权限不足、网络错误等）时：
- ❌ **禁止**虚构工具结果或无中生有
- ❌ **禁止**猜测工具可能返回的内容
- ❌ **禁止**编造不存在的信息来掩盖失败
- ✅ **必须**如实告知用户工具调用失败，并说明可能的原因
- ✅ **必须**明确表示你无法完成该操作
- ✅ 可以建议用户检查参数或尝试其他方法

### 无结果场景处理
当工具返回空结果或无有效数据时：
- ❌ **禁止**凭空编造信息
- ❌ **禁止**猜测或假设数据内容
- ✅ **必须**明确告知用户没有找到相关信息或结果为空
- ✅ **必须**基于实际情况给出回应，不臆测

### 响应模板示例
- 工具调用失败："很抱歉，我无法完成这个操作。[工具名称]调用失败，原因可能是：[简要说明]。请检查相关条件后重试。"
- 无结果："抱歉，没有找到相关信息。[工具名称]返回的结果为空。"
- 无法确定："根据现有信息，我无法确定这个问题的答案。"

## 输出格式
- 调用工具：[TOOL] toolName("参数1", "参数2") [/TOOL]
- 普通对话：直接输出文字
- 说完等回复：在末尾加 [WAIT]（详见顶部规则二）

**记住：要用 [TOOL] 调工具，用 [WAIT] 等用户。两者完全不同。**

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
  
  // 如果 meta 中没有会话但磁盘上有会话文件，自动恢复
  if (meta.sessions.length === 0) {
    recoverSessionsFromDisk(meta);
  }
  
  return meta.sessions.map(s => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    isActive: s.id === currentSessionId
  }));
}

/**
 * 从磁盘恢复丢失的会话元数据
 */
function recoverSessionsFromDisk(meta) {
  try {
    const files = readdirSync(SESSIONS_DIR);
    const recovered = [];
    
    for (const file of files) {
      if (!file.match(/^sess_[^_]+\.json$/)) continue;
      const sessionId = file.replace('.json', '');
      try {
        const content = JSON.parse(readFileSync(path.join(SESSIONS_DIR, file), 'utf-8'));
        // 统计真实消息数（排除 system prompt 和系统注入的工具结果消息）
        const messageCount = Array.isArray(content) ? content.filter(m =>
          m.role !== 'system' &&
          !(m.role === 'user' && m.content.startsWith('[系统返回的工具执行结果]'))
        ).length : 0;
        recovered.push({
          id: sessionId,
          name: `会话 ${recovered.length + 1}`,
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          messageCount
        });
        console.error(`[会话] 已恢复会话: ${sessionId} (${messageCount} 条消息)`);
      } catch (e) {
        // 跳过损坏的文件
      }
    }
    
    if (recovered.length > 0) {
      meta.sessions = recovered;
      if (!meta.activeId || !meta.sessions.find(s => s.id === meta.activeId)) {
        meta.activeId = recovered[0].id;
      }
      if (!currentSessionId) {
        currentSessionId = meta.activeId;
      }
      saveMeta(meta);
      console.error(`[会话] 已从磁盘恢复 ${recovered.length} 个会话`);
    }
  } catch (e) {
    // 目录不存在时忽略
  }
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
 * 添加工具结果消息（作为 user 角色注入，但不计入轮次）
 * 工具结果由系统注入，不是真实用户输入，不影响 turnCount 和会话活跃时间
 */
function addToolResultMessage(content) {
  conversationHistory.push({ role: 'user', content });
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
    // 跳过系统注入的工具结果消息，只统计真实用户请求
    if (msg.role === 'user' && !msg.content.startsWith('[系统返回的工具执行结果]')) {
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

/**
 * 重置对话历史（切换 persona 时调用）
 */
function resetConversation() {
  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() }
  ];
  turnCount = 0;
  // 保存重置后的会话
  if (currentSessionId) {
    saveSession(currentSessionId, conversationHistory);
  }
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
  addToolResultMessage,
  shouldCompress,
  compressHistory,
  getHistoryLength,
  resetConversation,
  estimateTokens,
  getContextTokenEstimate,
  isApproachingLimit,
  getCompressionAdvice
};
