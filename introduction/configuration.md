# Configuration Guide / 配置指南

> Detailed documentation: configuration file format, the complete list of environment variables, and advanced configuration options.
> 详细文档：配置文件格式、环境变量完整列表、高级配置选项。

---

## 1. Configuration File (config.json) / 配置文件 (config.json)

The configuration file is located at `config.json` in the user data directory, in JSON format. All fields are optional; missing fields use default values.

配置文件位于用户数据目录下的 `config.json`，使用 JSON 格式。所有字段均为可选，缺失字段将使用默认值。

**Storage paths / 存储路径**：

- Windows: `C:\Users\<用户名>\AppData\Roaming\cogitoagent\config.json`
- macOS: `~/Library/Application Support/cogitoagent/config.json`
- Linux: `~/.config/cogitoagent/config.json`

**Full example / 完整示例：**

```json
{
  "api": {
    "provider": "openai",
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "sk-xxx",
    "model": "gpt-4o"
  },
  "chat": {
    "maxTokens": 131072,
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
  },
  "ocr": {
    "provider": "qwen-vl",
    "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKey": "",
    "model": "InternVL3-78B"
  },
  "vision": {
    "baseURL": "",
    "apiKey": "",
    "model": "InternVL3-78B"
  },
  "imageGen": {
    "apiKey": "",
    "baseURL": "https://api.moark.com/v1",
    "model": "qwen-image-2.0-pro"
  },
  "workspace": "C:\\Users\\username",
  "database": {
    "path": "./data/example.db"
  },
  "email": {
    "smtpHost": "smtp.example.com",
    "smtpPort": 587,
    "user": "user@example.com",
    "password": "",
    "from": "user@example.com"
  },
  "models": {
    "openai": {
      "apiKey": "",
      "baseURL": "https://api.openai.com/v1"
    },
    "moark": {
      "apiKey": "",
      "baseURL": "https://api.moark.com/v1"
    },
    "anthropic": {
      "apiKey": "",
      "baseURL": "https://api.anthropic.com/v1"
    },
    "google": {
      "apiKey": "",
      "baseURL": "https://generativelanguage.googleapis.com/v1beta"
    }
  },
  "code": {
    "maxExecutionTime": 30000,
    "maxOutputSize": 100000
  },
  "scheduler": {
    "enabled": true
  },
  "tools": {
    "enabledCategories": [
      "file",
      "web",
      "system",
      "browser",
      "code",
      "git",
      "task",
      "memory",
      "data",
      "db",
      "email",
      "monitor",
      "scheduler",
      "ocr",
      "vision",
      "image",
      "office",
      "cluster",
      "wechat"
    ]
  },
  "persona": "Assistant"
}
```

**Configuration priority (high to low) / 配置优先级（从高到低）：**

1. Environment variables (highest, override the config file) / 环境变量（最高，覆盖配置文件）
2. `config.json` file (overrides defaults) / `config.json` 文件（覆盖默认值）
3. Built-in defaults (lowest) / 内置默认值（最低）

**Save notes / 保存注意事项：**

When saving configuration, the system automatically filters sensitive fields (API keys, email passwords, etc.) to ensure sensitive information is not written to `config.json`. Sensitive information should be set via environment variables.

保存配置时，系统会自动过滤敏感字段（API 密钥、邮箱密码等），确保敏感信息不会写入 `config.json`。敏感信息应通过环境变量设置。

---

## 2. Environment Variables (.env) / 环境变量 (.env)

Copy `.env.example` to `.env` and fill in actual values. The `.env` file is already added to `.gitignore` and will not be committed to version control.

复制 `.env.example` 为 `.env` 并填入实际值。`.env` 文件已加入 `.gitignore`，不会被提交到版本控制。

**Full example / 完整示例：**

