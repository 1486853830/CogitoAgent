# 工具系统详解

> 详细文档：工具注册机制、各分类工具使用说明与最佳实践。

## 工具系统

工具系统由 `registry.ts` 统一管理，所有工具函数通过 `[TOOL] functionName(args) [/TOOL]` 格式调用。

### 工具分类

| 分类 | 文件 | 主要功能 |
|------|------|----------|
| 文件操作 | `file.ts` | `ls`, `read`, `create`, `copy`, `mkdir`, `delete`, `move`, `append`, `write`, `rename` |
| 路径工具 | `path.ts` | `getBasePath`, `joinPath`, `resolvePath`, `normalizePath`, `getExtension`, `getFileName`, `getParentDir` |
| 网络工具 | `web.ts` | `search`, `browse`, `fetchPage`, `searchOnEngine` |
| 浏览器自动化 | `browser.ts` | `initBrowser`, `clickElement`, `fillField`, `selectOption`, `viewChanges`, `getPageContent`, `takeScreenshot`, `closeBrowser`, `searchOnPage`, `findElements`, `searchOnEngine`, `downloadFile` |
| 系统操作 | `system.ts` | `listApps`, `openApp`, `closeApp`, `getOSInfo`, `getUserName`, `getHomeDir` |
| 代码执行 | `code.ts` | `executeCode`, `executeFile`, `runJavaScript`, `runPython`, `formatCode` |
| 安全沙箱 | `sandbox.ts` | `createJavaScriptSandbox`, `runJavaScriptSandbox`, `runPythonSandbox`, `executeCodeSandbox` |
| Git | `git.ts` | `gitInit`, `gitClone`, `gitAdd`, `gitCommit`, `gitPush`, `gitPull`, `gitStatus`, `gitLog`, `gitBranchCreate`, `gitBranchDelete`, `gitBranchList`, `gitCheckout`, `gitCheckoutNew`, `gitMerge`, `gitDiff`, `gitRemoteAdd`, `gitRemoteList`, `gitConfigUser`, `gitReset`, `gitStash`, `gitStashPop` |
| 任务管理 | `task.ts` | `createTask`, `getTasks`, `getTask`, `updateTask`, `deleteTask`, `completeTask`, `splitTask`, `getTaskStats`, `clearTasks` |
| 记忆系统 | `memory.ts` | `addMemory`, `searchMemory`, `getAllMemories`, `getMemory`, `updateMemory`, `deleteMemory`, `getMemoryStats`, `getRelatedMemories`, `clearMemory` |
| 数据处理 | `data.ts` | `readCSV`, `writeCSV`, `readJSON`, `writeJSON`, `csvToJSON`, `jsonToCSV`, `queryData`, `analyzeData`, `sortData`, `filterData`, `groupData`, `aggregateData` |
| 数据库 | `db.ts` | `executeSQL`, `query`, `insert`, `update`, `deleteData`, `createTable`, `dropTable`, `getTables`, `getTableSchema`, `executeTransaction`, `closeDB` |
| 邮件 | `email.ts` | `sendEmail`, `sendTextEmail`, `sendHtmlEmail`, `sendTemplateEmail`, `sendEmailWithAttachments`, `checkEmailConfig` |
| 系统监控 | `monitor.ts` | `getCPUInfo`, `getMemoryInfo`, `getDiskInfo`, `getNetworkInfo`, `getProcesses`, `getSystemInfo`, `getCurrentProcess`, `getSystemLoad`, `monitorSystem` |
| 定时任务 | `scheduler.ts` | `addScheduleTask`, `getScheduleTasks`, `getScheduleTask`, `updateScheduleTask`, `toggleScheduleTask`, `removeScheduleTask`, `startScheduler`, `stopScheduler` |
| 存储 | `storage.ts` | `FileStorage`, `createStorage`, `getStorage`, `clearStorage` |
| 图像识别 | `ocr.ts` | `ocr`, `ocrBatch` |
| 视觉分析 | `vision.ts` | `vision`, `visionFromUrl` |
| Office 文档 | `office.ts` | `createPpt`, `createWord`, `createExcel`, `readExcel` |
| GIS 地理信息 | `gis.ts` | `convertCoord`, `calcDistance`, `calcArea`, `calcCenter`, `pointInPolygon`, `readGeoJSON`, `queryGeoJSON`, `geoJSONStats`, `geoJSONToCSV`, `geoJSONToKML`, `isInChina` |
| 生命科学 | `bio.ts` | `dnaComplement`, `dnaReverseComplement`, `rnaTranscribe`, `translate`, `gcContent`, `molecularWeight`, `hammingDistance`, `levenshteinDistance`, `tmEstimate`, `hairpinCheck`, `parseFASTA`, `parseFASTQ`, `fastaToCSV`, `codonUsage`, `randomSeq` |
| 医学 | `med.ts` | `bmi`, `bsa`, `egfr`, `crcl`, `childPugh`, `calculateDose`, `bsaDose`, `infusionRate`, `idealBodyWeight`, `convertUnit`, `temperatureConvert`, `meanArterialPressure`, `anionGap`, `correctedCalcium`, `oxygenIndex`, `parseVitalSigns`, `vitalsReport` |
| 化学 | `chem.ts` | `elementInfo`, `molWeight`, `elementComposition`, `molarity`, `dilution`, `phFromH`, `phToH`, `idealGasLaw`, `gasDensity` |
| 金融 | `finance.ts` | `compoundInterest`, `presentValue`, `futureValueAnnuity`, `npv`, `irr`, `paybackPeriod`, `roi`, `loanPayment`, `amortizationSchedule`, `totalInterest`, `movingAverage`, `volatility` |
| 数学统计 | `math.ts` | `describe`, `correlation`, `linearRegression`, `matrixMultiply`, `matrixDeterminant`, `matrixInverse`, `solveQuadratic`, `factorial`, `combination`, `permutation`, `siConvert` |

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

