# 配置指南

> 详细文档：配置文件格式、环境变量完整列表、高级配置选项。

---

## 1. 配置文件 (config.json)

配置文件位于项目根目录下的 `config.json`，使用 JSON 格式。所有字段均为可选，缺失字段将使用默认值。

**完整示例：**

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
    "frequencyPenalty": 1,
    "thinkingInterval": 3000
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
    "model": "Qwen2.5-VL-32B-Instruct"
  },
  "vision": {
    "baseURL": "",
    "apiKey": "",
    "model": "Qwen2.5-VL-32B-Instruct"
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
      "file", "web", "system", "browser", "code", "git",
      "task", "memory", "data", "db", "email", "monitor",
      "scheduler", "ocr", "vision", "office"
    ]
  },
  "persona": "Assistant"
}
```

**配置优先级（从高到低）：**

1. 环境变量（最高，覆盖配置文件）
2. `config.json` 文件（覆盖默认值）
3. 内置默认值（最低）

**保存注意事项：**

保存配置时，系统会自动过滤敏感字段（API 密钥、邮箱密码等），确保敏感信息不会写入 `config.json`。敏感信息应通过环境变量设置。

---

## 2. 环境变量 (.env)

复制 `.env.example` 为 `.env` 并填入实际值。`.env` 文件已加入 `.gitignore`，不会被提交到版本控制。

**完整示例：**

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
# 思考间隔配置（可选）
# ============================================

# 自动思考间隔时间（毫秒），最小值 1000
COGITO_THINKING_INTERVAL=3000

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
COGITO_OCR_MODEL=Qwen2.5-VL-32B-Instruct
COGITO_OCR_PROVIDER=qwen-vl

# ============================================
# 视觉分析配置（可选）
# ============================================

COGITO_VISION_API_KEY=
COGITO_VISION_API_BASE_URL=
COGITO_VISION_MODEL=Qwen2.5-VL-32B-Instruct

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

COGITO_PERSONA=Assistant
```

---

## 3. 工具分类配置

通过 `config.json` 中的 `tools.enabledCategories` 字段可以控制启用的工具分类。未配置时默认启用所有分类。

### 全部分类表

| 分类键名 | 中文名称 | 包含工具数 | 包含工具列表 |
|---------|---------|-----------|------------|
| `file` | 文件操作 | 5 | `ls`, `read`, `copy`, `mkdir`, `create` |
| `web` | 网络工具 | 3 | `search`, `browse`, `fetchPage` |
| `system` | 系统操作 | 3 | `listApps`, `openApp`, `closeApp` |
| `browser` | 浏览器自动化 | 12 | `initBrowser`, `clickElement`, `fillField`, `selectOption`, `viewChanges`, `getPageContent`, `takeScreenshot`, `closeBrowser`, `searchOnPage`, `findElements`, `searchOnEngine`, `downloadFile` |
| `code` | 代码执行 | 5 | `executeCode`, `executeFile`, `runJavaScript`, `runPython`, `formatCode` |
| `git` | Git 版本控制 | 21 | `gitInit`, `gitClone`, `gitAdd`, `gitCommit`, `gitPush`, `gitPull`, `gitStatus`, `gitLog`, `gitBranchCreate`, `gitBranchDelete`, `gitBranchList`, `gitCheckout`, `gitCheckoutNew`, `gitMerge`, `gitDiff`, `gitRemoteAdd`, `gitRemoteList`, `gitConfigUser`, `gitReset`, `gitStash`, `gitStashPop` |
| `task` | 任务管理 | 9 | `createTask`, `getTasks`, `getTask`, `updateTask`, `deleteTask`, `completeTask`, `splitTask`, `getTaskStats`, `clearTasks` |
| `memory` | 记忆系统 | 9 | `addMemory`, `searchMemory`, `getAllMemories`, `getMemory`, `updateMemory`, `deleteMemory`, `getMemoryStats`, `getRelatedMemories`, `clearMemory` |
| `data` | 数据处理 | 9 | `readCSV`, `writeCSV`, `readJSON`, `writeJSON`, `csvToJSON`, `jsonToCSV`, `queryData`, `analyzeData`, `sortData` |
| `db` | 数据库 | 11 | `executeSQL`, `query`, `insert`, `update`, `deleteData`, `createTable`, `dropTable`, `getTables`, `getTableSchema`, `executeTransaction`, `closeDB` |
| `email` | 邮件功能 | 6 | `sendEmail`, `sendTextEmail`, `sendHtmlEmail`, `sendTemplateEmail`, `sendEmailWithAttachments`, `checkEmailConfig` |
| `monitor` | 系统监控 | 9 | `getCPUInfo`, `getMemoryInfo`, `getDiskInfo`, `getNetworkInfo`, `getProcesses`, `getSystemInfo`, `getCurrentProcess`, `getSystemLoad`, `monitorSystem` |
| `scheduler` | 定时任务 | 8 | `addScheduleTask`, `getScheduleTasks`, `getScheduleTask`, `updateScheduleTask`, `toggleScheduleTask`, `removeScheduleTask`, `startScheduler`, `stopScheduler` |
| `ocr` | 图像文字识别 | 2 | `ocr`, `ocrBatch` |
| `vision` | 视觉分析 | 2 | `vision`, `visionFromUrl` |
| `office` | Office 文档 | 4 | `createPpt`, `createWord`, `createExcel`, `readExcel` |

