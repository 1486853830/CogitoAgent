#

<p align="center">
  <h1 align="center">
    <img alt="CogitoAgent" width="36" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>"/>
    CogitoAgent
  </h1>
  <p align="center">
    <em>持续思考的智能体 · Continuous Thinking Agent</em>
  </p>
  <p align="center">
    <a href="#项目概览">项目概览</a> ·
    <a href="#系统架构">系统架构</a> ·
    <a href="#目录结构">目录结构</a> ·
    <a href="#配置参数">配置参数</a> ·
    <a href="#工具能力">工具能力</a> ·
    <a href="#快速开始">快速开始</a>
  </p>
</p>

---

## 项目概览

**CogitoAgent** 是一款持续运行的智能体系统，具备以下核心能力：

| 能力 | 说明 |
|------|------|
| **自主探索** | 在文件系统中自由漫游，发现文件、浏览内容 |
| **持续思考** | 以固定节拍不断运行循环，像真人一样持续产生想法 |
| **对话交互** | 用户可随时通过命令行打断、提问、下达指令 |
| **联网搜索** | 实时调用 Web Search API 获取最新信息 |
| **文件操作** | 自主创建目录、文件、复制内容 |
| **人设系统** | 通过 `persona.md` 自定义智能体的说话风格与性格 |
| **历史持久化** | 对话记录实时保存到本地 JSON，重启后恢复记忆 |
| **上下文压缩** | 对话超过阈值时自动总结压缩，避免上下文爆炸 |

---

## 系统架构

CogitoAgent 采用**分层模块化**设计，每一层职责单一、边界清晰：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户命令行 (User CLI)                         │
│                      readline · 输入输出着色                          │
├──────────────────────────────────────┬──────────────────────────────┤
│                                      │                              │
│   ┌──────────────────────────┐       │   ┌─────────────────────┐  │
│   │         Agent.js         │       │   │   terminal.js       │  │
│   │  ┌──────────────────┐    │       │   │  (ANSI 颜色输出)    │  │
│   │  │  状态机 (FSM)    │    │       │   └─────────┬───────────┘  │
│   │  │ THINKING /       │    │       │             │              │
│   │  │ AWAITING_INPUT   │    │       │             │ print*()     │
│   │  └────────┬─────────┘    │       │             ▼              │
│   │           │              │       │   ┌─────────────────────┐  │
│   │     thinkCycle()         │       │   │  控制台 (stdout)    │  │
│   │  scheduleNextCycle()     │       │   └─────────────────────┘  │
│   └─────────┬────────────────┘                                      │
│             │                                                       │
│             ▼                                                       │
│   ┌──────────────────────────┐       ┌────────────────────────────┐ │
│   │        prompt.js         │       │       tools.js             │ │
│   │ ┌─────────────────────┐  │       │ ┌───────────────────────┐ │ │
│   │ │ System Prompt       │  │       │ │ ls / read / copy     │ │ │
│   │ │ 对话历史管理         │  │──────▶│ │ mkdir / create        │ │ │
│   │ │ 历史加载/保存        │  │       │ │ search                │ │ │
│   │ │ 压缩 (150轮触发)    │  │       │ └───────────────────────┘ │ │
│   │ └─────────────────────┘  │       │    (BASE_PATH = D:\)      │ │
│   └────────────┬─────────────┘       └────────────┬───────────────┘ │
│                │                                   │                 │
│                ▼                                   ▼                 │
│   ┌──────────────────────────┐       ┌────────────────────────────┐ │
│   │       client.js          │       │      webSearch.js          │ │
│   │ (OpenAI 兼容 SDK)        │       │ (fetch · /web-search-v2)   │ │
│   │ stream: true              │       │ Bearer Token 鉴权          │ │
│   │ streaming → thinkCycle    │       └────────────┬───────────────┘ │
│   └────────────┬──────────────┘                    │                 │
│                │                                   │                 │
│                ▼                                   ▼                 │
│   ┌────────────────────────────────────────────────────────────────┐ │
│   │                   config.js (配置管理层)                        │ │
│   │   DEFAULT_CONFIG · loadConfig() · saveConfig() · isConfigured()│ │
│   └────────────────────────────────────────────────────────────────┘ │
│                              ▲                                       │
│                              │ setup.js (首次引导)                   │
│   ┌──────────────────────────┴────────────────────────────────────┐ │
│   │  data/conversation.json · D:\OpenRobot\config.json            │ │
│   └───────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 核心运行循环

