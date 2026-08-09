# 工具系统详解

> 详细文档：工具注册机制、各分类工具使用说明与最佳实践。

## 工具系统

工具系统由 `registry.ts` 统一管理。模型通过**原生 function calling**（`tool_calls`）按 `tools` 里的 JSON Schema 直接调用工具，参数为合法 JSON，不再使用任何文本标记。

### 工具分类

| 分类         | 文件           | 主要功能                                                                                                                                                                                                                                                                                          |
| ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件操作     | `file.ts`      | `ls`, `read`, `create`, `copy`, `mkdir`, `delete`, `move`, `append`, `write`, `rename`                                                                                                                                                                                                            |
| 路径工具     | `path.ts`      | `getBasePath`, `joinPath`, `resolvePath`, `normalizePath`, `getExtension`, `getFileName`, `getParentDir`                                                                                                                                                                                          |
| 网络工具     | `web.ts`       | `search`, `browse`, `fetchPage`, `searchOnEngine`                                                                                                                                                                                                                                                 |
| 浏览器自动化 | `browser.ts`   | `initBrowser`, `clickElement`, `fillField`, `selectOption`, `viewChanges`, `getPageContent`, `takeScreenshot`, `closeBrowser`, `searchOnPage`, `findElements`, `searchOnEngine`, `downloadFile`                                                                                                   |
| 系统操作     | `system.ts`    | `listApps`, `openApp`, `closeApp`, `getOSInfo`, `getUserName`, `getHomeDir`                                                                                                                                                                                                                       |
| 代码执行     | `code.ts`      | `executeCode`, `executeFile`, `runJavaScript`, `runPython`, `formatCode`                                                                                                                                                                                                                          |
| 安全沙箱     | `sandbox.ts`   | `createJavaScriptSandbox`, `runJavaScriptSandbox`, `runPythonSandbox`, `executeCodeSandbox`                                                                                                                                                                                                       |
| Git          | `git.ts`       | `gitInit`, `gitClone`, `gitAdd`, `gitCommit`, `gitPush`, `gitPull`, `gitStatus`, `gitLog`, `gitBranchCreate`, `gitBranchDelete`, `gitBranchList`, `gitCheckout`, `gitCheckoutNew`, `gitMerge`, `gitDiff`, `gitRemoteAdd`, `gitRemoteList`, `gitConfigUser`, `gitReset`, `gitStash`, `gitStashPop` |
| 任务管理     | `task.ts`      | `createTask`, `getTasks`, `getTask`, `updateTask`, `deleteTask`, `completeTask`, `splitTask`, `getTaskStats`, `clearTasks`                                                                                                                                                                        |
| 记忆系统     | `memory.ts`    | `addMemory`, `searchMemory`, `getAllMemories`, `getMemory`, `updateMemory`, `deleteMemory`, `getMemoryStats`, `getRelatedMemories`, `clearMemory`                                                                                                                                                 |
| 数据处理     | `data.ts`      | `readCSV`, `writeCSV`, `readJSON`, `writeJSON`, `csvToJSON`, `jsonToCSV`, `queryData`, `analyzeData`, `sortData`, `filterData`, `groupData`, `aggregateData`                                                                                                                                      |
| 数据库       | `db.ts`        | `executeSQL`, `query`, `insert`, `update`, `deleteData`, `createTable`, `dropTable`, `getTables`, `getTableSchema`, `executeTransaction`, `closeDB`                                                                                                                                               |
| 邮件         | `email.ts`     | `sendEmail`, `sendTextEmail`, `sendHtmlEmail`, `sendTemplateEmail`, `sendEmailWithAttachments`, `checkEmailConfig`                                                                                                                                                                                |
| 系统监控     | `monitor.ts`   | `getCPUInfo`, `getMemoryInfo`, `getDiskInfo`, `getNetworkInfo`, `getProcesses`, `getSystemInfo`, `getCurrentProcess`, `getSystemLoad`, `monitorSystem`                                                                                                                                            |
| 定时任务     | `scheduler.ts` | `addScheduleTask`, `getScheduleTasks`, `getScheduleTask`, `updateScheduleTask`, `toggleScheduleTask`, `removeScheduleTask`, `startScheduler`, `stopScheduler`                                                                                                                                     |
| 图像识别     | `ocr.ts`       | `ocr`, `ocrBatch`                                                                                                                                                                                                                                                                                 |
| 视觉分析     | `vision.ts`    | `vision`, `visionFromUrl`                                                                                                                                                                                                                                                                         |
| Office 文档  | `office.ts`    | `createPpt`, `createWord`, `createExcel`, `readExcel`                                                                                                                                                                                                                                             |
| 集群管理     | `cluster.ts`   | `spawnAgent`, `delegateTask`, `getClusterStatus`, `stopAgent`, `stopAllAgents`, `parallelExecute`, `panelDiscussion`, `pipeline`, `voting`                                                                                                                                                        |
| 微信消息     | `wechat.ts`    | `loginWechat`, `logoutWechat`, `sendWechatMessage`, `sendWechatImage`, `getWechatStatus`, `generateWechatQRCode`                                                                                                                                                                                  |
| 图像生成     | `image-gen.ts` | `generateImage`                                                                                                                                                                                                                                                                                   |

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