## GIS 地理信息工具详解

GIS 工具提供坐标转换、空间计算、GeoJSON 处理等地理信息功能。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `convertCoord` | 坐标系转换 | `lng`, `lat`, `from`, `to`（支持 wgs84/gcj02/bd09） |
| `calcDistance` | 两点距离计算 | `lng1`, `lat1`, `lng2`, `lat2`, `unit`（可选） |
| `calcArea` | 多边形面积计算 | `coordinates`（GeoJSON 坐标数组） |
| `calcCenter` | 计算质心 | `coordinates` |
| `pointInPolygon` | 点在多边形内判断 | `lng`, `lat`, `polygon`（坐标数组） |
| `readGeoJSON` | 读取 GeoJSON 文件 | `filePath` |
| `queryGeoJSON` | 查询 GeoJSON 属性 | `filePath`, `filter` |
| `geoJSONStats` | GeoJSON 统计分析 | `filePath` |
| `geoJSONToCSV` | GeoJSON 转 CSV | `geojsonPath`, `csvPath` |
| `geoJSONToKML` | GeoJSON 转 KML | `geojsonPath`, `kmlPath` |
| `isInChina` | 判断坐标是否在中国 | `lng`, `lat` |

### 使用示例

```javascript
[TOOL] convertCoord(116.397428, 39.90923, "wgs84", "gcj02") [/TOOL]
[TOOL] calcDistance(116.4, 39.9, 121.5, 31.2) [/TOOL]
[TOOL] readGeoJSON("data/map.geojson") [/TOOL]
[TOOL] pointInPolygon(116.4, 39.9, "[[116.3,39.8],[116.5,39.8],[116.5,40.0],[116.3,40.0],[116.3,39.8]]") [/TOOL]
```

---

## 生命科学工具详解

生命科学工具提供 DNA/RNA/蛋白质序列分析、引物设计辅助、FASTA/FASTQ 解析等功能。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `dnaComplement` | DNA 互补链 | `seq` |
| `dnaReverseComplement` | DNA 反向互补 | `seq` |
| `rnaTranscribe` | DNA → RNA 转录 | `seq` |
| `translate` | RNA → 氨基酸翻译 | `seq`, `readingFrame`（可选） |
| `gcContent` | GC 含量计算 | `seq` |
| `molecularWeight` | 蛋白质分子量 | `seq` |
| `hammingDistance` | Hamming 距离 | `seq1`, `seq2` |
| `levenshteinDistance` | Levenshtein 编辑距离 | `seq1`, `seq2` |
| `tmEstimate` | 引物 Tm 值估算 | `seq` |
| `hairpinCheck` | 引物发夹结构检测 | `seq` |
| `parseFASTA` | 解析 FASTA 文件 | `filePath` |
| `parseFASTQ` | 解析 FASTQ 文件 | `filePath` |
| `fastaToCSV` | FASTA 转 CSV | `fastaPath`, `csvPath` |
| `codonUsage` | 密码子使用频率 | `seq` |
| `randomSeq` | 随机序列生成 | `length`, `type`（dna/rna/protein） |

### 使用示例

```javascript
[TOOL] dnaReverseComplement("ATGCGTACG") [/TOOL]
[TOOL] rnaTranscribe("ATGCGTACG") [/TOOL]
[TOOL] translate("AUGCCUAGCUAG", 0) [/TOOL]
[TOOL] gcContent("ATGCGCTAGCTAGCTAG") [/TOOL]
[TOOL] parseFASTA("sequences.fasta") [/TOOL]
[TOOL] hammingDistance("ATGC", "ATCC") [/TOOL]
[TOOL] randomSeq(50, "dna") [/TOOL]
```

