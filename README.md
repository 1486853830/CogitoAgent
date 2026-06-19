# CogitoAgent

> 持续思考的本地自主 AI 智能体

CogitoAgent 是一款运行于本地的自主 AI 智能体，融合了文件管理、知识挖掘、系统操作、代码执行与联网能力。它直接在用户配置的工作目录下运行，无需上传任何文件至第三方服务器，在保障数据隐私安全的同时，提供持续运转的智能助理服务。

不同于传统的聊天机器人，CogitoAgent 具备**持续思考**、**自主探索**、**工具执行**的能力，能够在后台主动发现和整理用户的本地文件资产，并可通过扩展工具集获得更多能力。

![](introduction/main.png)

![](introduction/desktop.png)

***

## 🎯 核心特性

| 特性         | 描述                               | 状态 |
| ---------- | -------------------------------- | -- |
| **持续思考**   | 每3秒自动触发思考，无需用户干预                 | ✅  |
| **本地运行**   | 所有数据存储在本地，保护隐私                   | ✅  |
| **跨平台支持**  | 支持 Windows、Linux、macOS           | ✅  |
| **多模型支持**  | 支持 OpenAI、Moark、Anthropic、Google | ✅  |
| **丰富工具集**  | 12+ 工具模块，235+ 工具函数               | ✅  |
| **记忆系统**   | 期记忆存储与智能检索                       | ✅  |
| **任务管理**   | 任务创建、分解、追踪与统计                    | ✅  |
| **代码执行**   | 支持 JavaScript 和 Python（沙箱安全执行）   | ✅  |
| **Git 集成** | 完整的版本控制操作                        | ✅  |
| **定时任务**   | Cron 风格定时任务调度                    | ✅  |
| **动态工具注册** | 灵活的插件式工具系统                       | ✅  |
| **危险操作确认** | 关键操作需要用户确认                       | ✅  |
| **环境变量管理** | 支持 .env 配置敏感信息                   | ✅  |
| **多会话管理**  | 支持多个独立对话会话                       | ✅  |
| **完整测试覆盖** | 103+ 单元测试和集成测试                   | ✅  |
| **桌面模式**   | Electron 半透明桌面覆盖层，虚拟人物视频    | ✅  |

***

## 🚀 快速开始

### 环境要求

- **Node.js** 18.0 或更高版本
- **npm** 或 **yarn** 包管理器
- **Python** 3.x（可选，用于 Python 代码执行）

### 安装步骤

```bash
# 克隆项目
git clone https://gitee.com/cnt-code/cogito-agent.git
cd cogito-agent

# 安装依赖
npm install

# 启动程序
npm start
```

### 首次配置

首次运行会自动引导完成以下配置：

1. **API Base URL** - 支持 OpenAI 兼容的第三方 API
2. **API Key** - 您的 API 密钥
3. **模型名称** - 如 gpt-4o、claude-3-sonnet 等
4. **工作区路径** - AI 可以访问的目录（默认为用户主目录）
5. **人设选择** - 选择预设的 AI 人设

### 日常使用

**终端模式**（原有方式）：

```bash
npm start
```

启动后：

- **ENTER** — 打断当前思考，输入指令
- **指令 + ENTER** — 发送消息给 AI
- **exit** — 退出程序

**桌面模式**（Electron 半透明窗口）：

```bash
npm run desktop
```

桌面模式特性：

- 半透明毛玻璃对话框，嵌入桌面背景
- 虚拟人物视频（待机/思考/说话三种状态）
- Markdown 渲染支持
- 工具调用内容自动过滤，只显示纯文本回复
- 发送按钮可打断 AI 思考

> ⚠️ 桌面模式需要先启动终端模式（`npm start`），再启动 Electron（`npm run desktop`），两者通过 WebSocket 通信同步。

### 视频素材

将以下视频文件放入 `electron/assets/` 目录：

| 文件名 | 状态 | 说明 |
|--------|------|------|
| `idle.mp4` | 待机 | AI 等待用户输入时播放 |
| `thinking.mp4` | 思考 | AI 正在处理请求时播放 |
| `speaking.mp4` | 说话 | AI 正在输出回复时播放 |

> 💡 目前支持单视频模式，只需放入一个视频文件即可。

### 会话管理命令

CogitoAgent 支持多会话管理，可以同时进行多个独立的对话：

```bash
/sessions       # 查看所有会话列表
/new            # 创建新会话
/switch <id>    # 切换到指定会话
/delete <id>    # 删除指定会话
/rename <name>  # 重命名当前会话
```

***