调用走原生 `tool_calls`（参数为 JSON 对象），示例：

```
工具: ls
参数: { "path": "/project/src" }
→ 返回目录文件列表

工具: runPython
参数: { "code": "print('hello')", "language": "python" }
→ 执行 Python 代码，返回输出
```

---

## 文件操作工具详解

### 核心工具

| 工具     | 说明             | 参数                    |
| -------- | ---------------- | ----------------------- |
| `ls`     | 列出目录内容     | `path`（目录路径）      |
| `read`   | 读取文件内容     | `path`（文件路径）      |
| `create` | 创建文件         | `path`, `content`       |
| `write`  | 写入文件（覆盖） | `path`, `content`       |
| `append` | 追加内容到文件   | `path`, `content`       |
| `copy`   | 复制文件         | `source`, `destination` |
| `move`   | 移动文件         | `source`, `destination` |
| `rename` | 重命名文件       | `path`, `newName`       |
| `mkdir`  | 创建目录         | `path`                  |
| `delete` | 删除文件或目录   | `path`                  |

### 使用示例

```javascript
ls('./src');
read('./src/config.js');
create('notes.txt', 'Hello World');
append('notes.txt', '\nNew line');
copy('notes.txt', 'notes_backup.txt');
mkdir('./data');
```

---

## 路径工具详解

### 核心工具

| 工具            | 说明           | 参数       |
| --------------- | -------------- | ---------- |
| `getBasePath`   | 获取基础路径   | 无         |
| `joinPath`      | 拼接路径       | `...paths` |
| `resolvePath`   | 解析绝对路径   | `...paths` |
| `normalizePath` | 规范化路径     | `path`     |
| `getExtension`  | 获取文件扩展名 | `path`     |
| `getFileName`   | 获取文件名     | `path`     |
| `getParentDir`  | 获取父目录     | `path`     |

### 使用示例

```javascript
getBasePath();
joinPath('src', 'agent', 'tools');
getExtension('document.pdf');
getFileName('/path/to/file.txt');
```

---

## 浏览器自动化详解

浏览器自动化工具基于 Playwright 实现，支持网页交互、截图、表单填写等操作。

### 核心工具

| 工具             | 说明             | 参数                |
| ---------------- | ---------------- | ------------------- |
| `initBrowser`    | 初始化浏览器实例 | 无                  |
| `clickElement`   | 点击页面元素     | `selector`          |
| `fillField`      | 填写表单字段     | `selector`, `value` |
| `selectOption`   | 选择下拉框选项   | `selector`, `value` |
| `viewChanges`    | 查看页面变化     | `timeout`（可选）   |
| `getPageContent` | 获取页面内容     | 无                  |
| `takeScreenshot` | 截取页面截图     | `selector`（可选）  |
| `closeBrowser`   | 关闭浏览器实例   | 无                  |
| `searchOnPage`   | 在页面内搜索文本 | `query`             |
| `findElements`   | 查找页面元素     | `selector`          |
| `searchOnEngine` | 在搜索引擎搜索   | `query`             |
| `downloadFile`   | 下载文件         | `url`, `savePath`   |

