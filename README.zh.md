# CogitoAgent

> **Think Continuously · Act Autonomously · Stay Private**

Cogito, ergo sum — CogitoAgent 不仅仅是一个工具，它是你本地环境中的自主思维伙伴。

**CogitoAgent** 是一款运行于本地的自主 AI 智能体，融合了文件管理、知识挖掘、系统操作、代码执行与联网能力。它直接在用户配置的工作目录下运行，**无需上传任何文件至第三方服务器**，在保障数据隐私安全的同时，提供持续运转的智能助理服务。

![CogitoAgent 控制面板模式](introduction/electron-dashboard.png)

不同于传统的聊天机器人，CogitoAgent 具备 **持续思考**、**自主探索** 和 **工具执行** 的能力，能够在后台主动发现和整理用户的本地文件资产，并可通过扩展工具集获得更多能力。

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/版本-2.3.0-764ba2?style=flat-square" alt="版本"></a>
  <a href="#"><img src="https://img.shields.io/badge/Node-%3E%3D22.12-339933?style=flat-square&logo=node.js" alt="Node"></a>
  <a href="#"><img src="https://img.shields.io/badge/许可证-Apache_2.0-blue?style=flat-square" alt="许可证"></a>
  <a href="#"><img src="https://img.shields.io/badge/状态-稳定-success?style=flat-square" alt="状态"></a>
</p>

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **隐私优先** | 所有数据本地存储，不上传任何文件到第三方服务器 |
| **持续思考** | 每3秒自动触发思考循环，主动分析当前任务状态 |
| **工具执行** | 内置 15+ 工具模块，支持文件操作、代码执行、Git、数据库、OCR、Office 文档等 |
| **安全沙箱** | JavaScript 代码执行采用 `isolated-vm` 进程级隔离 |
| **多会话管理** | 支持多个独立对话会话，会话数据持久化存储 |
| **桌面模式** | Electron 桌面窗口，与终端 Agent 通过 WebSocket 通信 |

---

## 🚀 快速开始

### 环境要求

- **Node.js** 22.12 或更高版本
- **npm** 或 **yarn** 包管理器
- **Python** 3.x（可选，用于 Python 代码执行）

> **国内用户注意**：若 `npm install` 下载 Electron 二进制文件失败，请先设置镜像源再安装：
> ```bash
> $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
> npm install
> ```

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

| 命令 | 模式 | 说明 |
|------|------|------|
| `npm start` | 设置向导 | 首次配置或修改配置，不启动 Agent |
| `npm run electron:desktop` | 桌面模式 | Electron 桌面悬浮窗 + 终端 Agent，通过 WebSocket 通信 |
| `npm run electron:dashboard` | Dashboard 模式 | 全窗口 Electron 仪表盘，带会话管理和工具调用可视化 |
| `npm run cli` | CLI 模式 | 仅终端 Agent，不启动 Electron（适合纯命令行环境） |

**桌面模式**：半透明毛玻璃对话框 + 虚拟人物视频，支持桌面输入和终端输入。

**Dashboard 模式**：左侧边栏 + 主内容区布局，提供会话管理、技能探索、思维链可视化和工具统计图表。

**CLI 模式**：纯命令行模式，适合服务器环境、无图形界面的远程连接或资源受限环境。

**会话选择器**：启动时显示会话列表，支持选择已有会话或创建新会话。

---

## 工具系统

工具系统由 `registry.js` 统一管理，所有工具函数通过 `[TOOL] functionName(args) [/TOOL]` 格式调用。