## 📁 项目结构

```
CogitoAgent/
├── src/                              # 源代码目录
│   ├── agent/                        # 智能体核心模块
│   │   ├── Agent.js                  # 核心智能体（状态机委托给 state.js）
│   │   ├── state.js                  # 状态机模块（THINKING/AWAITING_INPUT/AWAITING_CONFIRMATION）
│   │   ├── registry.js               # 工具注册表（100+ 工具管理）
│   │   ├── commands.js               # 命令处理（/help、/status 等特殊命令）
│   │   ├── session.js                # 多会话管理模块
│   │   ├── prompt.js                 # 对话历史与上下文管理（备份）
│   │   ├── mcp.js                    # MCP 协议服务器（供其他 AI 客户端调用）
│   │   ├── plugin.js                 # 插件管理器（动态加载自定义工具）
│   │   ├── retry.js                  # 熔断器与重试机制
│   │   ├── tracing.js                # 轻量追踪模块（工具执行、LLM 调用记录）
│   │   └── tools/                    # 工具集（13个模块）
│   │       ├── index.js              # 工具统一导出入口
│   │       ├── path.js               # 工作区路径工具
│   │       ├── file.js               # 文件操作工具
│   │       ├── web.js                # 网页相关工具
│   │       ├── browser.js            # 浏览器自动化（Playwright）
│   │       ├── system.js             # 系统操作工具
│   │       ├── code.js               # 代码执行引擎（JS/Python）
│   │       ├── sandbox.js            # 沙箱安全执行（Object.freeze 保护）
│   │       ├── git.js                # Git 版本控制
│   │       ├── task.js               # 任务管理系统
│   │       ├── memory.js             # 记忆系统
│   │       ├── data.js               # 数据处理工具（CSV/JSON）
│   │       ├── db.js                 # SQLite 数据库操作
│   │       ├── email.js              # 邮件功能
│   │       ├── monitor.js            # 系统监控
│   │       ├── scheduler.js          # 定时任务调度
│   │       ├── storage.js            # 持久化存储工具
│   │       └── TOOL_DEVELOPMENT.md   # 工具开发文档
│   ├── api/                          # API 层
│   │   ├── client.js                 # OpenAI 兼容 API 客户端
│   │   ├── webSearch.js              # 联网搜索模块
│   │   └── models.js                 # 多模型支持
│   ├── io/                           # 输入输出模块
│   │   ├── terminal.js               # 终端 UI 与彩色输出
│   │   └── logger.js                 # 日志管理（DEBUG/INFO/WARN/ERROR 分级）
│   ├── config.js                     # 配置管理（环境变量、配置合并）
│   ├── setup.js                      # 首次运行引导（API配置、工作区设置）
│   └── index.js                      # 应用入口
├── electron/                         # Electron 桌面模式
│   ├── main.js                       # Electron 主进程（透明窗口）
│   ├── preload.cjs                   # IPC 安全桥接
│   ├── agent-bridge.js               # WebSocket 客户端（连接终端 Agent）
│   ├── assets/                       # 视频素材目录
│   │   └── *.mp4                     # 人物视频（idle/thinking/speaking）
│   └── desktop/                      # 桌面 UI
│       ├── index.html                # 布局（人物 + 对话框）
│       ├── style.css                 # 毛玻璃样式 + Markdown 渲染
│       └── renderer.js               # 前端交互逻辑
├── personas/                         # 预设人设包（13种）
│   ├── explorer.md                   # 探索者 - 文件探索、项目理解
│   ├── scholar.md                    # 学者 - 知识研究、深度分析
│   ├── assistant.md                  # 助手 - 日常任务、生活助手
│   ├── creative.md                   # 创意家 - 写作、创意生成
│   ├── critic.md                     # 评论家 - 代码审查、建议改进
│   ├── teacher.md                    # 教师 - 教学、知识讲解
│   ├── wenchen.md                    # 文人 - 文学创作、诗词歌赋
│   ├── wujiang.md                    # 武将 - 决策果断、执行力强
│   ├── yingwei.md                    # 英伟 - 领导者、战略规划
│   ├── zhanshi.md                    # 战士 - 解决问题、克服困难
│   ├── moushi.md                     # 谋士 - 策略分析、规划
│   ├── jianguan.md                   # 监管 - 质量把控、流程管理
│   └── xiake.md                      # 侠客 - 自由探索、不拘一格
├── tests/                            # 测试文件目录
│   ├── Agent.test.js                 # 智能体核心测试
│   ├── config.test.js                # 配置管理测试
│   ├── parseArgs.test.js             # 参数解析测试
│   ├── git.test.js                   # Git 操作测试
│   ├── code.test.js                  # 代码执行沙箱测试
│   ├── db.test.js                    # 数据库操作测试
│   ├── web.test.js                   # Web 模块测试
│   ├── browser.test.js               # Playwright 生命周期测试
│   └── storage.test.js               # 存储工具测试
├── data/                             # 运行时数据存储目录（自动创建）
│   ├── sessions/                     # 会话存储目录
│   │   ├── meta.json                 # 会话元数据索引
│   │   ├── sess_xxx.json             # 各会话历史数据
│   │   └── sess_xxx_archive.json     # 会话归档文件
│   └── store/                        # 记忆/任务/定时任务存储
├── introduction/                     # 项目介绍资源
│   ├── main.png                      # 主界面截图
│   ├── file.png                      # 文件操作演示
│   ├── web.png                       # 网页工具演示
│   ├── system.png                    # 系统操作演示
│   └── index.html                    # 介绍页面
├── .env.example                      # 环境变量示例
├── .gitignore                        # Git 忽略配置
├── LICENSE                           # Apache 2.0 许可证
├── jest.config.mjs                   # Jest 测试配置
├── package.json                      # 项目依赖配置
├── config.json                       # 用户配置（运行时生成）
├── persona.md                        # 当前人设配置（运行时生成）
└── README.md                         # 项目说明文档
```