---

## 医学工具详解

医学工具提供临床评分计算、药物剂量、生理参数分析等功能。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `bmi` | BMI 体重指数 | `weight`（kg）, `height`（m） |
| `bsa` | 体表面积 | `weight`（kg）, `height`（cm）, `formula`（可选） |
| `egfr` | 估算肾小球滤过率 | `creatinine`, `age`, `gender` |
| `crcl` | 肌酐清除率 | `creatinine`, `age`, `weight`, `gender` |
| `childPugh` | Child-Pugh 肝功能分级 | `bilirubin`, `albumin`, `inr`, `ascites`, `encephalopathy` |
| `calculateDose` | 按体重计算剂量 | `weight`, `dosePerKg`, `unit`（可选） |
| `bsaDose` | 按体表面积计算剂量 | `bsa`, `dosePerM2`, `unit`（可选） |
| `infusionRate` | 输液速度计算 | `volume`, `time`, `timeUnit`（可选） |
| `idealBodyWeight` | 理想体重 | `height`（cm）, `gender` |
| `convertUnit` | 医学单位换算 | `value`, `from`, `to` |
| `temperatureConvert` | 体温换算 | `value`, `from`, `to` |
| `meanArterialPressure` | 平均动脉压 | `sbp`, `dbp` |
| `anionGap` | 阴离子间隙 | `na`, `cl`, `hco3` |
| `correctedCalcium` | 校正钙 | `calcium`, `albumin` |
| `oxygenIndex` | 氧合指数 | `pao2`, `fio2` |
| `parseVitalSigns` | 解析生命体征 CSV | `filePath` |
| `vitalsReport` | 生命体征统计报告 | `filePath` |

### 使用示例

```javascript
[TOOL] bmi(70, 1.75) [/TOOL]
[TOOL] egfr(1.0, 45, "male") [/TOOL]
[TOOL] childPugh(2.5, 3.0, 1.8, "mild", "none") [/TOOL]
[TOOL] convertUnit(100, "mg/dL", "mmol/L") [/TOOL]
[TOOL] oxygenIndex(80, 40) [/TOOL]
[TOOL] parseVitalSigns("vitals.csv") [/TOOL]
```

---

## 化学工具详解

化学工具提供分子式解析、分子量计算、溶液计算、气体定律等功能。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `elementInfo` | 查询元素周期表 | `symbol` |
| `molWeight` | 计算分子量 | `formula`（如 H2SO4、Ca(OH)2） |
| `elementComposition` | 元素百分比组成 | `formula` |
| `molarity` | 摩尔浓度 | `moles`, `volume`（L） |
| `dilution` | 稀释计算 | `c1`, `v1`, `c2`, `v2`（缺哪个求哪个） |
| `phFromH` | H⁺ → pH | `h`（mol/L） |
| `phToH` | pH → H⁺ | `ph` |
| `idealGasLaw` | 理想气体状态方程 | `P`, `V`, `n`, `T`（缺哪个求哪个） |
| `gasDensity` | 气体密度 | `mw`, `T`（K）, `P`（atm） |

### 使用示例

```javascript
[TOOL] elementInfo("Fe") [/TOOL]
[TOOL] molWeight("H2SO4") [/TOOL]
[TOOL] elementComposition("Ca(OH)2") [/TOOL]
[TOOL] dilution(10, 100, 1, null) [/TOOL]
[TOOL] phFromH(1e-7) [/TOOL]
[TOOL] idealGasLaw(null, 22.4, 1, 273) [/TOOL]
```

---

## 金融工具详解

金融工具提供复利计算、投资分析、贷款计算、统计指标等功能。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `compoundInterest` | 复利终值 | `P`, `r`, `n`, `t` |
| `presentValue` | 现值计算 | `FV`, `r`, `n` |
| `futureValueAnnuity` | 年金终值 | `PMT`, `r`, `n` |
| `npv` | 净现值 | `rate`, `cashflows`（JSON 数组） |
| `irr` | 内部收益率 | `cashflows`（JSON 数组） |
| `paybackPeriod` | 投资回收期 | `cashflows`（JSON 数组） |
| `roi` | 投资回报率 | `gain`, `cost` |
| `loanPayment` | 等额本息月供 | `principal`, `annualRate`, `months` |
| `amortizationSchedule` | 还款计划表 | `principal`, `annualRate`, `months` |
| `totalInterest` | 总利息 | `principal`, `annualRate`, `months` |
| `movingAverage` | 移动平均线 | `data`（数组）, `period` |
| `volatility` | 波动率 | `prices`（数组） |