### 使用示例

```javascript
initBrowser();
clickElement('#login-btn');
fillField('#username', 'user');
selectOption('#country', 'China');
takeScreenshot();
getPageContent();
closeBrowser();
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

| 工具            | 说明                     | 参数                       |
| --------------- | ------------------------ | -------------------------- |
| `executeCode`   | 执行代码（自动识别语言） | `code`, `language`（可选） |
| `executeFile`   | 执行代码文件             | `filePath`                 |
| `runJavaScript` | 执行 JavaScript 代码     | `code`                     |
| `runPython`     | 执行 Python 代码         | `code`                     |
| `formatCode`    | 格式化代码               | `code`, `language`         |

### 使用示例

```javascript
runJavaScript("console.log('Hello')");
runPython('print(1+2)');
executeFile('./script.py');
formatCode('function test(){return 1}', 'javascript');
```

---

## 安全沙箱工具详解

安全沙箱使用 `isolated-vm` 实现进程级隔离，防止恶意代码访问宿主环境。

### 核心工具

| 工具                      | 说明                 | 参数                      |
| ------------------------- | -------------------- | ------------------------- |
| `createJavaScriptSandbox` | 创建 JavaScript 沙箱 | `options`（可选）         |
| `runJavaScriptSandbox`    | 在沙箱中执行 JS      | `code`, `context`（可选） |
| `runPythonSandbox`        | 在沙箱中执行 Python  | `code`                    |
| `executeCodeSandbox`      | 在沙箱中执行代码     | `code`, `language`        |

### 安全特性

- 内置对象深度冻结
- 禁止访问文件系统和网络
- 禁止访问进程环境
- 代码执行超时限制
- 内存使用限制

---

## Git 工具详解

### 核心工具

| 工具              | 说明           | 参数                         |
| ----------------- | -------------- | ---------------------------- |
| `gitInit`         | 初始化仓库     | `path`（可选）               |
| `gitClone`        | 克隆仓库       | `url`, `path`（可选）        |
| `gitAdd`          | 添加文件       | `files`                      |
| `gitCommit`       | 提交更改       | `message`, `options`（可选） |
| `gitPush`         | 推送到远程     | `remote`, `branch`           |
| `gitPull`         | 拉取远程       | `remote`, `branch`           |
| `gitStatus`       | 查看状态       | 无                           |
| `gitLog`          | 查看日志       | `options`（可选）            |
| `gitBranchCreate` | 创建分支       | `name`                       |
| `gitBranchDelete` | 删除分支       | `name`                       |
| `gitBranchList`   | 列出分支       | 无                           |
| `gitCheckout`     | 切换分支       | `name`                       |
| `gitCheckoutNew`  | 创建并切换分支 | `name`                       |
| `gitMerge`        | 合并分支       | `branch`                     |
| `gitDiff`         | 查看差异       | `options`（可选）            |
| `gitRemoteAdd`    | 添加远程       | `name`, `url`                |
| `gitRemoteList`   | 列出远程       | 无                           |
| `gitConfigUser`   | 配置用户       | `name`, `email`              |
| `gitReset`        | 重置           | `mode`, `target`             |
| `gitStash`        | 暂存           | 无                           |
| `gitStashPop`     | 恢复暂存       | 无                           |

### 使用示例

```javascript
gitInit();
gitAdd('.');
gitCommit('feat: add new feature');
gitPush('origin', 'main');
gitStatus();
```

---

## 任务管理工具详解

### 核心工具

| 工具           | 说明         | 参数                                               |
| -------------- | ------------ | -------------------------------------------------- |
| `createTask`   | 创建任务     | `title`, `description`（可选）, `priority`（可选） |
| `getTasks`     | 获取所有任务 | `status`（可选）                                   |
| `getTask`      | 获取单个任务 | `id`                                               |
| `updateTask`   | 更新任务     | `id`, `data`                                       |
| `deleteTask`   | 删除任务     | `id`                                               |
| `completeTask` | 完成任务     | `id`                                               |
| `splitTask`    | 拆分任务     | `id`, `subTasks`                                   |
| `getTaskStats` | 获取任务统计 | 无                                                 |
| `clearTasks`   | 清除所有任务 | 无                                                 |

### 使用示例

```javascript
createTask('完成项目文档', '编写 README 和架构文档', 'high');
getTasks('pending');
completeTask('task-id-1');
getTaskStats();
```

---

## 记忆系统工具详解

### 核心工具

| 工具                 | 说明         | 参数                      |
| -------------------- | ------------ | ------------------------- |
| `addMemory`          | 添加记忆     | `content`, `tags`（可选） |
| `searchMemory`       | 搜索记忆     | `query`                   |
| `getAllMemories`     | 获取所有记忆 | 无                        |
| `getMemory`          | 获取单个记忆 | `id`                      |
| `updateMemory`       | 更新记忆     | `id`, `data`              |
| `deleteMemory`       | 删除记忆     | `id`                      |
| `getMemoryStats`     | 获取记忆统计 | 无                        |
| `getRelatedMemories` | 获取相关记忆 | `id`                      |
| `clearMemory`        | 清除所有记忆 | 无                        |

### 使用示例

```javascript
addMemory('用户偏好：喜欢简洁的界面设计', ['user', 'preference']);
searchMemory('界面设计');
getRelatedMemories('memory-id');
```

---

## 数据处理工具详解

### 核心工具

| 工具            | 说明           | 参数                     |
| --------------- | -------------- | ------------------------ |
| `readCSV`       | 读取 CSV 文件  | `path`                   |
| `writeCSV`      | 写入 CSV 文件  | `path`, `data`           |
| `readJSON`      | 读取 JSON 文件 | `path`                   |
| `writeJSON`     | 写入 JSON 文件 | `path`, `data`           |
| `csvToJSON`     | CSV 转 JSON    | `csvContent`             |
| `jsonToCSV`     | JSON 转 CSV    | `jsonData`               |
| `queryData`     | 查询数据       | `data`, `query`          |
| `analyzeData`   | 分析数据       | `data`, `options`        |
| `sortData`      | 排序数据       | `data`, `field`, `order` |
| `filterData`    | 过滤数据       | `data`, `condition`      |
| `groupData`     | 分组数据       | `data`, `field`          |
| `aggregateData` | 聚合数据       | `data`, `aggregation`    |

### 使用示例

```javascript
readCSV('data.csv');
writeJSON('output.json', { key: 'value' });
sortData(data, 'date', 'desc');
filterData(data, { status: 'active' });
```

---

## 数据库操作详解

数据库工具支持 SQLite 数据库的创建、查询、插入、更新等操作。

### 核心工具

| 工具                 | 说明              | 参数                     |
| -------------------- | ----------------- | ------------------------ |
| `executeSQL`         | 执行任意 SQL 语句 | `sql`                    |
| `query`              | 执行查询语句      | `sql`, `params`（可选）  |
| `insert`             | 插入数据          | `table`, `data`          |
| `update`             | 更新数据          | `table`, `data`, `where` |
| `deleteData`         | 删除数据          | `table`, `where`         |
| `createTable`        | 创建表            | `tableName`, `schema`    |
| `dropTable`          | 删除表            | `tableName`              |
| `getTables`          | 列出所有表        | 无                       |
| `getTableSchema`     | 获取表结构        | `tableName`              |
| `executeTransaction` | 执行事务          | `statements`             |
| `closeDB`            | 关闭数据库连接    | 无                       |

### 使用示例

```javascript
createTable('users', { id: 'INTEGER PRIMARY KEY', name: 'TEXT' });
insert('users', { name: '张三' });
query('SELECT * FROM users');
update('users', { name: '李四' }, { id: 1 });
deleteData('users', { id: 1 });
getTables();
getTableSchema('users');
executeTransaction([
  { sql: 'UPDATE accounts SET balance = balance - 100 WHERE id = 1' },
  { sql: 'UPDATE accounts SET balance = balance + 100 WHERE id = 2' },
]);
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