***

## 🛠️ 工具列表详解

### 1. 文件操作工具

提供基础的文件系统操作能力。

| 工具                      | 参数                        | 功能描述              |
| ----------------------- | ------------------------- | ----------------- |
| `ls(path)`              | path: 目录路径（可选）            | 列出目录内容            |
| `read(path)`            | path: 文件路径                | 读取文件内容（自动检测二进制文件） |
| `copy(src, dest)`       | src: 源路径, dest: 目标路径      | 复制文件或目录           |
| `mkdir(path)`           | path: 目录路径                | 创建文件夹（支持递归创建）     |
| `create(path, content)` | path: 文件路径, content: 文件内容 | 创建新文件             |

### 2. 网页工具

提供联网搜索和网页抓取能力。

| 工具                              | 参数                       | 功能描述                        |
| ------------------------------- | ------------------------ | --------------------------- |
| `search(query)`                 | query: 搜索关键词             | 联网搜索，获取最新信息摘要               |
| `browse(url)`                   | url: 网址                  | 在默认浏览器中打开指定网址               |
| `fetchPage(url)`                | url: 网页地址                | 抓取静态网页正文，提取标题、段落和链接         |
| `searchOnEngine(query, engine)` | query: 搜索词, engine: 搜索引擎 | 指定搜索引擎搜索（baidu/google/bing） |

### 3. 浏览器自动化

基于 Playwright 的浏览器自动化能力。

| 工具                              | 参数                            | 功能描述        |
| ------------------------------- | ----------------------------- | ----------- |
| `initBrowser(url)`              | url: 初始网址                     | 初始化浏览器并打开网页 |
| `clickElement(selector, index)` | selector: CSS选择器, index: 元素索引 | 点击网页元素      |
| `fillField(selector, value)`    | selector: CSS选择器, value: 输入值  | 填写表单字段      |
| `selectOption(selector, value)` | selector: CSS选择器, value: 选项值  | 选择下拉框选项     |
| `getPageContent()`              | 无                             | 获取当前页面内容    |
| `takeScreenshot(path)`          | path: 保存路径                    | 截图当前页面      |
| `closeBrowser()`                | 无                             | 关闭浏览器       |

### 4. 系统操作

提供系统级别的操作能力。

| 工具               | 参数         | 功能描述           |
| ---------------- | ---------- | -------------- |
| `listApps()`     | 无          | 列出当前电脑已安装的所有软件 |
| `openApp(name)`  | name: 软件名称 | 通过名称打开指定软件     |
| `closeApp(name)` | name: 软件名称 | 关闭正在运行的指定软件    |

### 5. 代码执行引擎

支持 JavaScript 和 Python 代码执行，带超时保护和沙箱隔离。

| 工具                                | 参数                                  | 功能描述                      |
| --------------------------------- | ----------------------------------- | ------------------------- |
| `executeCode(code, language)`     | code: 代码内容, language: 语言（js/python） | 执行代码（自动识别语言）              |
| `executeFile(filepath, language)` | filepath: 文件路径, language: 语言（可选）    | 执行代码文件                    |
| `runJavaScript(code)`             | code: JavaScript 代码                 | 执行 JavaScript 代码          |
| `runPython(code)`                 | code: Python 代码                     | 执行 Python 代码（通过临时文件方式，安全） |