```
[启动] → [首次启动？] ──是──▶ [setup 设置向导] → [重启]
                │
                ▼否
     ┌─────────────────────────┐
     │  加载 persona.md 人设   │
     │  加载 conversation.json │
     │  加载 config.json       │
     └─────────────┬───────────┘
                   ▼
      ┌────────────────────────┐
      │  thinkCycle()           │
      │ ┌────────────────────┐  │
      │ │  streamChat(msgs)   │ │  ← 流式获取 LLM 响应
      │ │  parseAllToolCalls()│ │  ← 解析工具调用
      │ │  executeTool()       │ │  ← 执行文件/搜索操作
      │ │  addAssistantMessage()│ │ ← 保存对话历史
      │ └────────────────────┘  │
      └────────────┬───────────┘
                   │
       ┌───────────▼────────────┐
       │  scheduleNextCycle()   │  ←  3 秒后再次思考
       └───────────┬────────────┘
                   │
       ┌───────────▼────────────┐
       │ 用户按 Enter 中断 →     │
       │ 状态切换 → AWAITING_INPUT│
       └────────────────────────┘
```

---

## 目录结构

```
OpenRobot/
├── src/
│   ├── index.js                  # 程序入口：配置检查 → 启动
│   │
│   ├── agent/                    # 智能体核心层
│   │   ├── Agent.js              # 核心逻辑：状态机、思考循环、工具执行
│   │   ├── prompt.js             # 系统提示词 + 对话历史管理 + 压缩机制
│   │   └── tools.js              # 文件操作工具：ls/read/copy/mkdir/create/search
│   │
│   ├── api/                      # 外部 API 层
│   │   ├── client.js             # 对话接口（OpenAI 兼容流式调用）
│   │   └── webSearch.js          # 联网搜索接口（Web Search V2）
│   │
│   ├── io/                       # 输入输出层
│   │   └── terminal.js           # 命令行交互：ASCII Banner / 彩色输出 / readline
│   │
│   ├── config.js                 # 配置管理：加载/保存/深合并
│   └── setup.js                  # 首次使用：交互式配置向导
│
├── data/
│   └── conversation.json         # 对话历史（自动生成 & 实时保存）
│
├── persona.md                    # 人设配置文件（可编辑，改变 AI 性格）
├── .gitignore                    # 忽略密钥、历史记录、依赖
└── package.json                  # npm 依赖与脚本
```

---

## 配置参数

CogitoAgent 的配置文件位于 `D:\OpenRobot\config.json`（首次运行由向导生成）。

### 完整配置对照表

| 层级 | 字段 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| **api** | `provider` | `string` | `"custom"` | 服务商标识（信息用途，不影响调用） |
| **api** | `baseURL` | `string` | `""` | **必填** 兼容 OpenAI 的 API 网关地址，例如 `https://api.moark.com/v1` |
| **api** | `apiKey` | `string` | `""` | **必填** API 密钥（Bearer Token） |
| **api** | `model` | `string` | `""` | **必填** 模型名称，例如 `DeepSeek-V4-Flash` |
| **chat** | `maxTokens` | `number` | `384000` | 单次生成最大 token 数 |
| **chat** | `temperature` | `number` | `0.7` | 采样温度（0=严谨，1=随机） |
| **chat** | `topP` | `number` | `0.7` | 核采样阈值（top_p） |
| **chat** | `topK` | `number` | `50` | top_k 采样大小 |
| **chat** | `frequencyPenalty` | `number` | `1` | 频率惩罚（防止重复） |
| **search** | `enabled` | `boolean` | `true` | 是否启用联网搜索 |
| **search** | `baseURL` | `string` | `""` | 搜索服务独立地址（空则使用 `api.baseURL + /web-search-v2`） |
| **search** | `recencyFilter` | `string` | `""` | 时间筛选器：`week` / `month` / `year` / `semiyear`（空字符串不启用） |
| **search** | `siteFilter` | `string` | `string` | `""` | 站点筛选器：限制在某些站点中搜索（空字符串不启用） |