```bash
# CogitoAgent 环境变量配置模板
# 复制此文件为 .env 并填入您的实际配置值

# ============================================
# API 配置（必需）
# ============================================

# API 密钥（必需）
COGITO_API_KEY=your-api-key-here

# API 服务地址（可选，默认根据 provider 自动设置）
COGITO_API_BASE_URL=https://api.openai.com/v1

# API 服务商名称（可选，支持: openai, moark, anthropic, google）
COGITO_API_PROVIDER=openai

# 模型名称（可选）
COGITO_MODEL=gpt-4o

# ============================================
# 启动模式配置（可选）
# ============================================

# 启动模式: desktop（桌面宠物模式）/ dashboard（工作台模式）
COGITO_MODE=desktop

# ============================================
# 数据库配置（可选）
# ============================================

# SQLite 数据库文件路径
COGITO_DATABASE_PATH=./data/example.db

# ============================================
# 邮件配置（可选）
# ============================================

# SMTP 服务器地址
COGITO_EMAIL_HOST=smtp.example.com

# SMTP 端口
COGITO_EMAIL_PORT=587

# 邮箱用户名
COGITO_EMAIL_USER=your-email@example.com

# 邮箱密码
COGITO_EMAIL_PASSWORD=your-email-password

# 发件人邮箱地址
COGITO_EMAIL_FROM=your-email@example.com

# ============================================
# 多模型 API 密钥（可选）
# ============================================

# OpenAI API 密钥
COGITO_OPENAI_API_KEY=your-openai-api-key

# Moark API 密钥
COGITO_MOARK_API_KEY=your-moark-api-key

# Anthropic API 密钥
COGITO_ANTHROPIC_API_KEY=your-anthropic-api-key

# Google API 密钥
COGITO_GOOGLE_API_KEY=your-google-api-key

# ============================================
# OCR 图像文字识别配置（可选）
# ============================================

COGITO_OCR_API_KEY=your-ocr-api-key
COGITO_OCR_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
COGITO_OCR_MODEL=InternVL3-78B
COGITO_OCR_PROVIDER=qwen-vl

# ============================================
# 视觉分析配置（可选）
# ============================================

COGITO_VISION_API_KEY=
COGITO_VISION_API_BASE_URL=
COGITO_VISION_MODEL=InternVL3-78B

# ============================================
# 图像生成配置（可选）/ Image Generation Config (optional)
# 留空则使用主 API Key（与语言模型相同）/ if blank, uses the main API key (same as the LLM)
COGITO_IMAGEGEN_API_KEY=
COGITO_IMAGEGEN_API_BASE_URL=https://api.moark.com/v1
COGITO_IMAGEGEN_MODEL=qwen-image-2.0-pro

# ============================================
# 代码执行配置（可选）
# ============================================

# 代码执行超时时间（毫秒）
COGITO_CODE_TIMEOUT=30000

# 代码输出最大大小（字符）
COGITO_CODE_MAX_OUTPUT=100000

# ============================================
# 安全配置（可选）
# ============================================

# 是否启用危险操作确认（默认启用）
COGITO_CONFIRM_DANGEROUS=true

# 是否启用代码沙盒模式（默认启用）
COGITO_SANDBOX_MODE=true

# ============================================
# 工作区配置（可选）
# ============================================

COGITO_WORKSPACE=./

# ============================================
# 人设配置（可选）
# ============================================
# 注意：人设不再从环境变量读取（启动默认套用 Cogito 人设，避免环境覆盖默认人设）。
# 请在 config.json 中设置 "persona" 字段指定持久默认人设（对应 personas/ 目录下的文件夹名）；
# 留空或不设则默认使用 Cogito 人设。示例：
# {
#   "persona": "Assistant"
# }
```

---

## 3. Tool Category Configuration / 工具分类配置

The `tools.enabledCategories` field in `config.json` controls which tool categories are enabled. By default, all categories are enabled if not configured.

通过 `config.json` 中的 `tools.enabledCategories` 字段可以控制启用的工具分类。未配置时默认启用所有分类。

### Full category table / 全部分类表