**配置示例（仅启用部分分类）：**

```json
{
  "tools": {
    "enabledCategories": ["file", "web", "code", "git"]
  }
}
```

---

## 4. 完整环境变量列表

### 4.1 API 配置

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_API_KEY` | `api.apiKey` | 是 | - | API 密钥 |
| `COGITO_API_BASE_URL` | `api.baseURL` | 是 | - | API 服务地址 |
| `COGITO_API_PROVIDER` | `api.provider` | 否 | - | 服务商名称（openai / moark / anthropic / google） |
| `COGITO_MODEL` | `api.model` | 是 | - | 模型名称 |

### 4.2 多模型 API 密钥

支持多个 AI 服务商，推荐使用 `COGITO_` 前缀版本；无前缀版本（如 `OPENAI_API_KEY`）保留仅为向后兼容。

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_OPENAI_API_KEY` | `models.openai.apiKey` | 否 | - | OpenAI API 密钥 |
| `OPENAI_API_KEY` | `models.openai.apiKey` | 否 | - | 同上（向后兼容） |
| `COGITO_MOARK_API_KEY` | `models.moark.apiKey` | 否 | - | Moark API 密钥 |
| `MOARK_API_KEY` | `models.moark.apiKey` | 否 | - | 同上（向后兼容） |
| `COGITO_ANTHROPIC_API_KEY` | `models.anthropic.apiKey` | 否 | - | Anthropic API 密钥 |
| `ANTHROPIC_API_KEY` | `models.anthropic.apiKey` | 否 | - | 同上（向后兼容） |
| `COGITO_GOOGLE_API_KEY` | `models.google.apiKey` | 否 | - | Google API 密钥 |
| `GOOGLE_API_KEY` | `models.google.apiKey` | 否 | - | 同上（向后兼容） |

### 4.3 思考与执行配置

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_THINKING_INTERVAL` | `chat.thinkingInterval` | 否 | `3000` | 自动思考间隔（毫秒），最小值 1000 |
| `COGITO_CODE_TIMEOUT` | `code.maxExecutionTime` | 否 | `30000` | 代码执行超时时间（毫秒） |
| `COGITO_CODE_MAX_OUTPUT` | `code.maxOutputSize` | 否 | `100000` | 代码输出最大大小（字符数） |
| `COGITO_CONFIRM_DANGEROUS` | - | 否 | `true` | 是否启用危险操作二次确认 |
| `COGITO_SANDBOX_MODE` | - | 否 | `true` | 是否启用代码沙盒隔离执行 |

### 4.4 数据库配置

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_DATABASE_PATH` | `database.path` | 否 | `./data/example.db` | SQLite 数据库文件路径 |