**安全特性：**

- 代码执行超时限制（30秒）
- 输出大小限制（100KB）
- **JavaScript 代码通过 `isolated-vm` 库提供进程级隔离**，比原生 `vm` 模块更安全
- 内存使用限制（128MB），防止内存耗尽攻击
- 禁止 `eval`、`Function`、`Proxy`、`process`、`require` 等危险对象
- Python 代码通过临时文件执行，防止命令注入
- 沙箱环境禁止访问文件系统、网络等危险操作
- 临时文件超时自动清理
- 支持优雅降级到原生 `vm` 模块（当 `isolated-vm` 不可用时）

### 6. Git 版本控制

完整的 Git 操作支持。

| 工具                              | 参数                                   | 功能描述         |
| ------------------------------- | ------------------------------------ | ------------ |
| `gitInit(path)`                 | path: 目录路径                           | 初始化 Git 仓库   |
| `gitClone(url, dest, branch)`   | url: 仓库地址, dest: 目标目录, branch: 分支    | 克隆仓库         |
| `gitAdd(files, path)`           | files: 文件列表, path: 工作目录              | 添加文件到暂存区     |
| `gitCommit(message, path)`      | message: 提交信息, path: 工作目录            | 提交变更（安全参数传递） |
| `gitPush(remote, branch, path)` | remote: 远程名称, branch: 分支, path: 工作目录 | 推送变更到远程      |
| `gitPull(remote, branch, path)` | remote: 远程名称, branch: 分支, path: 工作目录 | 拉取远程变更       |
| `gitStatus(path)`               | path: 工作目录                           | 查看仓库状态       |
| `gitLog(path, options)`         | path: 工作目录, options: 日志选项            | 查看提交日志       |
| `gitCheckout(branch, path)`     | branch: 分支名, path: 工作目录              | 切换分支         |
| `gitBranchCreate(name, path)`   | name: 分支名, path: 工作目录                | 创建新分支        |
| `gitBranchDelete(name, path)`   | name: 分支名, path: 工作目录                | 删除分支         |
| `gitBranchList(path)`           | path: 工作目录                           | 列出所有分支       |
| `gitMerge(branch, path)`        | branch: 分支名, path: 工作目录              | 合并分支         |
| `gitDiff(options, path)`        | options: 选项, path: 工作目录              | 查看差异         |
| `gitStash(path)`                | path: 工作目录                           | 暂存当前修改       |
| `gitStashPop(path)`             | path: 工作目录                           | 恢复暂存的修改      |

**安全特性：**

- 使用 `execFile` 替代 `exec`，参数通过数组传递
- 防止命令注入攻击
- **危险操作确认机制**：push、代码执行等高风险操作需要用户手动确认

### 7. 任务管理系统

任务创建、分解、追踪和统计。

| 工具                                                   | 参数                                                           | 功能描述     |
| ---------------------------------------------------- | ------------------------------------------------------------ | -------- |
| `createTask(title, description, priority, parentId)` | title: 任务标题, description: 描述, priority: 优先级, parentId: 父任务ID | 创建任务     |
| `getTasks()`                                         | 无                                                            | 获取所有任务列表 |
| `getTask(id)`                                        | id: 任务ID                                                     | 获取单个任务详情 |
| `updateTask(id, updates)`                            | id: 任务ID, updates: 更新内容                                      | 更新任务信息   |
| `deleteTask(id)`                                     | id: 任务ID                                                     | 删除任务     |
| `completeTask(id)`                                   | id: 任务ID                                                     | 标记任务完成   |
| `splitTask(id, subtasks)`                            | id: 任务ID, subtasks: 子任务数组                                    | 分解任务为子任务 |
| `getTaskStats()`                                     | 无                                                            | 获取任务统计信息 |

**数据持久化：**

- 任务存储在 `data/tasks.json`
- 支持子任务层级关系
- 支持优先级排序（high/middle/low）

### 8. 记忆系统

长期记忆存储，支持标签和智能搜索。