| 分类 | 文件 | 主要功能 |
|------|------|----------|
| 文件操作 | `file.js` | `ls`, `read`, `create`, `copy`, `mkdir`, `delete`, `move` |
| 网页工具 | `web.js` | `search`, `browse`, `fetchPage`, `searchOnEngine` |
| 浏览器自动化 | `browser.js` | `initBrowser`, `clickElement`, `fillField`, `takeScreenshot` |
| 系统操作 | `system.js` | `listApps`, `openApp`, `closeApp` |
| 代码执行 | `code.js` | `executeCode`, `runJavaScript`, `runPython` |
| Git | `git.js` | `gitStatus`, `gitCommit`, `gitPush`, `gitPull`, `gitDiff`, `gitLog` |
| 任务管理 | `task.js` | `createTask`, `getTasks`, `completeTask`, `splitTask` |
| 记忆系统 | `memory.js` | `addMemory`, `searchMemory`, `getRelatedMemories`, `deleteMemory` |
| 数据处理 | `data.js` | `readCSV`, `writeJSON`, `csvToJSON`, `queryData` |
| 数据库 | `db.js` | `executeSQL`, `query`, `insert`, `update`, `createTable`, `getTables` |
| 邮件 | `email.js` | `sendEmail`, `sendTextEmail`, `sendHtmlEmail` |
| 系统监控 | `monitor.js` | `getCPUInfo`, `getMemoryInfo`, `monitorSystem` |
| 定时任务 | `scheduler.js` | `addScheduleTask`, `getScheduleTasks`, `toggleScheduleTask` |
| 图像识别 | `ocr.js` | `ocr`, `ocrBatch` |
| 视觉分析 | `vision.js` | `vision`, `visionFromUrl` |
| Office 文档 | `office.js` | `createPpt`, `createWord`, `createExcel`, `readExcel` |

> 各工具详细使用说明、注册机制、调用示例、最佳实践等内容详见 [工具系统详解](introduction/tools.md)。

---

## 架构设计

| 组件 | 职责 |
|------|------|
| **Agent.js** | 思考循环 - 每3秒自动触发一次思考 |
| **state.js** | 状态机 - THINKING / AWAITING_INPUT / AWAITING_CONFIRMATION |
| **registry.js** | 工具注册表 - 所有工具模块集中管理 |
| **session.js** | 会话管理 - 多会话切换、上下文压缩 |
| **commands.js** | 命令处理 - /help、/status 等特殊命令 |
| **sandbox.js** | 代码沙箱 - isolated-vm 进程级隔离 |
| **ws-server.js** | WebSocket - 桌面模式通信 |

> 完整架构说明、思考循环流程图、工具调用流程图、状态机、桌面模式消息流、WebSocket 通信详见 [架构设计详解](introduction/architecture.md)。

---

## 常用命令速查

### 会话管理

| 命令 | 说明 |
|------|------|
| `/sessions` | 查看所有会话列表 |
| `/new` | 创建新会话 |
| `/switch <id>` | 切换到指定会话 |
| `/delete <id>` | 删除指定会话 |
| `/rename <name>` | 重命名当前会话 |

### 系统命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/status` | 显示当前状态 |
| `/config` | 显示配置信息 |
| `/clear` | 清屏 |
| `/persona <name>` | 切换人设 |
| `/debug` | 切换调试模式 |

### 交互快捷键

| 按键 | 说明 |
|------|------|
| `ENTER` | 打断当前思考，进入输入状态 |
| `exit` | 退出程序 |

---

## 配置说明

配置文件 `config.json` 和环境变量 `.env` 两种方式，环境变量优先级更高。

> 完整的配置格式、环境变量列表、工具分类配置、高级配置（上下文压缩、输出截断、会话归档、思考间隔优化）详见 [配置指南](introduction/configuration.md)。

---

## 项目结构