| 分类键名         | 中文名称                    | 包含工具数 | 包含工具列表                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file`           | 文件操作                    | 5          | `ls`, `read`, `copy`, `mkdir`, `create`                                                                                                                                                                                                                                                           |
| `web`            | 网络工具                    | 3          | `search`, `browse`, `fetchPage`                                                                                                                                                                                                                                                                   |
| `system`         | 系统操作                    | 3          | `listApps`, `openApp`, `closeApp`                                                                                                                                                                                                                                                                 |
| `browser`        | 浏览器自动化                | 12         | `initBrowser`, `clickElement`, `fillField`, `selectOption`, `viewChanges`, `getPageContent`, `takeScreenshot`, `closeBrowser`, `searchOnPage`, `findElements`, `searchOnEngine`, `downloadFile`                                                                                                   |
| `code`           | 代码执行                    | 5          | `executeCode`, `executeFile`, `runJavaScript`, `runPython`, `formatCode`                                                                                                                                                                                                                          |
| `git`            | Git 版本控制                | 21         | `gitInit`, `gitClone`, `gitAdd`, `gitCommit`, `gitPush`, `gitPull`, `gitStatus`, `gitLog`, `gitBranchCreate`, `gitBranchDelete`, `gitBranchList`, `gitCheckout`, `gitCheckoutNew`, `gitMerge`, `gitDiff`, `gitRemoteAdd`, `gitRemoteList`, `gitConfigUser`, `gitReset`, `gitStash`, `gitStashPop` |
| `task`           | 任务管理                    | 9          | `createTask`, `getTasks`, `getTask`, `updateTask`, `deleteTask`, `completeTask`, `splitTask`, `getTaskStats`, `clearTasks`                                                                                                                                                                        |
| `memory`         | 记忆系统                    | 9          | `addMemory`, `searchMemory`, `getAllMemories`, `getMemory`, `updateMemory`, `deleteMemory`, `getMemoryStats`, `getRelatedMemories`, `clearMemory`                                                                                                                                                 |
| `data`           | 数据处理                    | 9          | `readCSV`, `writeCSV`, `readJSON`, `writeJSON`, `csvToJSON`, `jsonToCSV`, `queryData`, `analyzeData`, `sortData`                                                                                                                                                                                  |
| `db`             | 数据库                      | 11         | `executeSQL`, `query`, `insert`, `update`, `deleteData`, `createTable`, `dropTable`, `getTables`, `getTableSchema`, `executeTransaction`, `closeDB`                                                                                                                                               |
| `email`          | 邮件功能                    | 6          | `sendEmail`, `sendTextEmail`, `sendHtmlEmail`, `sendTemplateEmail`, `sendEmailWithAttachments`, `checkEmailConfig`                                                                                                                                                                                |
| `monitor`        | 系统监控                    | 9          | `getCPUInfo`, `getMemoryInfo`, `getDiskInfo`, `getNetworkInfo`, `getProcesses`, `getSystemInfo`, `getCurrentProcess`, `getSystemLoad`, `monitorSystem`                                                                                                                                            |
| `scheduler`      | 定时任务                    | 8          | `addScheduleTask`, `getScheduleTasks`, `getScheduleTask`, `updateScheduleTask`, `toggleScheduleTask`, `removeScheduleTask`, `startScheduler`, `stopScheduler`                                                                                                                                     |
| `ocr`            | 图像文字识别                | 2          | `ocr`, `ocrBatch`                                                                                                                                                                                                                                                                                 |
| `vision`         | 视觉分析                    | 2          | `vision`, `visionFromUrl`                                                                                                                                                                                                                                                                         |
| `image`          | 图像生成 / Image Generation | 1          | `generateImage`                                                                                                                                                                                                                                                                                   |
| `office`         | Office 文档                 | 6          | `createPpt`, `createWord`, `createExcel`, `readExcel`, `readWord`, `readPpt`                                                                                                                                                                                                                      |
| `cluster`        | 集群管理                    | 11         | `spawnAgent`, `delegateTask`, `getClusterStatus`, `stopAgent`, `stopAllAgents`, `parallelExecute`, `getAgent`, `getAgentTranscript`, `panelDiscussion`, `pipeline`, `voting`                                                                                                                      |
| `wechat`         | 微信消息                    | 6          | `loginWechat`, `logoutWechat`, `sendWechatMessage`, `sendWechatImage`, `getWechatStatus`, `generateWechatQRCode`                                                                                                                                                                                  |
| `chemistry`      | 化学信息学（插件）          | 5          | `molInfo`, `molDraw`, `molFingerprint`, `molSubstruct`, `molSimilarity`（由 `plugins/rdkit-chem` 提供）                                                                                                                                                                                           |
| `bioinformatics` | 生物信息学（插件）          | 7          | `bioAlign`, `bioBlast`, `bioConvert`, `bioFetchGenbank`, `bioPdbInfo`, `bioFastaStats`, `bioMsa`（由 `plugins/biopython-bio` 提供）                                                                                                                                                               |
| `literature`     | 文献检索（插件）            | 4          | `pubmedSearch`, `pubmedFetch`, `pubmedAdvanced`, `pubmedCite`（由 `plugins/pubmed-research` 提供）                                                                                                                                                                                                |
| `mcp`            | 外部 MCP 工具               | 动态       | 通过 MCP 服务器动态注册（R4.3），数量随已接入的 MCP server 而定                                                                                                                                                                                                                                   |

> 说明：内置工具共 **128 个 / 19 类**；加 3 个科学插件（chemistry / bioinformatics / literature，16 个工具）与动态 MCP 工具后，总分类数为 **23**。表中未注册为工具的模块内辅助函数（如 `path.ts` 的路径工具）不会出现在模型可调用的工具列表中。

**Config example (enable only some categories) / 配置示例（仅启用部分分类）：**

```json
{
  "tools": {
    "enabledCategories": ["file", "web", "code", "git"]
  }
}
```

---

## 4. Complete Environment Variable List / 完整环境变量列表

### 4.1 API Configuration / API 配置

| 环境变量              | 对应配置路径   | 必需 | 默认值 | 说明                                              |
| --------------------- | -------------- | ---- | ------ | ------------------------------------------------- |
| `COGITO_API_KEY`      | `api.apiKey`   | 是   | -      | API 密钥                                          |
| `COGITO_API_BASE_URL` | `api.baseURL`  | 是   | -      | API 服务地址                                      |
| `COGITO_API_PROVIDER` | `api.provider` | 否   | -      | 服务商名称（openai / moark / anthropic / google） |
| `COGITO_MODEL`        | `api.model`    | 是   | -      | 模型名称                                          |

### 4.2 Multi-Model API Keys / 多模型 API 密钥

Supports multiple AI providers; the `COGITO_`-prefixed versions are recommended; prefix-less versions (e.g. `OPENAI_API_KEY`) are retained only for backward compatibility.

支持多个 AI 服务商，推荐使用 `COGITO_` 前缀版本；无前缀版本（如 `OPENAI_API_KEY`）保留仅为向后兼容。

| 环境变量                   | 对应配置路径              | 必需 | 默认值 | 说明               |
| -------------------------- | ------------------------- | ---- | ------ | ------------------ |
| `COGITO_OPENAI_API_KEY`    | `models.openai.apiKey`    | 否   | -      | OpenAI API 密钥    |
| `OPENAI_API_KEY`           | `models.openai.apiKey`    | 否   | -      | 同上（向后兼容）   |
| `COGITO_MOARK_API_KEY`     | `models.moark.apiKey`     | 否   | -      | Moark API 密钥     |
| `MOARK_API_KEY`            | `models.moark.apiKey`     | 否   | -      | 同上（向后兼容）   |
| `COGITO_ANTHROPIC_API_KEY` | `models.anthropic.apiKey` | 否   | -      | Anthropic API 密钥 |
| `ANTHROPIC_API_KEY`        | `models.anthropic.apiKey` | 否   | -      | 同上（向后兼容）   |
| `COGITO_GOOGLE_API_KEY`    | `models.google.apiKey`    | 否   | -      | Google API 密钥    |
| `GOOGLE_API_KEY`           | `models.google.apiKey`    | 否   | -      | 同上（向后兼容）   |

### 4.3 Thinking & Execution Config / 思考与执行配置

| 环境变量                   | 对应配置路径            | 必需 | 默认值   | 说明                       |
| -------------------------- | ----------------------- | ---- | -------- | -------------------------- |
| `COGITO_CODE_TIMEOUT`      | `code.maxExecutionTime` | 否   | `30000`  | 代码执行超时时间（毫秒）   |
| `COGITO_CODE_MAX_OUTPUT`   | `code.maxOutputSize`    | 否   | `100000` | 代码输出最大大小（字符数） |
| `COGITO_CONFIRM_DANGEROUS` | -                       | 否   | `true`   | 是否启用危险操作二次确认   |
| `COGITO_SANDBOX_MODE`      | -                       | 否   | `true`   | 是否启用代码沙盒隔离执行   |

### 4.4 Database Config / 数据库配置

| 环境变量               | 对应配置路径    | 必需 | 默认值              | 说明                  |
| ---------------------- | --------------- | ---- | ------------------- | --------------------- |
| `COGITO_DATABASE_PATH` | `database.path` | 否   | `./data/example.db` | SQLite 数据库文件路径 |

### 4.5 Email Config / 邮件配置

| 环境变量                | 对应配置路径     | 必需 | 默认值 | 说明            |
| ----------------------- | ---------------- | ---- | ------ | --------------- |
| `COGITO_EMAIL_HOST`     | `email.smtpHost` | 否   | -      | SMTP 服务器地址 |
| `COGITO_EMAIL_PORT`     | `email.smtpPort` | 否   | `587`  | SMTP 端口       |
| `COGITO_EMAIL_USER`     | `email.user`     | 否   | -      | 邮箱用户名      |
| `COGITO_EMAIL_PASSWORD` | `email.password` | 否   | -      | 邮箱密码        |
| `COGITO_EMAIL_FROM`     | `email.from`     | 否   | -      | 发件人邮箱地址  |

### 4.6 Workspace Config / 工作区配置

| 环境变量             | 对应配置路径 | 必需 | 默认值     | 说明                                                                                                                |
| -------------------- | ------------ | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `COGITO_WORKSPACE`   | `workspace`  | 否   | 用户主目录 | 工作区根路径，Agent 的活动范围                                                                                      |
| ~~`COGITO_PERSONA`~~ | `persona`    | 否   | -          | **已废弃**：人设不再从环境变量读取。请在 `config.json` 设置 `"persona": "<文件夹名>"` 指定默认人设；留空默认 Cogito |

### 4.7 OCR Configuration / OCR 配置

The OCR key falls back to the main API key (`COGITO_API_KEY`) by default. The `COGITO_`-prefixed versions are also recommended.

OCR 密钥默认回退到主 API 密钥（`COGITO_API_KEY`）。同样推荐 `COGITO_` 前缀版本。

| 环境变量                  | 对应配置路径   | 必需 | 默认值           | 说明             |
| ------------------------- | -------------- | ---- | ---------------- | ---------------- |
| `COGITO_OCR_API_KEY`      | `ocr.apiKey`   | 否   | 回退到主 API Key | OCR API 密钥     |
| `OCR_API_KEY`             | `ocr.apiKey`   | 否   | 同上             | 同上（向后兼容） |
| `COGITO_OCR_API_BASE_URL` | `ocr.baseURL`  | 否   | -                | OCR API 服务地址 |
| `OCR_API_BASE_URL`        | `ocr.baseURL`  | 否   | -                | 同上（向后兼容） |
| `COGITO_OCR_MODEL`        | `ocr.model`    | 否   | `InternVL3-78B`  | OCR 模型名称     |
| `OCR_MODEL`               | `ocr.model`    | 否   | -                | 同上（向后兼容） |
| `COGITO_OCR_PROVIDER`     | `ocr.provider` | 否   | -                | OCR 服务商名称   |
| `OCR_PROVIDER`            | `ocr.provider` | 否   | -                | 同上（向后兼容） |

### 4.8 Vision Analysis Config / 视觉分析配置

The vision analysis key falls back to the main API key (`COGITO_API_KEY`) by default; the URL defaults to `COGITO_API_BASE_URL`.

视觉分析密钥默认回退到主 API 密钥（`COGITO_API_KEY`），URL 默认使用 `COGITO_API_BASE_URL`。

| 环境变量                     | 对应配置路径     | 必需 | 默认值                | 说明                  |
| ---------------------------- | ---------------- | ---- | --------------------- | --------------------- |
| `COGITO_VISION_API_KEY`      | `vision.apiKey`  | 否   | 回退到主 API Key      | 视觉分析 API 密钥     |
| `VISION_API_KEY`             | `vision.apiKey`  | 否   | 同上                  | 同上（向后兼容）      |
| `COGITO_VISION_API_BASE_URL` | `vision.baseURL` | 否   | 回退到主 API Base URL | 视觉分析 API 服务地址 |
| `VISION_API_BASE_URL`        | `vision.baseURL` | 否   | 同上                  | 同上（向后兼容）      |
| `COGITO_VISION_MODEL`        | `vision.model`   | 否   | `InternVL3-78B`       | 视觉模型名称          |
| `VISION_MODEL`               | `vision.model`   | 否   | -                     | 同上（向后兼容）      |

### 4.9 WebSocket Configuration / WebSocket 配置

| 环境变量                | 必需 | 默认值      | 说明                                                        |
| ----------------------- | ---- | ----------- | ----------------------------------------------------------- |
| `DISABLE_WS`            | 否   | `false`     | 设为 `true` 禁用 WebSocket 服务（CLI 模式下自动禁用）       |
| `COGITO_WS_HOST`        | 否   | `127.0.0.1` | WebSocket 服务监听地址（Docker 部署需设为 `0.0.0.0`）       |
| `COGITO_WS_HEALTH`      | 否   | `false`     | 是否启用独立健康检查 HTTP 服务（容器健康检查请设为 `true`） |
| `COGITO_WS_HEALTH_PORT` | 否   | `9528`      | 健康检查 HTTP 服务端口                                      |
| `COGITO_WS_TOKEN`       | 否   | 随机生成    | WS 访问令牌；Docker/远程场景必须注入固定强随机值            |

The WebSocket service runs on port `9527` by default, for the Electron desktop client to connect. Use `startWsServer(port)` to customize the port.

WebSocket 服务默认运行在端口 `9527`，供 Electron 桌面端连接。通过 `startWsServer(port)` 可自定义端口。

### 4.10 Debug Configuration / 调试配置

| 环境变量    | 必需 | 默认值  | 说明                                              |
| ----------- | ---- | ------- | ------------------------------------------------- |
| `DEBUG`     | 否   | `false` | 设为 `true` 启用调试模式，显示详细日志和错误堆栈  |
| `LOG_LEVEL` | 否   | `INFO`  | 日志级别：`DEBUG` / `INFO` / `WARN` / `ERROR`     |
| `CLI_MODE`  | 否   | -       | 设为 `true` 以 CLI 模式运行（自动禁用 WebSocket） |

### 4.11 Image Generation Config / 图像生成配置

| 环境变量 / Env Var             | 对应配置路径 / Config Path | 必需 / Required | 默认值 / Default                              | 说明 / Description                                             |
| ------------------------------ | -------------------------- | --------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `COGITO_IMAGEGEN_API_KEY`      | `imageGen.apiKey`          | 否 / No         | 回退到主 API Key / falls back to main API key | 图像生成 API 密钥 / image generation API key                   |
| `COGITO_IMAGEGEN_API_BASE_URL` | `imageGen.baseURL`         | 否 / No         | `https://api.moark.com/v1`                    | 图像生成 API 服务地址 / image generation API base URL          |
| `COGITO_IMAGEGEN_MODEL`        | `imageGen.model`           | 否 / No         | `qwen-image-2.0-pro`                          | 图像生成模型名称（建议值）/ image model name (SUGGESTED value) |