| 工具                                   | 参数                                       | 功能描述       |
| ------------------------------------ | ---------------------------------------- | ---------- |
| `addMemory(content, tags, metadata)` | content: 记忆内容, tags: 标签数组, metadata: 元数据 | 添加记忆       |
| `searchMemory(query, limit)`         | query: 搜索关键词, limit: 返回数量                | 搜索记忆（模糊匹配） |
| `getAllMemories(limit)`              | limit: 返回数量                              | 获取所有记忆     |
| `getMemory(id)`                      | id: 记忆ID                                 | 获取记忆详情     |
| `updateMemory(id, updates)`          | id: 记忆ID, updates: 更新内容                  | 更新记忆       |
| `deleteMemory(id)`                   | id: 记忆ID                                 | 删除记忆       |
| `getMemoryStats()`                   | 无                                        | 获取记忆统计信息   |

**特性：**

- 记忆评分机制，自动计算相关性
- 支持标签分类
- 数据持久化存储

### 9. 数据处理工具

CSV/JSON 文件读写、转换和分析。

| 工具                                  | 参数                                      | 功能描述       |
| ----------------------------------- | --------------------------------------- | ---------- |
| `readCSV(filepath)`                 | filepath: 文件路径                          | 读取 CSV 文件  |
| `writeCSV(filepath, data, headers)` | filepath: 文件路径, data: 数据数组, headers: 表头 | 写入 CSV 文件  |
| `readJSON(filepath)`                | filepath: 文件路径                          | 读取 JSON 文件 |
| `writeJSON(filepath, data)`         | filepath: 文件路径, data: JSON数据            | 写入 JSON 文件 |
| `csvToJSON(csvPath, jsonPath)`      | csvPath: 源CSV, jsonPath: 目标JSON         | CSV 转 JSON |
| `jsonToCSV(jsonPath, csvPath)`      | jsonPath: 源JSON, csvPath: 目标CSV         | JSON 转 CSV |
| `queryData(data, conditions)`       | data: 数据数组, conditions: 查询条件            | 查询数据       |
| `analyzeData(data)`                 | data: 数据数组                              | 数据分析（统计信息） |
| `sortData(data, field, order)`      | data: 数据数组, field: 字段名, order: 排序方式     | 数据排序       |

### 10. 数据库操作

SQLite 数据库操作，支持 SQL 和 ORM 风格。

| 工具                             | 参数                                  | 功能描述      |
| ------------------------------ | ----------------------------------- | --------- |
| `executeSQL(sql, params)`      | sql: SQL语句, params: 参数数组            | 执行 SQL 语句 |
| `query(table, where, options)` | table: 表名, where: 查询条件, options: 选项 | 查询数据      |
| `insert(table, data)`          | table: 表名, data: 数据对象               | 插入数据      |
| `update(table, data, where)`   | table: 表名, data: 更新数据, where: 条件    | 更新数据      |
| `deleteData(table, where)`     | table: 表名, where: 删除条件              | 删除数据      |
| `createTable(table, schema)`   | table: 表名, schema: 表结构              | 创建表       |
| `dropTable(table)`             | table: 表名                           | 删除表       |
| `getTables()`                  | 无                                   | 获取所有表列表   |
| `getTableSchema(table)`        | table: 表名                           | 获取表结构信息   |

### 11. 邮件功能

SMTP 邮件发送，支持多种格式。

| 工具                                               | 参数                                           | 功能描述       |
| ------------------------------------------------ | -------------------------------------------- | ---------- |
| `sendEmail(to, subject, body, options)`          | to: 收件人, subject: 主题, body: 内容, options: 选项  | 发送邮件       |
| `sendTextEmail(to, subject, text)`               | to: 收件人, subject: 主题, text: 文本内容             | 发送文本邮件     |
| `sendHtmlEmail(to, subject, html)`               | to: 收件人, subject: 主题, html: HTML内容           | 发送 HTML 邮件 |
| `sendTemplateEmail(to, subject, template, data)` | to: 收件人, subject: 主题, template: 模板, data: 数据 | 发送模板邮件     |
| `checkEmailConfig()`                             | 无                                            | 检查邮件配置是否有效 |

### 12. 系统监控

系统资源监控能力。

| 工具                 | 参数 | 功能描述                 |
| ------------------ | -- | -------------------- |
| `getCPUInfo()`     | 无  | 获取 CPU 信息（核心数、型号等）   |
| `getMemoryInfo()`  | 无  | 获取内存信息（总量、已用、可用）     |
| `getDiskInfo()`    | 无  | 获取磁盘信息（分区、容量、使用率）    |
| `getNetworkInfo()` | 无  | 获取网络接口信息             |
| `getProcesses()`   | 无  | 获取当前运行进程列表           |
| `getSystemInfo()`  | 无  | 获取系统基本信息（OS、版本、架构）   |
| `getSystemLoad()`  | 无  | 获取系统负载（CPU使用率、内存使用率） |
| `monitorSystem()`  | 无  | 综合监控系统资源             |