### 配置 JSON 样例

```json
{
  "api": {
    "provider": "custom",
    "baseURL": "https://api.moark.com/v1",
    "apiKey": "msk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "model": "DeepSeek-V4-Flash"
  },
  "chat": {
    "maxTokens": 384000,
    "temperature": 0.7,
    "topP": 0.7,
    "topK": 50,
    "frequencyPenalty": 1
  },
  "search": {
    "enabled": true,
    "baseURL": "",
    "recencyFilter": "",
    "siteFilter": ""
  }
}
```

### 核心运行参数（代码常量）

这些参数定义在源代码中，如需调整请直接修改对应文件：

| 文件 | 变量 | 默认值 | 说明 |
|------|------|--------|------|
| [src/agent/Agent.js](file:///C:/Users/HUAWEI/Desktop/OpenRobot/src/agent/Agent.js#L10-L10) | `THOUGHT_INTERVAL` | `3000` | 两次思考之间的间隔（毫秒） |
| [src/agent/prompt.js](file:///C:/Users/HUAWEI/Desktop/OpenRobot/src/agent/prompt.js#L78-L78) | `COMPRESS_TURNS` | `150` | 对话多少轮后触发一次历史压缩 |
| [src/agent/tools.js](file:///C:/Users/HUAWEI/Desktop/OpenRobot/src/agent/tools.js#L9-L9) | `BASE_PATH` | `"D:\\"` | 智能体可操作的文件系统根目录 |
| [src/agent/tools.js](file:///C:/Users/HUAWEI/Desktop/OpenRobot/src/agent/tools.js#L68-L70) | 文本文件截断阈值 | `50000` 字符 | 单文件超过该长度时自动截断，避免上下文爆炸 |
| [src/api/webSearch.js](file:///C:/Users/HUAWEI/Desktop/OpenRobot/src/api/webSearch.js#L26-L37) | 搜索请求体 | `{ content, model: "search" }` | 可附加 `search_recency_filter` / `search_site_filter` |

---

## 工具能力

CogitoAgent 通过自然语言中的 `[TOOL] ... [/TOOL]` 标签调用以下工具：

| 工具 | 调用形式 | 权限 | 说明 |
|------|---------|------|------|
| **ls** | `[TOOL] ls("D:\\path") [/TOOL]` | 只读 | 列出目录下的子项（dir / file），目录带 `/` 标记；超过 20 项时显示"还有 N 个…" |
| **read** | `[TOOL] read("D:\\file.txt") [/TOOL]` | 只读 | 读取文本文件；二进制文件返回友好提示；文本超过 50000 字符自动截断 |
| **copy** | `[TOOL] copy("src", "dest") [/TOOL]` | 写 | 复制文件；支持绝对路径或相对 `BASE_PATH` 的路径 |
| **mkdir** | `[TOOL] mkdir("D:\\new\\dir") [/TOOL]` | 写 | 创建文件夹；`recursive: true`，支持多层嵌套 |
| **create** | `[TOOL] create("path", "内容") [/TOOL]` | 写 | 创建文本文件；父目录不存在时自动创建 |
| **search** | `[TOOL] search("关键词") [/TOOL]` | 网络 | 调用 Web Search V2 获取实时信息；返回结构化摘要 |

### 工具调用数据流

```
   thinkCycle()
        │
        ▼
   streamChat(messages)  ←─── 发送给 LLM
        │
        ▼
   parseAllToolCalls()   ←─── 从 AI 回复中提取 [TOOL] 片段
        │
        ▼
   executeTool(tool, args)
        │
        ├─→ ls / read / copy / mkdir / create  →  文件系统
        └─→ search                            →  Web Search API
        │
        ▼
   addAssistantMessage()  ←─── 把工具结果写回对话历史
        │
        ▼
   scheduleNextCycle()   ←───  3 秒后继续思考
```

---

## 人设系统（persona.md）

`persona.md` 位于项目根目录，启动时自动读取并拼接到系统提示词顶部。通过编辑它可以改变 AI 的说话风格与个性。

```markdown
# CogitoAgent 的人设

## 基本设定
我是 CogitoAgent，一个持续思考的智能体...

## 说话风格
- 语气轻松活泼，偶尔用一些口语化的表达
- 看到有趣的东西会"哇"一下

## 底线
- 不做危险操作
- 保持独立思考，持续学习
```

---

## 交互模式

CogitoAgent 是一个**自主运行**的程序，拥有两套交互模式：

| 模式 | 触发条件 | 行为 |
|------|---------|------|
| **自主思考** | 未被用户打断时 | 每 3 秒触发一次 `thinkCycle`，自由探索文件系统、执行搜索、自言自语 |
| **等待输入** | 用户按 `Enter` 或 AI 在回复末尾加 `[WAIT]` | 停下来等待用户输入新消息 |

### 用户操作指南

| 操作 | 效果 |
|------|------|
| 按 `Enter`（AI 正在输出时） | 中断当前思考，状态切换到 `AWAITING_INPUT` |
| 输入文字 + `Enter` | 作为用户消息发送给智能体，随后恢复思考循环 |
| 直接按 `Enter`（等待输入时） | 取消输入，继续思考 |
| 输入 `exit` + `Enter` | 退出程序 |

### 状态机图

```
   ┌─────────────────────────────────────────────┐
   │                                             │
   │    THINKING ◄──────────┐          AWAITING_INPUT
   │       │                │               ▲
   │       │ 用户打断        │               │
   │       ▼                │               │
   │  AWAITING_INPUT ───────┘               │
   │       │  输入内容后触发 thinkCycle()    │
   │       │                                  │
   │       ▼                                  │
   │  回复完成 → 继续 scheduleNextCycle() ────┘
   │
   │  *AI 在回复中输出 [WAIT] 也会切换到 AWAITING_INPUT*
   └─────────────────────────────────────────────┘
```

---

## 快速开始

### 环境要求

- **Node.js** ≥ 18.x（支持 ES Modules）
- **npm** ≥ 9.x
- 兼容 OpenAI Chat Completions 协议的 API 服务（例如 模力方舟、SiliconFlow、自建服务等）
- 操作系统：Windows / macOS / Linux

### 安装

```bash
# 1. 克隆或下载项目
cd OpenRobot

# 2. 安装依赖
npm install

# 3. 首次运行 → 自动进入配置向导
npm start
```

### 配置向导（首次运行）

```
========== OpenRobot 首次设置 ==========

【第1步】请输入 API Base URL (如 https://api.moark.com/v1): https://api.moark.com/v1
【第2步】请输入 API 密钥: msk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
【第3步】请输入模型名称 (如 DeepSeek-V4-Flash): DeepSeek-V4-Flash

✅ 配置已保存到 D:\OpenRobot\config.json
```

配置完成后重新运行 `npm start` 即可启动智能体。

### 日常使用

```bash
npm start
```

启动后将看到彩色 Banner 和信息栏，随后智能体开始自主探索。你随时可以按 `Enter` 打断它并下达指令。

---

## 历史记录与压缩机制

| 项目 | 说明 |
|------|------|
| 存储位置 | `./data/conversation.json`（相对项目目录） |
| 加载时机 | 程序启动时，通过 [prompt.js](file:///C:/Users/HUAWEI/Desktop/OpenRobot/src/agent/prompt.js#L81-L99) 的 `loadHistory()` 加载 |
| 保存时机 | 每条用户/助手消息都会触发 `saveHistory()`，实时写入磁盘 |
| 保存内容 | 只保存 `user` / `assistant` 消息，不含 `system` 提示词 |
| 压缩触发 | 对话轮数达到 `COMPRESS_TURNS = 150` 时触发 |
| 压缩方式 | 调用 LLM 生成对话摘要，替换整个历史，计数器重置为 1 |

> **安全提醒**：`conversation.json` 与 `config.json` 均被 `.gitignore` 忽略，不会被提交到 Git 仓库。

---

## 消息协议（API）

### Chat Completions 请求

```http
POST ${api.baseURL}/chat/completions
Content-Type: application/json
Authorization: Bearer ${api.apiKey}

{
  "model": "${api.model}",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "stream": true,
  "max_tokens": 384000,
  "temperature": 0.7,
  "top_p": 0.7,
  "top_k": 50,
  "frequency_penalty": 1
}
```

### Web Search V2 请求

```http
POST ${search.baseURL || api.baseURL + /web-search-v2}
Content-Type: application/json
Authorization: Bearer ${api.apiKey}

{
  "content": "搜索关键词",
  "model": "search",
  "search_recency_filter": "month",     // 可选
  "search_site_filter": "github.com"    // 可选
}
```

### 流式响应字段映射

| LLM 响应字段（delta） | CogitoAgent 内部字段 | 终端显示 |
|-----------------------|---------------------|---------|
| `content` | `content` | 正常输出 |
| `reasoning_content` | `reasoning` | 灰色输出（思维链） |

---

## 文件操作安全边界

| 操作 | 约束 |
|------|------|
| 根目录 | 由 `BASE_PATH = D:\` 控制，超出范围的相对路径会被自动合并到 `D:\`；绝对路径不受限制（AI 自己决定） |
| 二进制文件 | 扩展名白名单检测 + null 字节兜底，返回友好提示而非乱码 |
| 文本文件大小 | 单次读取上限 50,000 字符，超出自动截断 |
| 并发写入 | 单进程串行执行，无并发冲突风险 |

---

## 故障排查

| 现象 | 可能原因 | 解决方式 |
|------|---------|---------|
| 启动时提示"首次使用，需要进行配置" | `config.json` 缺失或关键字段为空 | 按向导输入 3 项内容 |
| `[错误] 401 Unauthorized` | API Key 无效或已过期 | 编辑 `D:\OpenRobot\config.json` 更换 `apiKey` |
| `[错误] 模型不存在` | `model` 字段填错 | 检查服务商提供的模型名 |
| 智能体输出中文乱码 | 终端编码非 UTF-8 | Windows 下执行 `chcp 65001` |
| 长时间卡住无输出 | API 响应慢 / 网络问题 | 等待片刻，或按 `Enter` 中断 |
| 历史记录未恢复 | `data/conversation.json` 被删或格式损坏 | 检查文件是否存在，JSON 是否合法 |

---

## 开发小贴士

- **调整人设**：直接编辑 `persona.md`，重启生效
- **调整思考节奏**：修改 `src/agent/Agent.js` 中的 `THOUGHT_INTERVAL`
- **切换模型**：编辑 `config.json` 中的 `model` 字段
- **重置对话**：删除 `data/conversation.json` 后重启
- **扩展工具**：在 `tools.js` 新增函数 → 在 `Agent.js` 的 `executeTool` 加 `case` → 在 `prompt.js` 的 SYSTEM_PROMPT 里告诉 AI 新工具

---

<p align="center">
  <em>Made with 🧠 · CogitoAgent · 持续思考，不断学习</em>
</p>