Note: Model names and output sizes are **SUGGESTED VALUES** and may change with the image provider. For `qwen-image-2.0-pro` the suggested sizes are: `2048*2048`, `2368*1728`, `2688*1536`, `1728*2368`, `2536*2688`. The tool does not validate model/size; validity depends on the provider's API.

注意：模型名称和输出尺寸为**建议值**，可能随图像服务商变化。对于 `qwen-image-2.0-pro`，建议尺寸为：`2048*2048`、`2368*1728`、`2688*1536`、`1728*2368`、`2536*2688`。该工具不校验模型/尺寸，有效性取决于服务商的 API。

---

## 5. Advanced Configuration Options / 高级配置选项

### 5.1 Context Compression Strategy / 上下文压缩策略

When conversation history grows beyond a certain point, the system automatically compresses it to control Token consumption.

当对话历史增长到一定程度时，系统自动进行压缩，以控制 Token 消耗。

**Compression triggers / 压缩触发条件：**

> 阈值按模型上下文窗口**动态推导**（R3.4）：`max = 模型上下文窗口`，`warn = max × 0.8`。
> 未识别的模型回退默认值（下表）。已识别模型示例：gpt-5/gpt-4.1 → 1M，claude/haiku/opus → 200k，gemini → 1M，gpt-4o → 128k，deepseek → 64k，moonshot/kimi → 128k，moark/qwen/internlm → 100k。

