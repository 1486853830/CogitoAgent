# 工具系统详解

> 详细文档：工具注册机制、各分类工具使用说明与最佳实践。

## 工具系统

工具系统由 `registry.js` 统一管理，所有工具函数通过 `[TOOL] functionName(args) [/TOOL]` 格式调用。

### 工具分类

| 分类 | 文件 | 主要功能 |
|------|------|----------|
| 文件操作 | `file.js` | `ls`, `read`, `create`, `copy`, `mkdir`, `delete`, `move`, `append`, `write`, `rename` |
| 路径工具 | `path.js` | `getBasePath`, `joinPath`, `resolvePath`, `normalizePath`, `getExtension`, `getFileName`, `getParentDir` |
| 网络工具 | `web.js` | `search`, `browse`, `fetchPage`, `searchOnEngine` |
| 浏览器自动化 | `browser.js` | `initBrowser`, `clickElement`, `fillField`, `selectOption`, `viewChanges`, `getPageContent`, `takeScreenshot`, `closeBrowser`, `searchOnPage`, `findElements`, `searchOnEngine`, `downloadFile` |
| 系统操作 | `system.js` | `listApps`, `openApp`, `closeApp`, `getOSInfo`, `getUserName`, `getHomeDir` |
| 代码执行 | `code.js` | `executeCode`, `executeFile`, `runJavaScript`, `runPython`, `formatCode` |
| 安全沙箱 | `sandbox.js` | `createJavaScriptSandbox`, `runJavaScriptSandbox`, `runPythonSandbox`, `executeCodeSandbox` |
| Git | `git.js` | `gitInit`, `gitClone`, `gitAdd`, `gitCommit`, `gitPush`, `gitPull`, `gitStatus`, `gitLog`, `gitBranchCreate`, `gitBranchDelete`, `gitBranchList`, `gitCheckout`, `gitCheckoutNew`, `gitMerge`, `gitDiff`, `gitRemoteAdd`, `gitRemoteList`, `gitConfigUser`, `gitReset`, `gitStash`, `gitStashPop` |
| 任务管理 | `task.js` | `createTask`, `getTasks`, `getTask`, `updateTask`, `deleteTask`, `completeTask`, `splitTask`, `getTaskStats`, `clearTasks` |
| 记忆系统 | `memory.js` | `addMemory`, `searchMemory`, `getAllMemories`, `getMemory`, `updateMemory`, `deleteMemory`, `getMemoryStats`, `getRelatedMemories`, `clearMemory` |
| 数据处理 | `data.js` | `readCSV`, `writeCSV`, `readJSON`, `writeJSON`, `csvToJSON`, `jsonToCSV`, `queryData`, `analyzeData`, `sortData`, `filterData`, `groupData`, `aggregateData` |
| 数据库 | `db.js` | `executeSQL`, `query`, `insert`, `update`, `deleteData`, `createTable`, `dropTable`, `getTables`, `getTableSchema`, `executeTransaction`, `closeDB` |
| 邮件 | `email.js` | `sendEmail`, `sendTextEmail`, `sendHtmlEmail`, `sendTemplateEmail`, `sendEmailWithAttachments`, `checkEmailConfig` |
| 系统监控 | `monitor.js` | `getCPUInfo`, `getMemoryInfo`, `getDiskInfo`, `getNetworkInfo`, `getProcesses`, `getSystemInfo`, `getCurrentProcess`, `getSystemLoad`, `monitorSystem` |
| 定时任务 | `scheduler.js` | `addScheduleTask`, `getScheduleTasks`, `getScheduleTask`, `updateScheduleTask`, `toggleScheduleTask`, `removeScheduleTask`, `startScheduler`, `stopScheduler` |
| 存储 | `storage.js` | `FileStorage`, `createStorage`, `getStorage`, `clearStorage` |
| 图像识别 | `ocr.js` | `ocr`, `ocrBatch` |
| 视觉分析 | `vision.js` | `vision`, `visionFromUrl` |
| Office 文档 | `office.js` | `createPpt`, `createWord`, `createExcel`, `readExcel` |

### 工具注册机制

工具函数统一注册到注册表，包含以下元数据：

```javascript
{
  name: '函数名',
  description: '函数描述',
  parameters: { /* JSON Schema */ },
  category: '分类',
  dangerLevel: 'none | low | medium | high',
  fn: async (args) => { /* 实现 */ }
}
```

### 工具调用示例