| 工具                       | 说明             | 参数                     |
| -------------------------- | ---------------- | ------------------------ |
| `sendEmail`                | 发送邮件         | `options`                |
| `sendTextEmail`            | 发送纯文本邮件   | `to`, `subject`, `body`  |
| `sendHtmlEmail`            | 发送 HTML 邮件   | `to`, `subject`, `html`  |
| `sendTemplateEmail`        | 发送模板邮件     | `to`, `template`, `data` |
| `sendEmailWithAttachments` | 发送带附件的邮件 | `options`, `attachments` |
| `checkEmailConfig`         | 检查邮件配置     | 无                       |

### 使用示例

```javascript
sendTextEmail('user@example.com', '测试邮件', 'Hello');
sendHtmlEmail('user@example.com', 'HTML 邮件', '<h1>Hello</h1>');
```

---

## 系统监控工具详解

### 核心工具

| 工具                | 说明             | 参数               |
| ------------------- | ---------------- | ------------------ |
| `getCPUInfo`        | 获取 CPU 信息    | 无                 |
| `getMemoryInfo`     | 获取内存信息     | 无                 |
| `getDiskInfo`       | 获取磁盘信息     | 无                 |
| `getNetworkInfo`    | 获取网络信息     | 无                 |
| `getProcesses`      | 获取进程列表     | 无                 |
| `getSystemInfo`     | 获取系统信息     | 无                 |
| `getCurrentProcess` | 获取当前进程信息 | 无                 |
| `getSystemLoad`     | 获取系统负载     | 无                 |
| `monitorSystem`     | 监控系统状态     | `interval`（可选） |