| 条件       | 阈值                          | 说明                                   |
| ---------- | ----------------------------- | -------------------------------------- |
| 对话轮数   | `>= 150 轮`                   | 超过 `COMPRESS_TURNS` 常量（150）      |
| Token 估算 | `>= max`（默认 100000 Token） | 超过模型上下文窗口推导值（默认 100K）  |
| 警告阈值   | `>= warn`（默认 80000 Token） | 达到 `max × 0.8`（默认 80K），提前预警 |

**Compression strategy / 压缩策略：**

```json
{
  "compression": {
    "compressTurns": 150,
    "keepRecentTurns": 10,
    "maxTokenEstimate": 100000,
    "warnTokenThreshold": 80000
  }
}
```

**Compression flow / 压缩流程：**

1. After a trigger is detected, keep the most recent `KEEP_RECENT_TURNS` (10) rounds of conversation. / 检测到触发条件后，保留最近 `KEEP_RECENT_TURNS`（10）轮对话
2. Archive older conversations to a disk file (archive suffix `_archive.json`). / 将较旧的对话归档到磁盘文件（归档后缀为 `_archive.json`）
3. Generate a context summary that replaces the archived history messages. / 生成上下文摘要，替换被归档的历史消息
4. Keep system prompt + summary + recent conversation, and continue the conversation loop. / 保留 system prompt + 摘要 + 最近对话，继续对话循环

