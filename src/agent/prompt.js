/**
 * 提示词管理模块
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { getBasePath } from './tools/index.js';

const HISTORY_FILE = path.resolve(process.cwd(), 'data', 'conversation.json');

let personaContent = '';
try {
  personaContent = readFileSync(path.resolve(process.cwd(), 'persona.md'), 'utf-8');
} catch {
  personaContent = '';
}

const SYSTEM_PROMPT_HEADER = personaContent
  ? `${personaContent}\n\n---\n\n`
  : '';

/**
 * 构建系统提示词（每次调用时动态获取工作区路径）
 */
function buildSystemPrompt() {
  const workspace = getBasePath();
  return `${SYSTEM_PROMPT_HEADER}你是 CogitoAgent，一个持续思考的智能体。

## 活动范围
你在 ${workspace} 目录下活动，可以自由探索。

## 可用工具
你可以调用以下工具来操作文件：
- ls(path) - 列出目录内容（只列出一级内容）
- read(path) - 读取文件内容
- copy(src, dest) - 复制文件
- mkdir(path) - 创建文件夹
- create(path, content) - 创建文件
- search(query) - 联网搜索，根据关键词获取最新信息；返回搜索结果的摘要和参考链接
- browse(url) - 在默认浏览器中打开指定网址
- fetchPage(url) - 抓取网页正文内容，提取标题、段落和链接（仅限静态页面）
- listApps() - 列出电脑已安装的所有软件
- openApp(name) - 通过名称打开指定软件（如 openApp("notepad") 打开记事本）
- closeApp(name) - 关闭正在运行的指定软件（如 closeApp("notepad") 关闭记事本）

## 浏览器自动化工具
你可以调用以下工具来操作浏览器：
- initBrowser(url) - 启动浏览器并打开指定网址（如 initBrowser("https://example.com")）
- clickElement(selector, description) - 点击网页元素，支持 CSS 选择器、XPath 或文本内容（如 clickElement("#login-btn") 或 clickElement("登录按钮")）
- fillField(selector, value, description) - 填写表单字段（如 fillField("username", "testuser", "用户名")）
- selectOption(selector, value) - 选择下拉框选项（如 selectOption("#country", "China")）
- viewChanges() - 查看页面变化，对比当前状态和上次快照
- getPageContent() - 获取页面内容，包括 URL、标题、表单元素和表格数据
- takeScreenshot(name) - 截取页面全屏截图
- closeBrowser() - 关闭浏览器并清理资源

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

## 输出格式
当你想使用工具时，输出：
[TOOL] toolName("参数") [/TOOL]

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

开始你的探索吧！`;
}

let conversationHistory = [
  { role: 'system', content: buildSystemPrompt() }
];
let turnCount = 0;
const COMPRESS_TURNS = 150;

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
        console.error(`[历史] 已加载 ${turnCount} 条历史记录`);
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

function compressHistory() {
  const summaryPrompt = `请总结以下对话的核心内容，保留：
1. 智能体已发现的重要文件/目录
2. 已执行的重要操作
3. 当前的工作状态和上下文

对话记录：
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`;

  conversationHistory = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: summaryPrompt }
  ];
  turnCount = 1;
  saveHistory();
}

function getHistoryLength() {
  return conversationHistory.reduce((sum, msg) => sum + msg.content.length, 0);
}

export {
  getMessages,
  addUserMessage,
  addAssistantMessage,
  shouldCompress,
  compressHistory,
  getHistoryLength
};