### 4.5 邮件配置

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_EMAIL_HOST` | `email.smtpHost` | 否 | - | SMTP 服务器地址 |
| `COGITO_EMAIL_PORT` | `email.smtpPort` | 否 | `587` | SMTP 端口 |
| `COGITO_EMAIL_USER` | `email.user` | 否 | - | 邮箱用户名 |
| `COGITO_EMAIL_PASSWORD` | `email.password` | 否 | - | 邮箱密码 |
| `COGITO_EMAIL_FROM` | `email.from` | 否 | - | 发件人邮箱地址 |

### 4.6 工作区配置

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_WORKSPACE` | `workspace` | 否 | 用户主目录 | 工作区根路径，Agent 的活动范围 |
| `COGITO_PERSONA` | `persona` | 否 | - | 人设名称，对应 `personas/` 目录下的文件夹名称 |

### 4.7 OCR 配置

OCR 密钥默认回退到主 API 密钥（`COGITO_API_KEY`）。同样推荐 `COGITO_` 前缀版本。

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_OCR_API_KEY` | `ocr.apiKey` | 否 | 回退到主 API Key | OCR API 密钥 |
| `OCR_API_KEY` | `ocr.apiKey` | 否 | 同上 | 同上（向后兼容） |
| `COGITO_OCR_API_BASE_URL` | `ocr.baseURL` | 否 | - | OCR API 服务地址 |
| `OCR_API_BASE_URL` | `ocr.baseURL` | 否 | - | 同上（向后兼容） |
| `COGITO_OCR_MODEL` | `ocr.model` | 否 | `Qwen2.5-VL-32B-Instruct` | OCR 模型名称 |
| `OCR_MODEL` | `ocr.model` | 否 | - | 同上（向后兼容） |
| `COGITO_OCR_PROVIDER` | `ocr.provider` | 否 | - | OCR 服务商名称 |
| `OCR_PROVIDER` | `ocr.provider` | 否 | - | 同上（向后兼容） |

### 4.8 视觉分析配置

视觉分析密钥默认回退到主 API 密钥（`COGITO_API_KEY`），URL 默认使用 `COGITO_API_BASE_URL`。

| 环境变量 | 对应配置路径 | 必需 | 默认值 | 说明 |
|---------|------------|------|--------|------|
| `COGITO_VISION_API_KEY` | `vision.apiKey` | 否 | 回退到主 API Key | 视觉分析 API 密钥 |
| `VISION_API_KEY` | `vision.apiKey` | 否 | 同上 | 同上（向后兼容） |
| `COGITO_VISION_API_BASE_URL` | `vision.baseURL` | 否 | 回退到主 API Base URL | 视觉分析 API 服务地址 |
| `VISION_API_BASE_URL` | `vision.baseURL` | 否 | 同上 | 同上（向后兼容） |
| `COGITO_VISION_MODEL` | `vision.model` | 否 | `Qwen2.5-VL-32B-Instruct` | 视觉模型名称 |
| `VISION_MODEL` | `vision.model` | 否 | - | 同上（向后兼容） |

### 4.9 WebSocket 配置

| 环境变量 | 必需 | 默认值 | 说明 |
|---------|------|--------|------|
| `DISABLE_WS` | 否 | `false` | 设为 `true` 禁用 WebSocket 服务（CLI 模式下自动禁用） |

WebSocket 服务默认运行在端口 `9527`，供 Electron 桌面端连接。通过 `startWsServer(port)` 可自定义端口。

### 4.10 调试配置

| 环境变量 | 必需 | 默认值 | 说明 |
|---------|------|--------|------|
| `DEBUG` | 否 | `false` | 设为 `true` 启用调试模式，显示详细日志和错误堆栈 |
| `LOG_LEVEL` | 否 | `INFO` | 日志级别：`DEBUG` / `INFO` / `WARN` / `ERROR` |
| `CLI_MODE` | 否 | - | 设为 `true` 以 CLI 模式运行（自动禁用 WebSocket） |

---

## 5. 高级配置选项

### 5.1 上下文压缩策略

当对话历史增长到一定程度时，系统自动进行压缩，以控制 Token 消耗。

**压缩触发条件：**

| 条件 | 阈值 | 说明 |
|------|------|------|
| 对话轮数 | `>= 150 轮` | 超过 `COMPRESS_TURNS` 常量（150） |
| Token 估算 | `>= 100000 Token` | 超过 `MAX_TOKEN_ESTIMATE` 常量 |
| 警告阈值 | `>= 80000 Token` | 达到 `WARN_TOKEN_THRESHOLD`，提前预警 |

**压缩策略：**

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

**压缩流程：**

1. 检测到触发条件后，保留最近 `KEEP_RECENT_TURNS`（10）轮对话
2. 将较旧的对话归档到磁盘文件（归档后缀为 `_archive.json`）
3. 生成上下文摘要，替换被归档的历史消息
4. 保留 system prompt + 摘要 + 最近对话，继续对话循环

**Token 估算方法：**

| 字符类型 | 估算比例 | 说明 |
|---------|---------|------|
| 中文字符 | 1 Token ≈ 1.5 字符 | `Math.ceil(chineseChars / 1.5)` |
| 其他字符 | 1 Token ≈ 4 字符 | `Math.ceil(otherChars / 4)` |

### 5.2 工具输出截断配置

为避免工具返回结果过大导致上下文溢出，系统为不同工具设置了输出长度限制。

| 工具名称 | 最大长度（字符） | 说明 |
|---------|----------------|------|
| `ls` | 5,000 | 目录列表 |
| `gitLog` | 10,000 | Git 日志 |
| `gitDiff` | 10,000 | Git 差异对比 |
| `executeCode` | 50,000 | 代码执行结果 |
| `executeFile` | 50,000 | 文件执行结果 |
| `runJavaScript` | 50,000 | JavaScript 执行结果 |
| `runPython` | 50,000 | Python 执行结果 |
| `read` | 20,000 | 文件内容读取 |
| `readCSV` | 15,000 | CSV 文件读取 |
| `readJSON` | 15,000 | JSON 文件读取 |
| `executeSQL` | 20,000 | SQL 查询结果 |
| `query` | 20,000 | 数据库查询结果 |
| `searchMemory` | 10,000 | 记忆搜索 |
| `search` | 10,000 | 网络搜索 |
| `getProcesses` | 15,000 | 进程列表 |
| `monitorSystem` | 15,000 | 系统监控 |
| `default` | 10,000 | 其他未列出的工具默认值 |

超出限制的输出将被截断并追加提示信息：`... [输出内容过长，已截断]`。

### 5.3 会话归档策略

**归档触发条件：**

- 创建新会话时自动归档当前会话
- 切换到其他会话时自动归档当前会话
- 上下文压缩时自动归档历史消息

**归档文件结构：**

```
data/sessions/
├── meta.json                     # 会话元数据（列表、活跃会话等）
├── sess_xxx.json                 # 会话历史
├── sess_xxx_archive.json         # 归档的历史记录
├── sess_yyy.json
└── sess_yyy_archive.json
```

每个归档文件的 JSON 结构：

```json
[
  {
    "timestamp": "2026-07-05T12:00:00.000Z",
    "messages": [ ... ]
  }
]
```

**保留策略：**

| 项目 | 策略 | 说明 |
|------|------|------|
| 最近对话 | 保留 10 轮 | `KEEP_RECENT_TURNS = 10` |
| 归档文件 | 最多 3 个 | 超过 3 个时删除最早的归档 |
| 会话文件 | 不自动删除 | 可通过 `/delete` 命令手动删除 |
| 最少会话 | 至少保留 1 个 | 不允许删除最后一个会话 |

### 5.4 思考间隔优化

**代码配置：**

```json
{
  "chat": {
    "thinkingInterval": 3000
  }
}
```

**环境变量：**

```bash
COGITO_THINKING_INTERVAL=3000
```

**注意事项：**

- 环境变量优先级高于配置文件
- 环境变量值必须 `>= 1000`（1 秒），小于 1000 的值将被忽略，改用配置文件或默认值
- 配置文件中的值无下限校验，但建议不要低于 1000

**推荐值参考：**

| 使用场景 | 推荐间隔 | 说明 |
|---------|---------|------|
| 高性能 API（如 gpt-4o） | 1000-2000ms | 响应快，可缩短间隔提升交互感 |
| 普通 API | 2000-4000ms | 默认 3000ms，平衡响应速度和 Token 消耗 |
| 慢速/高延迟 API | 4000-6000ms | 减少不必要的轮询，降低 Token 消耗 |
| 长时间自主探索 | 3000-5000ms | Agent 自主探索时，较长的间隔更合理 |
| 调试/开发 | 1000ms | 快速迭代，实时反馈 |