**Token estimation method / Token 估算方法：**

| 字符类型 | 估算比例           | 说明                            |
| -------- | ------------------ | ------------------------------- |
| 中文字符 | 1 Token ≈ 1.5 字符 | `Math.ceil(chineseChars / 1.5)` |
| 其他字符 | 1 Token ≈ 4 字符   | `Math.ceil(otherChars / 4)`     |

### 5.2 Tool Output Truncation / 工具输出截断配置

To avoid tool outputs being too large and causing context overflow, the system sets output length limits for different tools.

为避免工具返回结果过大导致上下文溢出，系统为不同工具设置了输出长度限制。

| 工具名称        | 最大长度（字符） | 说明                   |
| --------------- | ---------------- | ---------------------- |
| `ls`            | 5,000            | 目录列表               |
| `gitLog`        | 10,000           | Git 日志               |
| `gitDiff`       | 10,000           | Git 差异对比           |
| `executeCode`   | 50,000           | 代码执行结果           |
| `executeFile`   | 50,000           | 文件执行结果           |
| `runJavaScript` | 50,000           | JavaScript 执行结果    |
| `runPython`     | 50,000           | Python 执行结果        |
| `read`          | 20,000           | 文件内容读取           |
| `readCSV`       | 15,000           | CSV 文件读取           |
| `readJSON`      | 15,000           | JSON 文件读取          |
| `executeSQL`    | 20,000           | SQL 查询结果           |
| `query`         | 20,000           | 数据库查询结果         |
| `searchMemory`  | 10,000           | 记忆搜索               |
| `search`        | 10,000           | 网络搜索               |
| `getProcesses`  | 15,000           | 进程列表               |
| `monitorSystem` | 15,000           | 系统监控               |
| `default`       | 10,000           | 其他未列出的工具默认值 |

