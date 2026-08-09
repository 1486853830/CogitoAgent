# Tool System Guide / 工具系统详解

> Detailed documentation: the tool registration mechanism, usage notes for each tool category, and best practices.
>
> 详细文档：工具注册机制、各分类工具使用说明与最佳实践。

## Tool System / 工具系统

The tool system is managed centrally by `registry.ts`. The model invokes tools directly through **native function calling** (`tool_calls`) according to the JSON Schema declared in `tools`. Arguments are valid JSON, and no text markers are used any more.

工具系统由 `registry.ts` 统一管理。模型通过**原生 function calling**（`tool_calls`）按 `tools` 里的 JSON Schema 直接调用工具，参数为合法 JSON，不再使用任何文本标记。

### Tool Categories / 工具分类

The table below lists every tool category, its source file, and the functions it provides.

下表列出了所有工具分类、对应的源文件以及提供的函数。

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

### Tool Registration / 工具注册机制

Tool functions are registered into a unified registry together with the following metadata.

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

### Tool Call Examples / 工具调用示例

Calls go through native `tool_calls` with a JSON object as the arguments, for example:

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

## File Operation Tools / 文件操作工具详解

### Core Tools / 核心工具

These tools cover the full lifecycle of files and directories: reading, writing, copying, moving, and deleting.

这些工具覆盖文件与目录的完整生命周期：读取、写入、复制、移动和删除。

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

### Usage Examples / 使用示例

The snippet below demonstrates typical file operations.

下面的代码片段演示了典型的文件操作。

```javascript
ls('./src');
read('./src/config.js');
create('notes.txt', 'Hello World');
append('notes.txt', '\nNew line');
copy('notes.txt', 'notes_backup.txt');
mkdir('./data');
```

---

## Path Tools / 路径工具详解

### Core Tools / 核心工具

Path tools help you build, normalize, and parse file system paths in a cross-platform way.

路径工具帮助你以跨平台的方式构建、规范化和解析文件系统路径。

| 工具            | 说明           | 参数       |
| --------------- | -------------- | ---------- |
| `getBasePath`   | 获取基础路径   | 无         |
| `joinPath`      | 拼接路径       | `...paths` |
| `resolvePath`   | 解析绝对路径   | `...paths` |
| `normalizePath` | 规范化路径     | `path`     |
| `getExtension`  | 获取文件扩展名 | `path`     |
| `getFileName`   | 获取文件名     | `path`     |
| `getParentDir`  | 获取父目录     | `path`     |

### Usage Examples / 使用示例

Common path manipulation calls:

常见的路径操作调用：

```javascript
getBasePath();
joinPath('src', 'agent', 'tools');
getExtension('document.pdf');
getFileName('/path/to/file.txt');
```

---

## Browser Automation / 浏览器自动化详解

Browser automation tools are built on Playwright and support page interaction, screenshots, form filling, and more.

浏览器自动化工具基于 Playwright 实现，支持网页交互、截图、表单填写等操作。

### Core Tools / 核心工具

The following tools drive a browser instance from launch to shutdown.

以下工具可以驱动一个浏览器实例，从启动直到关闭。

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

### Usage Examples / 使用示例

A typical automation flow looks like this:

一个典型的自动化流程如下所示：

```javascript
initBrowser();
clickElement('#login-btn');
fillField('#username', 'user');
selectOption('#country', 'China');
takeScreenshot();
getPageContent();
closeBrowser();
```

### Browser Configuration / 浏览器配置

Browser behaviour is controlled by the following configuration block.

浏览器行为由以下配置块控制。

```json
{
  "browser": {
    "type": "chromium",
    "headless": true,
    "timeout": 30000
  }
}
```

### Security Restrictions / 安全限制

- A browser instance lives for at most 5 minutes.
  浏览器实例最多存活 5 分钟。
- Browsers that stay idle for a long time are closed automatically.
  自动关闭长时间未操作的浏览器。