```
AI: [TOOL] ls("/project/src") [/TOOL]
→ 返回目录文件列表

AI: [TOOL] runPython("print('hello')") [/TOOL]
→ 执行 Python 代码，返回输出
```

---

## 文件操作工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `ls` | 列出目录内容 | `path`（目录路径） |
| `read` | 读取文件内容 | `path`（文件路径） |
| `create` | 创建文件 | `path`, `content` |
| `write` | 写入文件（覆盖） | `path`, `content` |
| `append` | 追加内容到文件 | `path`, `content` |
| `copy` | 复制文件 | `source`, `destination` |
| `move` | 移动文件 | `source`, `destination` |
| `rename` | 重命名文件 | `path`, `newName` |
| `mkdir` | 创建目录 | `path` |
| `delete` | 删除文件或目录 | `path` |

### 使用示例

```javascript
[TOOL] ls("./src") [/TOOL]
[TOOL] read("./src/config.js") [/TOOL]
[TOOL] create("notes.txt", "Hello World") [/TOOL]
[TOOL] append("notes.txt", "\nNew line") [/TOOL]
[TOOL] copy("notes.txt", "notes_backup.txt") [/TOOL]
[TOOL] mkdir("./data") [/TOOL]
```

---

## 路径工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `getBasePath` | 获取基础路径 | 无 |
| `joinPath` | 拼接路径 | `...paths` |
| `resolvePath` | 解析绝对路径 | `...paths` |
| `normalizePath` | 规范化路径 | `path` |
| `getExtension` | 获取文件扩展名 | `path` |
| `getFileName` | 获取文件名 | `path` |
| `getParentDir` | 获取父目录 | `path` |

### 使用示例

```javascript
[TOOL] getBasePath() [/TOOL]
[TOOL] joinPath("src", "agent", "tools") [/TOOL]
[TOOL] getExtension("document.pdf") [/TOOL]
[TOOL] getFileName("/path/to/file.txt") [/TOOL]
```

---

## 浏览器自动化详解

浏览器自动化工具基于 Playwright 实现，支持网页交互、截图、表单填写等操作。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `initBrowser` | 初始化浏览器实例 | 无 |
| `clickElement` | 点击页面元素 | `selector` |
| `fillField` | 填写表单字段 | `selector`, `value` |
| `selectOption` | 选择下拉框选项 | `selector`, `value` |
| `viewChanges` | 查看页面变化 | `timeout`（可选） |
| `getPageContent` | 获取页面内容 | 无 |
| `takeScreenshot` | 截取页面截图 | `selector`（可选） |
| `closeBrowser` | 关闭浏览器实例 | 无 |
| `searchOnPage` | 在页面内搜索文本 | `query` |
| `findElements` | 查找页面元素 | `selector` |
| `searchOnEngine` | 在搜索引擎搜索 | `query` |
| `downloadFile` | 下载文件 | `url`, `savePath` |

### 使用示例

```javascript
[TOOL] initBrowser() [/TOOL]
[TOOL] clickElement("#login-btn") [/TOOL]
[TOOL] fillField("#username", "user") [/TOOL]
[TOOL] selectOption("#country", "China") [/TOOL]
[TOOL] takeScreenshot() [/TOOL]
[TOOL] getPageContent() [/TOOL]
[TOOL] closeBrowser() [/TOOL]
```

### 浏览器配置

```json
{
  "browser": {
    "type": "chromium",
    "headless": true,
    "timeout": 30000
  }
}
```

### 安全限制

- 浏览器实例最多存活 5 分钟
- 自动关闭长时间未操作的浏览器
- 禁止访问本地文件系统 URL（file://）
- 截图自动保存到临时目录，定期清理

---

## 代码执行工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `executeCode` | 执行代码（自动识别语言） | `code`, `language`（可选） |
| `executeFile` | 执行代码文件 | `filePath` |
| `runJavaScript` | 执行 JavaScript 代码 | `code` |
| `runPython` | 执行 Python 代码 | `code` |
| `formatCode` | 格式化代码 | `code`, `language` |

### 使用示例

```javascript
[TOOL] runJavaScript("console.log('Hello')") [/TOOL]
[TOOL] runPython("print(1+2)") [/TOOL]
[TOOL] executeFile("./script.py") [/TOOL]
[TOOL] formatCode("function test(){return 1}", "javascript") [/TOOL]
```

---

## 安全沙箱工具详解