### 13. 定时任务调度

Cron 风格定时任务调度。

| 工具                                              | 参数                                                   | 功能描述      |
| ----------------------------------------------- | ---------------------------------------------------- | --------- |
| `addScheduleTask(name, cron, command, options)` | name: 任务名, cron: cron表达式, command: 执行命令, options: 选项 | 添加定时任务    |
| `getScheduleTasks()`                            | 无                                                    | 获取所有定时任务  |
| `updateScheduleTask(id, updates)`               | id: 任务ID, updates: 更新内容                              | 更新定时任务    |
| `toggleScheduleTask(id)`                        | id: 任务ID                                             | 启用/禁用定时任务 |
| `removeScheduleTask(id)`                        | id: 任务ID                                             | 删除定时任务    |

***

## 🏗️ 架构设计

### 核心组件说明

| 组件                     | 职责      | 说明                                                                    |
| ---------------------- | ------- | --------------------------------------------------------------------- |
| **StateMachine**       | 状态管理    | 独立 state.js 模块，管理 THINKING / AWAITING\_INPUT / AWAITING\_CONFIRMATION |
| **ThinkLoop**          | 思考循环    | 每3秒自动触发一次思考                                                           |
| **PromptMgr**          | 上下文管理   | 管理对话历史，自动压缩超过150轮的对话                                                  |
| **SessionManager**     | 会话管理    | 支持多会话切换、创建、删除、重命名                                                     |
| **Multi-Model Client** | API 客户端 | 支持多提供商切换，统一接口                                                         |
| **ToolRegistry**       | 动态工具注册  | 独立 registry.js 模块，100+ 工具集中管理                                         |
| **CommandHandler**     | 命令处理    | 独立 commands.js 模块，处理 /help、/status 等特殊命令                              |
| **Sandbox**            | 代码沙箱    | Node.js 原生 vm 模块，Object.create(null) + Object.freeze 防护               |
| **Logger**             | 日志管理    | 独立 logger.js 模块，DEBUG/INFO/WARN/ERROR 分级输出                            |
| **EnvManager**         | 环境变量管理  | 通过 .env 文件管理敏感配置                                                      |
| **ConfirmGate**        | 危险操作确认  | git push、代码执行等高风险操作需用户确认                                              |

***

## 💡 应用场景

### 1. 代码助手

```
用户：帮我写一个 Python 脚本，计算斐波那契数列前20项
AI：好的，我来帮你编写并执行这个脚本。
[TOOL] runPython("def fibonacci(n):...") [/TOOL]
执行结果：[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181]
```

### 2. 项目管理

```
用户：帮我初始化一个 Git 仓库并提交代码
AI：好的，我来帮你完成。
[TOOL] gitInit("./my-project") [/TOOL]
[TOOL] gitAdd(".") [/TOOL]
[TOOL] gitCommit("Initial commit") [/TOOL]
```

### 3. 任务追踪

```
用户：创建一个任务，完成项目文档编写
AI：好的，已创建任务。
[TOOL] createTask("编写项目文档", "完成 README 和技术文档", "high") [/TOOL]
任务创建成功，ID: task_123
```

### 4. 知识管理

```
用户：记住这个重要的会议时间：下周一上午9点
AI：好的，已添加到记忆中。
[TOOL] addMemory("会议时间：下周一上午9点", ["会议", "时间"], {"date": "2024-01-15"}) [/TOOL]
```

***

## ⚙️ 配置说明

配置文件 `config.json` 支持以下选项：

```json
{
  "api": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "your-api-key",
    "model": "gpt-4o"
  },
  "workspace": "./",
  "persona": "explorer",
  "thinkingInterval": 3000,
  "database": {
    "path": "./data/example.db"
  },
  "email": {
    "smtpHost": "smtp.example.com",
    "smtpPort": 587
  },
  "code": {
    "maxExecutionTime": 30000,
    "maxOutputSize": 100000
  },
  "tools": {
    "enabledCategories": ["file", "web", "code", "git", "task", "memory", "data"]
  }
}
```

### 环境变量支持

除了 `config.json`，CogitoAgent 还支持通过 `.env` 文件管理敏感配置：

```bash
# .env 文件示例
COGITO_API_KEY=your-api-key-here
COGITO_API_BASE_URL=https://api.openai.com/v1
COGITO_MODEL=gpt-4o
COGITO_WORKSPACE=/home/user/projects
COGITO_EMAIL_PASSWORD=your-email-password
```