Outputs exceeding the limit will be truncated and appended with the notice: `... [输出已截断：原始 N 字符，显示前 M 字符]`.

超出限制的输出将被截断并追加提示信息：`... [输出已截断：原始 N 字符，显示前 M 字符]`。

### 5.3 Session Archiving Strategy / 会话归档策略

**Archive triggers / 归档触发条件：**

- Automatically archive the current session when creating a new session. / 创建新会话时自动归档当前会话
- Automatically archive the current session when switching to another session. / 切换到其他会话时自动归档当前会话
- Automatically archive history messages when compressing context. / 上下文压缩时自动归档历史消息

**Archive file structure / 归档文件结构：**

```
data/sessions/
├── meta.json                     # 会话元数据（列表、活跃会话等）
├── sess_xxx.json                 # 会话历史
├── sess_xxx_archive.json         # 归档的历史记录
├── sess_yyy.json
└── sess_yyy_archive.json
```

The JSON structure of each archive file:

每个归档文件的 JSON 结构：

```json
[
  {
    "timestamp": "2026-07-05T12:00:00.000Z",
    "messages": [ ... ]
  }
]
```

**Retention policy / 保留策略：**

| 项目     | 策略          | 说明                          |
| -------- | ------------- | ----------------------------- |
| 最近对话 | 保留 10 轮    | `KEEP_RECENT_TURNS = 10`      |
| 归档文件 | 最多 3 个     | 超过 3 个时删除最早的归档     |
| 会话文件 | 不自动删除    | 可通过 `/delete` 命令手动删除 |
| 最少会话 | 至少保留 1 个 | 不允许删除最后一个会话        |