安全沙箱使用 `isolated-vm` 实现进程级隔离，防止恶意代码访问宿主环境。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `createJavaScriptSandbox` | 创建 JavaScript 沙箱 | `options`（可选） |
| `runJavaScriptSandbox` | 在沙箱中执行 JS | `code`, `context`（可选） |
| `runPythonSandbox` | 在沙箱中执行 Python | `code` |
| `executeCodeSandbox` | 在沙箱中执行代码 | `code`, `language` |

### 安全特性

- 内置对象深度冻结
- 禁止访问文件系统和网络
- 禁止访问进程环境
- 代码执行超时限制
- 内存使用限制

---

## Git 工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `gitInit` | 初始化仓库 | `path`（可选） |
| `gitClone` | 克隆仓库 | `url`, `path`（可选） |
| `gitAdd` | 添加文件 | `files` |
| `gitCommit` | 提交更改 | `message`, `options`（可选） |
| `gitPush` | 推送到远程 | `remote`, `branch` |
| `gitPull` | 拉取远程 | `remote`, `branch` |
| `gitStatus` | 查看状态 | 无 |
| `gitLog` | 查看日志 | `options`（可选） |
| `gitBranchCreate` | 创建分支 | `name` |
| `gitBranchDelete` | 删除分支 | `name` |
| `gitBranchList` | 列出分支 | 无 |
| `gitCheckout` | 切换分支 | `name` |
| `gitCheckoutNew` | 创建并切换分支 | `name` |
| `gitMerge` | 合并分支 | `branch` |
| `gitDiff` | 查看差异 | `options`（可选） |
| `gitRemoteAdd` | 添加远程 | `name`, `url` |
| `gitRemoteList` | 列出远程 | 无 |
| `gitConfigUser` | 配置用户 | `name`, `email` |
| `gitReset` | 重置 | `mode`, `target` |
| `gitStash` | 暂存 | 无 |
| `gitStashPop` | 恢复暂存 | 无 |

### 使用示例

```javascript
[TOOL] gitInit() [/TOOL]
[TOOL] gitAdd(".") [/TOOL]
[TOOL] gitCommit("feat: add new feature") [/TOOL]
[TOOL] gitPush("origin", "main") [/TOOL]
[TOOL] gitStatus() [/TOOL]
```

---

## 任务管理工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `createTask` | 创建任务 | `title`, `description`（可选）, `priority`（可选） |
| `getTasks` | 获取所有任务 | `status`（可选） |
| `getTask` | 获取单个任务 | `id` |
| `updateTask` | 更新任务 | `id`, `data` |
| `deleteTask` | 删除任务 | `id` |
| `completeTask` | 完成任务 | `id` |
| `splitTask` | 拆分任务 | `id`, `subTasks` |
| `getTaskStats` | 获取任务统计 | 无 |
| `clearTasks` | 清除所有任务 | 无 |

### 使用示例

```javascript
[TOOL] createTask("完成项目文档", "编写 README 和架构文档", "high") [/TOOL]
[TOOL] getTasks("pending") [/TOOL]
[TOOL] completeTask("task-id-1") [/TOOL]
[TOOL] getTaskStats() [/TOOL]
```

---

## 记忆系统工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `addMemory` | 添加记忆 | `content`, `tags`（可选） |
| `searchMemory` | 搜索记忆 | `query` |
| `getAllMemories` | 获取所有记忆 | 无 |
| `getMemory` | 获取单个记忆 | `id` |
| `updateMemory` | 更新记忆 | `id`, `data` |
| `deleteMemory` | 删除记忆 | `id` |
| `getMemoryStats` | 获取记忆统计 | 无 |
| `getRelatedMemories` | 获取相关记忆 | `id` |
| `clearMemory` | 清除所有记忆 | 无 |

### 使用示例

```javascript
[TOOL] addMemory("用户偏好：喜欢简洁的界面设计", ["user", "preference"]) [/TOOL]
[TOOL] searchMemory("界面设计") [/TOOL]
[TOOL] getRelatedMemories("memory-id") [/TOOL]
```

---

## 数据处理工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `readCSV` | 读取 CSV 文件 | `path` |
| `writeCSV` | 写入 CSV 文件 | `path`, `data` |
| `readJSON` | 读取 JSON 文件 | `path` |
| `writeJSON` | 写入 JSON 文件 | `path`, `data` |
| `csvToJSON` | CSV 转 JSON | `csvContent` |
| `jsonToCSV` | JSON 转 CSV | `jsonData` |
| `queryData` | 查询数据 | `data`, `query` |
| `analyzeData` | 分析数据 | `data`, `options` |
| `sortData` | 排序数据 | `data`, `field`, `order` |
| `filterData` | 过滤数据 | `data`, `condition` |
| `groupData` | 分组数据 | `data`, `field` |
| `aggregateData` | 聚合数据 | `data`, `aggregation` |