**优势：**

- 敏感信息与代码分离，提高安全性
- 避免配置文件中的明文密码
- 支持多环境配置切换

### 工具分类配置

CogitoAgent 支持按需加载工具分类，减少 Token 消耗：

```json
"tools": {
  "enabledCategories": ["file", "web", "code", "git", "task", "memory", "data"]
}
```

**可用分类：**

| 分类          | 说明                                          |
| ----------- | ------------------------------------------- |
| `file`      | 文件操作（ls, read, copy, mkdir, create）         |
| `web`       | 网络工具（search, browse, fetchPage）             |
| `browser`   | 浏览器自动化（initBrowser, clickElement 等）         |
| `system`    | 系统操作（listApps, openApp, closeApp）           |
| `code`      | 代码执行（executeCode, runJavaScript, runPython） |
| `git`       | Git 版本控制（gitStatus, gitCommit, gitPush 等）   |
| `task`      | 任务管理（createTask, getTasks, completeTask 等）  |
| `memory`    | 记忆系统（addMemory, searchMemory 等）             |
| `data`      | 数据处理（readCSV, writeJSON 等）                  |
| `db`        | 数据库操作（executeSQL, query 等）                  |
| `email`     | 邮件功能（sendEmail, sendTextEmail 等）            |
| `monitor`   | 系统监控（getCPUInfo, monitorSystem 等）           |
| `scheduler` | 定时任务（addScheduleTask 等）                     |

如果不配置 `enabledCategories`，默认启用所有分类。

***

## 🎭 预设人设

CogitoAgent 提供 13 种预设人设，可根据不同场景选择：

| 人设            | 描述  | 适用场景      |
| ------------- | --- | --------- |
| **explorer**  | 探索者 | 文件探索、项目理解 |
| **scholar**   | 学者  | 知识研究、深度分析 |
| **assistant** | 助手  | 日常任务、生活助手 |
| **creative**  | 创意家 | 写作、创意生成   |
| **critic**    | 评论家 | 代码审查、建议改进 |
| **teacher**   | 教师  | 教学、知识讲解   |
| **wenchen**   | 文人  | 文学创作、诗词歌赋 |
| **wujiang**   | 武将  | 决策果断、执行力强 |
| **yingwei**   | 英伟  | 领导者、战略规划  |
| **zhanshi**   | 战士  | 解决问题、克服困难 |
| **moushi**    | 谋士  | 略分析、规划    |
| **jianguan**  | 监管  | 质量把控、流程管理 |
| **xiake**     | 侠客  | 自由探索、不拘一格 |

***

## 🧪 测试

CogitoAgent 使用 Jest 测试框架，确保代码质量和稳定性。

### 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并显示详细输出
npm test -- --verbose