- Access to local file system URLs (file://) is forbidden.
  禁止访问本地文件系统 URL（file://）。
- Screenshots are saved to a temporary directory automatically and cleaned up periodically.
  截图自动保存到临时目录，定期清理。

---

## Code Execution Tools / 代码执行工具详解

### Core Tools / 核心工具

These tools run code snippets or script files and format source code.

这些工具用于运行代码片段或脚本文件，并对源代码进行格式化。

| 工具            | 说明                     | 参数                       |
| --------------- | ------------------------ | -------------------------- |
| `executeCode`   | 执行代码（自动识别语言） | `code`, `language`（可选） |
| `executeFile`   | 执行代码文件             | `filePath`                 |
| `runJavaScript` | 执行 JavaScript 代码     | `code`                     |
| `runPython`     | 执行 Python 代码         | `code`                     |
| `formatCode`    | 格式化代码               | `code`, `language`         |

### Usage Examples / 使用示例

Examples of running code in different languages:

以不同语言运行代码的示例：

```javascript
runJavaScript("console.log('Hello')");
runPython('print(1+2)');
executeFile('./script.py');
formatCode('function test(){return 1}', 'javascript');
```

---

## Secure Sandbox Tools / 安全沙箱工具详解

The secure sandbox uses `isolated-vm` for process-level isolation, preventing malicious code from reaching the host environment.

安全沙箱使用 `isolated-vm` 实现进程级隔离，防止恶意代码访问宿主环境。

### Core Tools / 核心工具

Use these tools to create a sandbox and execute untrusted code inside it.

使用这些工具可以创建沙箱，并在其中执行不受信任的代码。

| 工具                      | 说明                 | 参数                      |
| ------------------------- | -------------------- | ------------------------- |
| `createJavaScriptSandbox` | 创建 JavaScript 沙箱 | `options`（可选）         |
| `runJavaScriptSandbox`    | 在沙箱中执行 JS      | `code`, `context`（可选） |
| `runPythonSandbox`        | 在沙箱中执行 Python  | `code`                    |
| `executeCodeSandbox`      | 在沙箱中执行代码     | `code`, `language`        |

### Security Features / 安全特性

- Built-in objects are deeply frozen.
  内置对象深度冻结。
- File system and network access is forbidden.
  禁止访问文件系统和网络。
- Access to the process environment is forbidden.
  禁止访问进程环境。
- Code execution is subject to a timeout limit.
  代码执行超时限制。
- Memory usage is capped.
  内存使用限制。

---

## Git Tools / Git 工具详解

### Core Tools / 核心工具

The Git tools wrap the common repository, branch, and remote operations.

Git 工具封装了常用的仓库、分支和远程操作。

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

### Usage Examples / 使用示例

A basic commit-and-push workflow:

一个基础的提交并推送流程：

```javascript
gitInit();
gitAdd('.');
gitCommit('feat: add new feature');
gitPush('origin', 'main');
gitStatus();
```

---

## Task Management Tools / 任务管理工具详解

### Core Tools / 核心工具

These tools create, query, update, split, and complete tasks.

这些工具用于创建、查询、更新、拆分和完成任务。

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

### Usage Examples / 使用示例

Typical task management calls:

典型的任务管理调用：

```javascript
createTask('完成项目文档', '编写 README 和架构文档', 'high');
getTasks('pending');
completeTask('task-id-1');
getTaskStats();
```

---

## Memory System Tools / 记忆系统工具详解

### Core Tools / 核心工具

Memory tools store, retrieve, and relate long-term knowledge for the agent.

记忆工具用于为智能体存储、检索和关联长期知识。

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

### Usage Examples / 使用示例

Adding and querying memories:

添加与查询记忆：

```javascript
addMemory('用户偏好：喜欢简洁的界面设计', ['user', 'preference']);
searchMemory('界面设计');
getRelatedMemories('memory-id');
```

---

## Data Processing Tools / 数据处理工具详解

### Core Tools / 核心工具

These tools read and write CSV/JSON files and perform querying, sorting, filtering, grouping, and aggregation.

这些工具用于读写 CSV/JSON 文件，并进行查询、排序、过滤、分组和聚合。

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

### Usage Examples / 使用示例

Reading, writing, and transforming data:

读取、写入与转换数据：

```javascript
readCSV('data.csv');
writeJSON('output.json', { key: 'value' });
sortData(data, 'date', 'desc');
filterData(data, { status: 'active' });
```

---

## Database Operations / 数据库操作详解

The database tools support creating, querying, inserting into, and updating SQLite databases.

数据库工具支持 SQLite 数据库的创建、查询、插入、更新等操作。

### Core Tools / 核心工具

The following tools cover both raw SQL and higher-level helpers.

以下工具既支持原生 SQL，也提供了更高层的辅助方法。

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

### Usage Examples / 使用示例

From table creation to transactions:

从建表到事务的完整示例：

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

### Database Configuration / 数据库配置

The database connection is configured as follows.

数据库连接的配置如下。

```json
{
  "database": {
    "path": "./data/mydb.db",
    "timeout": 5000
  }
}
```

### Security Restrictions / 安全限制

- Only database files inside the workspace can be accessed.
  只能访问工作区内的数据库文件。
- Dangerous operations such as DROP DATABASE are forbidden.
  禁止执行 DROP DATABASE 等危险操作。
- A failed transaction is rolled back automatically.
  事务失败自动回滚。
- Query results return at most 1000 rows.
  查询结果最多返回 1000 行。

---

## Email Tools / 邮件工具详解

### Core Tools / 核心工具

These tools send plain-text, HTML, template-based, and attachment-bearing emails.

这些工具支持发送纯文本、HTML、模板以及带附件的邮件。

| 工具                       | 说明             | 参数                     |
| -------------------------- | ---------------- | ------------------------ |
| `sendEmail`                | 发送邮件         | `options`                |
| `sendTextEmail`            | 发送纯文本邮件   | `to`, `subject`, `body`  |
| `sendHtmlEmail`            | 发送 HTML 邮件   | `to`, `subject`, `html`  |
| `sendTemplateEmail`        | 发送模板邮件     | `to`, `template`, `data` |
| `sendEmailWithAttachments` | 发送带附件的邮件 | `options`, `attachments` |
| `checkEmailConfig`         | 检查邮件配置     | 无                       |

### Usage Examples / 使用示例

Sending text and HTML emails:

发送文本邮件与 HTML 邮件：

```javascript
sendTextEmail('user@example.com', '测试邮件', 'Hello');
sendHtmlEmail('user@example.com', 'HTML 邮件', '<h1>Hello</h1>');
```

---

## System Monitoring Tools / 系统监控工具详解

### Core Tools / 核心工具

These tools report CPU, memory, disk, network, and process information about the host.

这些工具用于获取宿主机的 CPU、内存、磁盘、网络与进程信息。

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

### Usage Examples / 使用示例

Querying basic system metrics:

查询基础的系统指标：

```javascript
getCPUInfo();
getMemoryInfo();
getSystemInfo();
```

---

## Scheduled Task Tools / 定时任务工具详解

### Core Tools / 核心工具

These tools manage cron-based scheduled tasks and control the scheduler itself.

这些工具用于管理基于 cron 的定时任务，并控制调度器本身。

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

### Usage Examples / 使用示例

Registering and toggling a scheduled task:

注册并启用/禁用一个定时任务：

```javascript
addScheduleTask('daily-report', '0 9 * * *', 'generateReport()');
getScheduleTasks();
toggleScheduleTask('task-id');
```

---

## Optical Character Recognition (OCR) / 图像文字识别（OCR）详解

The OCR tools use a large vision model to recognize text in images and support text extraction from common image formats.

OCR 工具基于视觉大模型实现图像文字识别能力，支持常见图片格式的文字提取。

### Core Tools / 核心工具

One tool handles a single image, the other handles a batch.

其中一个工具处理单张图片，另一个用于批量处理。

| 工具       | 说明                 | 参数                   |
| ---------- | -------------------- | ---------------------- |
| `ocr`      | 识别单张图片中的文字 | `imagePath`            |
| `ocrBatch` | 批量识别多张图片文字 | `images`（用逗号分隔） |

### Supported Formats / 支持格式

The following image formats are supported.

支持以下图片格式。

JPEG、PNG、WebP、BMP、GIF

### Usage Examples / 使用示例

Recognizing a single image and a batch of images:

识别单张图片与批量识别图片：

```javascript
ocr('/path/to/screenshot.png');
ocrBatch('img1.jpg, img2.png, img3.webp');
```

### OCR Configuration / OCR 配置

The OCR provider and model are configured as follows.

OCR 服务商与模型的配置如下。

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

## Vision Analysis / 视觉分析（Vision）详解

The vision analysis tools are built on a multimodal large model and support describing, understanding, and answering questions about image content.

视觉分析工具基于多模态大模型，支持对图片内容进行描述、理解与问答。

### Core Tools / 核心工具

One tool analyzes a local image, the other analyzes an image URL.

其中一个工具分析本地图片，另一个分析网络图片 URL。

| 工具            | 说明             | 参数                          |
| --------------- | ---------------- | ----------------------------- |
| `vision`        | 分析本地图片内容 | `imagePath`, `prompt`（可选） |
| `visionFromUrl` | 分析网络图片 URL | `imageUrl`, `prompt`（可选）  |

### Usage Examples / 使用示例

Analyzing images with or without a custom prompt:

在带或不带自定义提示词的情况下分析图片：

```javascript
vision('/path/to/photo.jpg');
vision('ui.png', '请描述这个界面的布局');
visionFromUrl('https://example.com/image.jpg');
```

### Vision Configuration / Vision 配置

The vision endpoint and model are configured as follows.

视觉服务的接口地址与模型配置如下。

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

## Image Generation / 图像生成（Image Generation）详解

The image generation tool calls the OpenAI-compatible `images/generations` endpoint. It supports text-to-image and image-to-image (with multiple reference images), and saves the results to the `generated-images/` directory in the workspace.

图像生成工具调用 OpenAI 兼容的 `images/generations` 接口，支持文生图与图生图（多图参考），生成结果保存到工作区 `generated-images/` 目录。

> **The model and parameters are "suggested values"**
> The model names and output sizes listed below are **suggested values**. They are determined by the image service provider and may change as the provider upgrades its versions. The tool itself does not validate the model or the size; actual validity depends on what the provider's API returns. When using the default model, if you pass a size it does not support, the tool will indicate the correct values in its result.
>
> **模型与参数均为「建议值」**
> 下列模型名称、输出尺寸为**建议值**，由图像服务商决定并可能随其版本升级而变更。工具本身不校验模型与尺寸，实际有效性以服务商接口的返回为准；使用默认模型时若传入其不支持的尺寸，工具会在返回结果中提示正确取值。

### Core Tools / 核心工具

A single tool covers both text-to-image and image-to-image generation.

单个工具即可覆盖文生图与图生图两种生成方式。

| 工具            | 说明                          | 参数                                                                                                                                                                                      |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateImage` | 文生图 / 图生图，结果存工作区 | `prompt`（必填）, `referenceImages`（可选）, `model`（可选，建议 `qwen-image-2.0-pro`）, `size`（可选，见下）, `seed`（可选）, `negativePrompt`（可选）, `watermark`（可选）, `n`（可选） |

### Suggested Parameters / 建议参数

- **Suggested model**: `qwen-image-2.0-pro` (subject to what the provider actually supports).
  **建议模型**：`qwen-image-2.0-pro`（以服务商实际支持为准）。
- **Suggested output sizes (width\*height)**: `2048*2048`, `2368*1728`, `2688*1536`, `1728*2368`, `2536*2688` (subject to what the provider actually supports; defaults to `2048*2048` when omitted).
  **建议输出尺寸（宽\*高）**：`2048*2048`、`2368*1728`、`2688*1536`、`1728*2368`、`2536*2688`（以服务商实际支持为准；不填默认 `2048*2048`）。

### Usage Examples / 使用示例

The examples below show text-to-image generation and image-to-image generation with local reference images.

下面的示例展示了文生图，以及使用本地参考图的图生图。

```javascript
// 文生图
generateImage('一只戴草帽的猫坐在窗台上看雨');

// 图生图：以本地图片作为多图参考
generateImage('让图中的猫穿上红色连衣裙', {
  referenceImages: ['cat.png', 'dress.png'],
  size: '2048*2048',
});
```

### Image Generation Configuration / Image Generation 配置

The image generation endpoint and model are configured as follows.

图像生成的接口地址与模型配置如下。

```json
{
  "imageGen": {
    "apiKey": "",
    "baseURL": "https://api.moark.com/v1",
    "model": "qwen-image-2.0-pro"
  }
}
```

The corresponding environment variables are `COGITO_IMAGEGEN_API_KEY` / `COGITO_IMAGEGEN_API_BASE_URL` / `COGITO_IMAGEGEN_MODEL`. When they are not configured, the tool falls back to `models.moark` and then to the main API key, in that order.

对应环境变量：`COGITO_IMAGEGEN_API_KEY` / `COGITO_IMAGEGEN_API_BASE_URL` / `COGITO_IMAGEGEN_MODEL`（未配置时依次回退 `models.moark`、主 API 密钥）。

---

## Office Document Tools / Office 文档工具详解

The Office document tools support creating PowerPoint presentations, Word documents, and Excel spreadsheets.

Office 文档工具支持创建 PPT 演示文稿、Word 文档和 Excel 表格。

### Core Tools / 核心工具

Each tool accepts either an options object or positional arguments.

每个工具既可以接收 options 对象，也可以接收位置参数。

| 工具          | 说明              | 参数                                       |
| ------------- | ----------------- | ------------------------------------------ |
| `createPpt`   | 创建 PPT 演示文稿 | `options` 或 `outputPath, title, content`  |
| `createWord`  | 创建 Word 文档    | `options` 或 `outputPath, title, content`  |
| `createExcel` | 创建 Excel 表格   | `options` 或 `outputPath, sheetName, data` |
| `readExcel`   | 读取 Excel 文件   | `filePath`                                 |

### Usage Examples / 使用示例

Creating and reading Office documents:

创建与读取 Office 文档：

```javascript
createPpt("data/presentation.pptx", "项目报告", "内容")
createWord({ outputPath: "doc.docx", paragraphs: [...] })
createExcel({ outputPath: "data.xlsx", sheets: [...] })
readExcel("data.xlsx")
```

---

## Use Case Examples / 应用场景示例

### File Exploration / 文件探索

Browse a directory and read a source file.

浏览目录并读取源文件。

```javascript
ls('./src');
read('./src/agent/Agent.ts');
```

### Code Execution / 代码执行

Run snippets and script files in different languages.

以不同语言运行代码片段和脚本文件。

```javascript
runPython("print('Hello')");
runJavaScript('console.log([1,2,3].reduce((a,b)=>a+b,0))');
executeFile('./script.py');
```

### Git Version Control / Git 版本控制

Stage, commit, and push changes.

暂存、提交并推送变更。

```javascript
gitStatus();
gitAdd('.');
gitCommit('feat: add feature');
gitPush('origin', 'main');
```

### Database Operations / 数据库操作

Query and insert records.

查询与插入记录。

```javascript
executeSQL('SELECT * FROM tasks');
insert('tasks', { title: '新任务' });
```

### Web Search / 联网搜索

Search the web and fetch a page.

进行网络搜索并抓取页面。

```javascript
search('Node.js features');
fetchPage('https://nodejs.org/');
```

### OCR and Vision Analysis / 图像识别与视觉分析

Recognize text, analyze an image, and generate a new one.

识别文字、分析图片并生成新图片。

```javascript
ocr('screenshot.png');
vision('photo.jpg', '请描述这张图片');
generateImage('一只戴草帽的猫坐在窗台上看雨');
```

### Office Document Generation / Office 文档生成

Generate a presentation and a spreadsheet.

生成演示文稿和电子表格。

```javascript
createPpt('data/presentation.pptx', '项目汇报', '内容');
createExcel('data/sales.xlsx', '销售', [['产品', '销量']]);
```