```
cogito-agent/
├── src/                              # 源代码目录
│   ├── agent/                        # 智能体核心模块
│   │   ├── Agent.js                  # 核心智能体
│   │   ├── state.js                  # 状态机
│   │   ├── registry.js               # 工具注册表
│   │   ├── commands.js               # 命令处理
│   │   ├── session.js                # 多会话管理 + 系统提示词
│   │   ├── mcp.js                    # MCP 协议服务器
│   │   ├── plugin.js                 # 插件系统
│   │   ├── tracing.js                # 轻量可观测性
│   │   ├── retry.js                  # 重试与熔断机制
│   │   └── tools/                    # 工具集（16个模块）
│   │       ├── index.js              # 工具统一导出
│   │       ├── file.js / web.js / browser.js / system.js
│   │       ├── code.js / sandbox.js / git.js / task.js
│   │       ├── memory.js / data.js / db.js / email.js
│   │       ├── monitor.js / scheduler.js / ocr.js
│   │       ├── vision.js / office.js / storage.js
│   │       └── TOOL_DEVELOPMENT.md   # 工具开发文档
│   ├── api/                          # API 层
│   │   ├── client.js                 # OpenAI 兼容 API 客户端
│   │   ├── webSearch.js              # 联网搜索模块
│   │   └── models.js                 # 多模型管理
│   ├── io/                           # 输入输出
│   │   ├── terminal.js               # 终端 UI
│   │   ├── logger.js                 # 日志管理
│   │   └── ws-server.js              # WebSocket 服务
│   ├── config.js                     # 配置管理
│   └── index.js                      # 应用入口
├── electron/                         # Electron 桌面模式
│   ├── main.js                       # 主进程
│   ├── preload.cjs                   # 安全上下文桥接
│   ├── agent-bridge.js               # WebSocket ↔ IPC 桥接
│   ├── desktop/                      # 悬浮窗 UI
│   ├── dashboard/                    # 仪表盘窗口 UI
│   ├── setup/                        # 配置向导 UI
│   └── assets/                       # 桌面资源
├── personas/                         # 13种预设人设
├── tests/                            # 测试文件
├── data/                             # 运行时数据（自动创建）
└── introduction/                     # 详细文档
    ├── tools.md                      # 工具系统详解
    ├── architecture.md               # 架构设计详解
    ├── configuration.md              # 配置指南
    ├── systems.md                    # 核心系统详解
    ├── extensions.md                 # 扩展功能详解
    └── deployment.md                 # 部署与开发
```

---

## 核心系统

> 详情参见：[核心系统详解](introduction/systems.md)

- **记忆系统** - 基于 SQLite 的长期信息存储和语义检索
- **任务管理系统** - 支持任务的创建、分解、状态追踪
- **代码执行沙箱** - `isolated-vm` 进程级隔离，支持 JavaScript 和 Python
- **预设人设** - 13 种预设角色，支持自定义和热切换
- **多会话管理** - 独立会话上下文，自动压缩归档

## 扩展功能

> 详情参见：[扩展功能详解](introduction/extensions.md)

- **插件系统** - 动态加载自定义工具插件
- **MCP 协议兼容** - 将工具暴露为 MCP Server
- **追踪模块** - 轻量级追踪系统，记录工具执行、LLM 调用
- **熔断器与重试** - 保障网络请求可靠性
- **多模型支持** - 支持 OpenAI、Moark、Anthropic、Google 等
- **联网搜索** - 内置联网搜索功能

## Docker 部署

> 详情参见：[部署与开发](introduction/deployment.md)

```bash
docker-compose up -d
```

---

## 更新日志

### v2.3.0
- 多会话管理、工具分类按需加载、上下文自动压缩
- 沙箱升级 - 深度冻结内置对象
- 新增 tracing.js、retry.js、MCP 协议兼容、插件系统
- 新增 OCR 图像文字识别、视觉分析工具

### v2.2.0
- Agent.js 拆分为独立模块、logger.js 分级日志

### v2.1.0
- 移除 vm2 依赖，改用 Node.js 原生 vm 模块

### v2.0.0
- 代码执行引擎、Git 集成、任务管理、记忆系统
- 数据处理、SQLite 数据库、邮件、系统监控、定时任务

---

## 许可证

Apache 2.0

---

Built with CogitoAgent Team