### 使用示例

```javascript
[TOOL] readCSV("data.csv") [/TOOL]
[TOOL] writeJSON("output.json", { key: "value" }) [/TOOL]
[TOOL] sortData(data, "date", "desc") [/TOOL]
[TOOL] filterData(data, { status: "active" }) [/TOOL]
```

---

## 数据库操作详解

数据库工具支持 SQLite 数据库的创建、查询、插入、更新等操作。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `executeSQL` | 执行任意 SQL 语句 | `sql` |
| `query` | 执行查询语句 | `sql`, `params`（可选） |
| `insert` | 插入数据 | `table`, `data` |
| `update` | 更新数据 | `table`, `data`, `where` |
| `deleteData` | 删除数据 | `table`, `where` |
| `createTable` | 创建表 | `tableName`, `schema` |
| `dropTable` | 删除表 | `tableName` |
| `getTables` | 列出所有表 | 无 |
| `getTableSchema` | 获取表结构 | `tableName` |
| `executeTransaction` | 执行事务 | `statements` |
| `closeDB` | 关闭数据库连接 | 无 |

### 使用示例

```javascript
[TOOL] createTable("users", { id: "INTEGER PRIMARY KEY", name: "TEXT" }) [/TOOL]
[TOOL] insert("users", { name: "张三" }) [/TOOL]
[TOOL] query("SELECT * FROM users") [/TOOL]
[TOOL] update("users", { name: "李四" }, { id: 1 }) [/TOOL]
[TOOL] deleteData("users", { id: 1 }) [/TOOL]
[TOOL] getTables() [/TOOL]
[TOOL] getTableSchema("users") [/TOOL]
[TOOL] executeTransaction([
  { sql: "UPDATE accounts SET balance = balance - 100 WHERE id = 1" },
  { sql: "UPDATE accounts SET balance = balance + 100 WHERE id = 2" }
]) [/TOOL]
```

### 数据库配置

```json
{
  "database": {
    "path": "./data/mydb.db",
    "timeout": 5000
  }
}
```

### 安全限制

- 只能访问工作区内的数据库文件
- 禁止执行 DROP DATABASE 等危险操作
- 事务失败自动回滚
- 查询结果最多返回 1000 行

---

## 邮件工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `sendEmail` | 发送邮件 | `options` |
| `sendTextEmail` | 发送纯文本邮件 | `to`, `subject`, `body` |
| `sendHtmlEmail` | 发送 HTML 邮件 | `to`, `subject`, `html` |
| `sendTemplateEmail` | 发送模板邮件 | `to`, `template`, `data` |
| `sendEmailWithAttachments` | 发送带附件的邮件 | `options`, `attachments` |
| `checkEmailConfig` | 检查邮件配置 | 无 |

### 使用示例

```javascript
[TOOL] sendTextEmail("user@example.com", "测试邮件", "Hello") [/TOOL]
[TOOL] sendHtmlEmail("user@example.com", "HTML 邮件", "<h1>Hello</h1>") [/TOOL]
```

---

## 系统监控工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `getCPUInfo` | 获取 CPU 信息 | 无 |
| `getMemoryInfo` | 获取内存信息 | 无 |
| `getDiskInfo` | 获取磁盘信息 | 无 |
| `getNetworkInfo` | 获取网络信息 | 无 |
| `getProcesses` | 获取进程列表 | 无 |
| `getSystemInfo` | 获取系统信息 | 无 |
| `getCurrentProcess` | 获取当前进程信息 | 无 |
| `getSystemLoad` | 获取系统负载 | 无 |
| `monitorSystem` | 监控系统状态 | `interval`（可选） |

### 使用示例

```javascript
[TOOL] getCPUInfo() [/TOOL]
[TOOL] getMemoryInfo() [/TOOL]
[TOOL] getSystemInfo() [/TOOL]
```

---

## 定时任务工具详解

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `addScheduleTask` | 添加定时任务 | `name`, `cron`, `command` |
| `getScheduleTasks` | 获取所有定时任务 | 无 |
| `getScheduleTask` | 获取单个定时任务 | `id` |
| `updateScheduleTask` | 更新定时任务 | `id`, `data` |
| `toggleScheduleTask` | 启用/禁用定时任务 | `id` |
| `removeScheduleTask` | 删除定时任务 | `id` |
| `startScheduler` | 启动调度器 | 无 |
| `stopScheduler` | 停止调度器 | 无 |