### 使用示例

```javascript
getCPUInfo();
getMemoryInfo();
getSystemInfo();
```

---

## 定时任务工具详解

### 核心工具

| 工具                 | 说明              | 参数                      |
| -------------------- | ----------------- | ------------------------- |
| `addScheduleTask`    | 添加定时任务      | `name`, `cron`, `command` |
| `getScheduleTasks`   | 获取所有定时任务  | 无                        |
| `getScheduleTask`    | 获取单个定时任务  | `id`                      |
| `updateScheduleTask` | 更新定时任务      | `id`, `data`              |
| `toggleScheduleTask` | 启用/禁用定时任务 | `id`                      |
| `removeScheduleTask` | 删除定时任务      | `id`                      |
| `startScheduler`     | 启动调度器        | 无                        |
| `stopScheduler`      | 停止调度器        | 无                        |

### 使用示例

```javascript
addScheduleTask('daily-report', '0 9 * * *', 'generateReport()');
getScheduleTasks();
toggleScheduleTask('task-id');
```

---

## 图像文字识别（OCR）详解

OCR 工具基于视觉大模型实现图像文字识别能力，支持常见图片格式的文字提取。

### 核心工具

| 工具       | 说明                 | 参数                   |
| ---------- | -------------------- | ---------------------- |
| `ocr`      | 识别单张图片中的文字 | `imagePath`            |
| `ocrBatch` | 批量识别多张图片文字 | `images`（用逗号分隔） |

### 支持格式

JPEG、PNG、WebP、BMP、GIF

### 使用示例

```javascript
ocr('/path/to/screenshot.png');
ocrBatch('img1.jpg, img2.png, img3.webp');
```

### OCR 配置

```json
{
  "ocr": {
    "provider": "",
    "baseURL": "",
    "apiKey": "",
    "model": "InternVL3-78B"
  }
}
```

---

## 视觉分析（Vision）详解

视觉分析工具基于多模态大模型，支持对图片内容进行描述、理解与问答。

### 核心工具

| 工具            | 说明             | 参数                          |
| --------------- | ---------------- | ----------------------------- |
| `vision`        | 分析本地图片内容 | `imagePath`, `prompt`（可选） |
| `visionFromUrl` | 分析网络图片 URL | `imageUrl`, `prompt`（可选）  |

### 使用示例

```javascript
vision('/path/to/photo.jpg');
vision('ui.png', '请描述这个界面的布局');
visionFromUrl('https://example.com/image.jpg');
```

### Vision 配置