### 使用示例

```javascript
[TOOL] compoundInterest(10000, 0.05, 12, 5) [/TOOL]
[TOOL] npv(0.1, "[-10000, 3000, 4000, 5000]") [/TOOL]
[TOOL] irr("[-10000, 3000, 4000, 5000]") [/TOOL]
[TOOL] loanPayment(100000, 0.042, 240) [/TOOL]
[TOOL] roi(15000, 10000) [/TOOL]
[TOOL] volatility("[100, 102, 98, 105, 103]") [/TOOL]
```

---

## 数学统计工具详解

数学统计工具提供描述性统计、相关性分析、线性回归、矩阵运算等功能。

### 核心工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `describe` | 描述性统计 | `data`（数组） |
| `correlation` | 皮尔逊相关系数 | `x`, `y`（数组） |
| `linearRegression` | 线性回归 | `x`, `y`（数组） |
| `matrixMultiply` | 矩阵乘法 | `A`, `B`（二维数组） |
| `matrixDeterminant` | 矩阵行列式 | `A`（2x2/3x3 方阵） |
| `matrixInverse` | 矩阵逆 | `A`（2x2/3x3 方阵） |
| `solveQuadratic` | 一元二次方程求根 | `a`, `b`, `c` |
| `factorial` | 阶乘 | `n` |
| `combination` | 组合数 C(n,k) | `n`, `k` |
| `permutation` | 排列数 P(n,k) | `n`, `k` |
| `siConvert` | SI 单位换算 | `value`, `from`, `to` |

### 使用示例

```javascript
[TOOL] describe("[1,2,3,4,5,6,7,8,9,10]") [/TOOL]
[TOOL] correlation("[1,2,3,4,5]", "[2,4,6,8,10]") [/TOOL]
[TOOL] linearRegression("[1,2,3,4,5]", "[2,4,5,7,8]") [/TOOL]
[TOOL] matrixMultiply("[[1,2],[3,4]]", "[[5,6],[7,8]]") [/TOOL]
[TOOL] solveQuadratic(1, -5, 6) [/TOOL]
[TOOL] combination(5, 2) [/TOOL]
[TOOL] siConvert(1000, "kg", "g") [/TOOL]
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

### GIS 地理信息分析

```javascript
[TOOL] convertCoord(116.397428, 39.90923, "wgs84", "gcj02") [/TOOL]
[TOOL] calcDistance(116.4, 39.9, 121.5, 31.2) [/TOOL]
[TOOL] readGeoJSON("regions.geojson") [/TOOL]
[TOOL] geoJSONStats("regions.geojson") [/TOOL]
```

### 生命科学序列分析

```javascript
[TOOL] dnaReverseComplement("ATGCGTACG") [/TOOL]
[TOOL] gcContent("ATGCGCTAGCTAGCTAG") [/TOOL]
[TOOL] parseFASTA("genome.fasta") [/TOOL]
[TOOL] hammingDistance("ATGC", "ATCC") [/TOOL]
```

### 医学临床计算

```javascript
[TOOL] bmi(70, 1.75) [/TOOL]
[TOOL] egfr(1.0, 45, "male") [/TOOL]
[TOOL] childPugh(2.5, 3.0, 1.8, "mild", "none") [/TOOL]
[TOOL] oxygenIndex(80, 40) [/TOOL]
```

### 化学计算

```javascript
[TOOL] molWeight("H2SO4") [/TOOL]
[TOOL] elementInfo("Fe") [/TOOL]
[TOOL] phFromH(1e-7) [/TOOL]
[TOOL] idealGasLaw(null, 22.4, 1, 273) [/TOOL]
```

### 金融投资分析

```javascript
[TOOL] compoundInterest(10000, 0.05, 12, 5) [/TOOL]
[TOOL] npv(0.1, "[-10000, 3000, 4000, 5000]") [/TOOL]
[TOOL] irr("[-10000, 3000, 4000, 5000]") [/TOOL]
[TOOL] loanPayment(100000, 0.042, 240) [/TOOL]
```

### 数学统计分析

```javascript
[TOOL] describe("[1,2,3,4,5,6,7,8,9,10]") [/TOOL]
[TOOL] correlation("[1,2,3,4,5]", "[2,4,6,8,10]") [/TOOL]
[TOOL] linearRegression("[1,2,3,4,5]", "[2,4,5,7,8]") [/TOOL]
[TOOL] matrixMultiply("[[1,2],[3,4]]", "[[5,6],[7,8]]") [/TOOL]
```