### 使用示例

```javascript
[TOOL] addScheduleTask("daily-report", "0 9 * * *", "generateReport()") [/TOOL]
[TOOL] getScheduleTasks() [/TOOL]
[TOOL] toggleScheduleTask("task-id") [/TOOL]
```

---

## 图像文字识别（OCR）详解

OCR 工具基于视觉大模型实现图像文字识别能力，支持常见图片格式的文字提取。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `ocr` | 识别单张图片中的文字 | `imagePath` |
| `ocrBatch` | 批量识别多张图片文字 | `images`（用逗号分隔） |

### 支持格式

JPEG、PNG、WebP、BMP、GIF

### 使用示例

```javascript
[TOOL] ocr("/path/to/screenshot.png") [/TOOL]
[TOOL] ocrBatch("img1.jpg, img2.png, img3.webp") [/TOOL]
```

### OCR 配置

```json
{
  "ocr": {
    "provider": "",
    "baseURL": "",
    "apiKey": "",
    "model": "Qwen2.5-VL-32B-Instruct"
  }
}
```

---

## 视觉分析（Vision）详解

视觉分析工具基于多模态大模型，支持对图片内容进行描述、理解与问答。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `vision` | 分析本地图片内容 | `imagePath`, `prompt`（可选） |
| `visionFromUrl` | 分析网络图片 URL | `imageUrl`, `prompt`（可选） |

### 使用示例

```javascript
[TOOL] vision("/path/to/photo.jpg") [/TOOL]
[TOOL] vision("ui.png", "请描述这个界面的布局") [/TOOL]
[TOOL] visionFromUrl("https://example.com/image.jpg") [/TOOL]
```

### Vision 配置

```json
{
  "vision": {
    "baseURL": "",
    "apiKey": "",
    "model": "Qwen2.5-VL-32B-Instruct"
  }
}
```

---

## Office 文档工具详解

Office 文档工具支持创建 PPT 演示文稿、Word 文档和 Excel 表格。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `createPpt` | 创建 PPT 演示文稿 | `options` 或 `outputPath, title, content` |
| `createWord` | 创建 Word 文档 | `options` 或 `outputPath, title, content` |
| `createExcel` | 创建 Excel 表格 | `options` 或 `outputPath, sheetName, data` |
| `readExcel` | 读取 Excel 文件 | `filePath` |

### 使用示例

```javascript
[TOOL] createPpt("data/presentation.pptx", "项目报告", "内容") [/TOOL]
[TOOL] createWord({ outputPath: "doc.docx", paragraphs: [...] }) [/TOOL]
[TOOL] createExcel({ outputPath: "data.xlsx", sheets: [...] }) [/TOOL]
[TOOL] readExcel("data.xlsx") [/TOOL]
```

---

## 应用场景示例

### 文件探索

```javascript
[TOOL] ls("./src") [/TOOL]
[TOOL] read("./src/agent/Agent.js") [/TOOL]
```

### 代码执行

```javascript
[TOOL] runPython("print('Hello')") [/TOOL]
[TOOL] runJavaScript("console.log([1,2,3].reduce((a,b)=>a+b,0))") [/TOOL]
[TOOL] executeFile("./script.py") [/TOOL]
```

### Git 版本控制

```javascript
[TOOL] gitStatus() [/TOOL]
[TOOL] gitAdd(".") [/TOOL]
[TOOL] gitCommit("feat: add feature") [/TOOL]
[TOOL] gitPush("origin", "main") [/TOOL]
```

### 数据库操作

```javascript
[TOOL] executeSQL("SELECT * FROM tasks") [/TOOL]
[TOOL] insert("tasks", { title: "新任务" }) [/TOOL]
```

### 联网搜索

```javascript
[TOOL] search("Node.js features") [/TOOL]
[TOOL] fetchPage("https://nodejs.org/") [/TOOL]
```

### 图像识别与视觉分析

```javascript
[TOOL] ocr("screenshot.png") [/TOOL]
[TOOL] vision("photo.jpg", "请描述这张图片") [/TOOL]
```

### Office 文档生成

```javascript
[TOOL] createPpt("data/presentation.pptx", "项目汇报", "内容") [/TOOL]
[TOOL] createExcel("data/sales.xlsx", "销售", [["产品", "销量"]]) [/TOOL]
```