```json
{
  "vision": {
    "baseURL": "",
    "apiKey": "",
    "model": "InternVL3-78B"
  }
}
```

---

## 图像生成（Image Generation）详解

图像生成工具调用 OpenAI 兼容的 `images/generations` 接口，支持文生图与图生图（多图参考），生成结果保存到工作区 `generated-images/` 目录。

> **模型与参数均为「建议值」**
> 下列模型名称、输出尺寸为**建议值**，由图像服务商决定并可能随其版本升级而变更。工具本身不校验模型与尺寸，实际有效性以服务商接口的返回为准；使用默认模型时若传入其不支持的尺寸，工具会在返回结果中提示正确取值。

### 核心工具

| 工具            | 说明                          | 参数                                                                                                                                                                                      |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateImage` | 文生图 / 图生图，结果存工作区 | `prompt`（必填）, `referenceImages`（可选）, `model`（可选，建议 `qwen-image-2.0-pro`）, `size`（可选，见下）, `seed`（可选）, `negativePrompt`（可选）, `watermark`（可选）, `n`（可选） |

### 建议参数

- **建议模型**：`qwen-image-2.0-pro`（以服务商实际支持为准）
- **建议输出尺寸（宽\*高）**：`2048*2048`、`2368*1728`、`2688*1536`、`1728*2368`、`2536*2688`（以服务商实际支持为准；不填默认 `2048*2048`）

### 使用示例

```javascript
// 文生图
generateImage('一只戴草帽的猫坐在窗台上看雨');

// 图生图：以本地图片作为多图参考
generateImage('让图中的猫穿上红色连衣裙', {
  referenceImages: ['cat.png', 'dress.png'],
  size: '2048*2048',
});
```

### Image Generation 配置

```json
{
  "imageGen": {
    "apiKey": "",
    "baseURL": "https://api.moark.com/v1",
    "model": "qwen-image-2.0-pro"
  }
}
```

对应环境变量：`COGITO_IMAGEGEN_API_KEY` / `COGITO_IMAGEGEN_API_BASE_URL` / `COGITO_IMAGEGEN_MODEL`（未配置时依次回退 `models.moark`、主 API 密钥）。

---

## Office 文档工具详解

Office 文档工具支持创建 PPT 演示文稿、Word 文档和 Excel 表格。

### 核心工具

| 工具          | 说明              | 参数                                       |
| ------------- | ----------------- | ------------------------------------------ |
| `createPpt`   | 创建 PPT 演示文稿 | `options` 或 `outputPath, title, content`  |
| `createWord`  | 创建 Word 文档    | `options` 或 `outputPath, title, content`  |
| `createExcel` | 创建 Excel 表格   | `options` 或 `outputPath, sheetName, data` |
| `readExcel`   | 读取 Excel 文件   | `filePath`                                 |

### 使用示例

```javascript
createPpt("data/presentation.pptx", "项目报告", "内容")
createWord({ outputPath: "doc.docx", paragraphs: [...] })
createExcel({ outputPath: "data.xlsx", sheets: [...] })
readExcel("data.xlsx")
```

---

## 应用场景示例

### 文件探索

```javascript
ls('./src');
read('./src/agent/Agent.ts');
```

### 代码执行

```javascript
runPython("print('Hello')");
runJavaScript('console.log([1,2,3].reduce((a,b)=>a+b,0))');
executeFile('./script.py');
```

### Git 版本控制

```javascript
gitStatus();
gitAdd('.');
gitCommit('feat: add feature');
gitPush('origin', 'main');
```

### 数据库操作

```javascript
executeSQL('SELECT * FROM tasks');
insert('tasks', { title: '新任务' });
```

### 联网搜索

```javascript
search('Node.js features');
fetchPage('https://nodejs.org/');
```

### 图像识别与视觉分析

```javascript
ocr('screenshot.png');
vision('photo.jpg', '请描述这张图片');
generateImage('一只戴草帽的猫坐在窗台上看雨');
```

### Office 文档生成

```javascript
createPpt('data/presentation.pptx', '项目汇报', '内容');
createExcel('data/sales.xlsx', '销售', [['产品', '销量']]);
```