# 运行测试并生成覆盖率报告
npm test -- --coverage
```

### 测试覆盖范围

| 测试模块        | 测试用例数 | 覆盖内容              |
| ----------- | ----- | ----------------- |
| **Agent**   | 27    | 参数解析、工具调用、状态管理    |
| **配置管理**    | 12    | 环境变量解析、配置合并、默认值处理 |
| **参数解析**    | 10    | JSON 解析、参数验证、错误处理 |
| **Git 操作**  | 20    | 仓库操作、文件操作、安全参数传递  |
| **文件存储**    | 10    | 读写操作、目录管理、错误处理    |
| **代码执行**    | 8     | 沙箱安全、原型链隔离、危险代码拒绝 |
| **数据库**     | 10    | SQL 执行、CRUD、事务、回滚 |
| **Web 模块**  | 3     | browse、fetchPage  |
| **Browser** | 2     | Playwright 生命周期   |

### 测试特性

- ✅ **异步测试支持** - 完整支持 async/await
- ✅ **ES Module 支持** - 原生 ESM 测试环境
- ✅ **Mock 支持** - 完整的函数和模块模拟能力
- ✅ **覆盖率报告** - 详细的代码覆盖率分析

***

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. **Fork 项目** - 在 Gitee 上 Fork 本项目
2. **创建分支** - `git checkout -b feature/your-feature`
3. **编写代码** - 实现功能或修复 bug
4. **测试验证** - 确保代码可以正常运行
5. **提交 PR** - 创建 Pull Request

### 代码规范

- 使用 ES6+ 语法
- 使用 `async/await` 处理异步操作
- 工具函数返回格式：`{ success: boolean, data?: any, error?: string }`
- 代码注释清晰，便于理解

### 测试要求

- 新功能必须包含对应的测试用例
- 测试用例应覆盖正常流程和异常情况
- 所有测试必须通过：`npm test`
- 参考现有测试文件的编写风格

***

## 📝 更新日志

### v2.3.0 (2026-06)

**Phase 1: 核心架构优化**

- ✅ 新增多会话管理功能
- ✅ 支持创建、切换、删除、重命名会话
- ✅ 会话数据独立存储，互不干扰
- ✅ 自动保存会话状态，重启后恢复

**Phase 1.1: 工具分类 + 按需加载**

- ✅ 13 个工具分类（file, web, browser, system, code, git, task, memory, data, db, email, monitor, scheduler）
- ✅ 动态按需加载工具，减少 Token 消耗
- ✅ 支持配置 `tools.enabledCategories` 选择启用的分类

**Phase 1.2: 上下文压缩优化**

- ✅ Token 数量估算（中文字符约 1.5 字符 ≈ 1 token）
- ✅ 自动压缩超过 150 轮或 100K token 的上下文
- ✅ 80% 使用率时发出警告
- ✅ 归档历史到文件，保留最近对话

**Phase 2: 安全与可观测性**

- ✅ 沙箱升级 - 深度冻结内置对象，禁止 eval/Proxy
- ✅ 新增 tracing.js - 轻量追踪模块，记录工具执行、LLM 调用
- ✅ 新增 retry.js - 熔断器与重试机制

**Phase 3: 生态与扩展性**

- ✅ MCP 协议兼容 - 可作为 MCP Server 供其他 AI 客户端调用
- ✅ 插件系统 (Plugin SDK) - 支持动态加载自定义工具

**界面优化：**

- ✅ 工具调用显示简洁标签样式（如 `调用：ls`）
- ✅ 隐藏工具调用细节和结果细节，保持 TUI 简洁

### v2.2.0 (2025-06)

**架构重构：**

- ✅ Agent.js 拆分为独立模块：state.js、registry.js、commands.js
- ✅ 新增 logger.js 日志框架，支持 DEBUG/INFO/WARN/ERROR 分级
- ✅ 状态管理委托给 state.js，消除冗余状态变量

**安全增强：**

- ✅ 沙箱使用 `Object.create(null)` 创建无原型链对象
- ✅ 内置对象（JSON、Math、Array 等）使用 `Object.freeze()` 冻结
- ✅ 修复 config.js thinkingInterval 覆盖 chat 配置问题
- ✅ 修复 logger.js const currentLevel 无法修改的问题

**测试覆盖：**

- ✅ 新增 code.test.js（沙箱安全测试）
- ✅ 新增 db.test.js（数据库操作测试）
- ✅ 新增 web.test.js（Web 模块测试）
- ✅ 新增 browser.test.js（Playwright 生命周期测试）
- ✅ 测试用例从 79 增至 103+

### v2.1.0 (2025-06)

**安全增强：**

- ✅ 移除 vm2 依赖（存在已知沙箱逃逸漏洞）
- ✅ 改用 Node.js 原生 vm 模块执行 JavaScript
- ✅ 修复 config.js loadEnvConfig 属性覆盖 bug
- ✅ 临时文件超时自动清理
- ✅ 错误处理不再静默吞掉，保存失败时抛出错误

**跨平台支持：**

- ✅ 工作区路径默认使用用户主目录（`os.homedir()`）
- ✅ 移除硬编码 Windows 路径

**稳定性改进：**

- ✅ 添加退出清理回调机制
- ✅ 修正依赖版本号

**测试覆盖：**

- ✅ 测试用例增至 79+

### v2.0.0 (2024-01)

**新增功能：**

- ✅ 代码执行引擎（JavaScript/Python）
- ✅ Git 版本控制集成
- ✅ 任务管理系统
- ✅ 记忆系统
- ✅ 数据处理工具（CSV/JSON）
- ✅ SQLite 数据库操作
- ✅ 邮件功能
- ✅ 系统监控
- ✅ 定时任务调度
- ✅ 多模型支持

***

## 🐛 已知问题

- [ ] 工具 `downloadFile` 会把目标文件下载到临时目录
- [ ] AI 回复会早于工具调用提示

***

## 📄 许可证

本项目采用 **Apache 2.0** 许可证开源。

***

## 📞 联系方式

如有任何问题、需求或 Bug 反馈，请通过以下方式联系我们：

- **Gitee**: <https://gitee.com/cnt-code/cogito-agent>
- **Issues**: <https://gitee.com/cnt-code/cogito-agent/issues>

***

*Built with ❤️ by CogitoAgent Team*