## 3. Reasoning & Speculative Execution (R2.7 / R2.8 / R2.9) / 推理与推测执行（R2.7 / R2.8 / R2.9）

### 3.1 Reasoning Depth Knobs (R2.9) / 推理深度旋钮（R2.9）

The `chat` config adds the following fields, all passed through the request body to supported models (OpenAI o-series / gpt-5, etc.).

`chat` 配置新增以下字段，均经请求体打通到支持的模型（OpenAI o 系列 / gpt-5 等）：

- `reasoningEffort`: `low` / `medium` / `high` / `xhigh` (or `none` to disable), controls reasoning strength per turn. / `reasoningEffort`：`low` / `medium` / `high` / `xhigh`（也可设 `none` 关闭），控制每轮推理强度。
- `verbosity`: `low` / `medium` / `high`, output verbosity, decoupled from reasoning depth. / `verbosity`：`low` / `medium` / `high`，输出冗长度，与推理深度解耦。
- `thinking`: thinking mode. / `thinking`：思考模式。
  - `{ "type": "adaptive" }`: adaptive thinking, replaces the fixed token budget. / 自适应思考，替代固定 token 预算。
  - `{ "type": "enabled", "budgetTokens": 8000 }`: explicit budget tokens. / 显式预算 token。
  - `{ "type": "disabled" }`: disable thinking. / 关闭思考。

### 3.2 Speculative Execution (R2.7) & PASTE Pattern Mining (R2.8) / 推测执行（R2.7）与 PASTE 模式挖掘（R2.8）

`chat.speculative` controls speculative execution, disabled by default:

`chat.speculative` 控制推测执行，默认关闭：

- `enabled: true`: explicitly enable. While the main model thinks, a lightweight "draft model" runs in parallel to predict the next tool call, pre-executing only **read-only/idempotent** tools (based on R1.7 annotations); on a hit the result is reused, on a miss it falls back losslessly. / `enabled: true`：显式启用。主模型思考期间并行跑轻量「草稿模型」预测下一步工具调用，仅对**只读/幂等**工具（基于 R1.7 注解）预执行；预测命中则复用结果，未命中无损回退。
- `draftModel`: draft model name (lightweight/cheap); defaults to reusing the main model. / `draftModel`：草稿模型名（轻量/廉价），缺省复用主模型。
- `auto: true`: auto mode. `PatternStore` (`data/speculation-patterns.json`) mines "context signature → predicted tool" patterns from execution traces; once both the hit rate (`confidenceThreshold`, default 0.8) and sample count (`minSamples`, default 5) meet thresholds, speculative execution is enabled automatically. / `auto: true`：自动模式。由 `PatternStore`（`data/speculation-patterns.json`）从执行轨迹挖掘「上下文签名 → 预测工具」模式，命中率（`confidenceThreshold`，默认 0.8）与样本数（`minSamples`，默认 5）双达标后自动启用推测执行。
- `confidenceThreshold` / `minSamples`: thresholds for auto-enabling. / `confidenceThreshold` / `minSamples`：自动启用的门槛。
