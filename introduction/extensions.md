# Extension Features in Detail / 扩展功能详解

> Detailed documentation: plugin system, tracing module, retry mechanism, multi-model support, and web search.
> 详细文档：插件系统、追踪模块、重试机制、多模型支持、联网搜索。

---

## 1. Plugin System / 一、插件系统

The plugin system allows dynamically loading custom tools to extend the Agent's capabilities.

插件系统允许动态加载自定义工具，扩展 Agent 的能力。

### 1.1 Plugin Directory Structure / 插件目录结构

Plugins are organized under the `plugins/` directory, each in its own subfolder.

插件统一放置在 `plugins/` 目录下，每个插件拥有独立子目录。

```
plugins/
├── my-plugin/
│   └── index.ts          # Plugin entry file
└── another-plugin/
    └── index.ts
```

### 1.2 Plugin Development / 插件开发

The plugin entry file must export an object containing the tool definitions.

插件入口文件需导出一个包含工具定义的对象。

```javascript
export default {
  name: 'weather-plugin',
  version: '1.0.0',
  description: '天气查询插件',

  tools: {
    weather: {
      fn: async (params) => {
        const { city } = params;
        return `查询到${city}的天气：晴，25°C`;
      },
      description: '查询指定城市的天气',
      parameters: {
        city: { type: 'string', description: '城市名称' },
      },
      category: 'web',
      dangerLevel: 'none',
    },
  },
};
```

### 1.3 Plugin Loading / 插件加载

The system automatically scans all plugins under the `plugins/` directory at startup.

系统启动时自动扫描 `plugins/` 目录下的所有插件。

```javascript
import pluginLoader from './plugin';

const plugins = await pluginLoader.loadAll();
```

### 1.4 Plugin Management / 插件管理

The loader exposes the following management methods.

加载器提供以下管理方法。

| Method / 方法  | Description / 描述        | Parameters / 参数              |
| -------------- | ------------------------- | ------------------------------ |
| `loadAll()`    | Load all plugins          | None / 无                      |
| `load(name)`   | Load a specified plugin   | `name`: plugin name / 插件名称 |
| `unload(name)` | Unload a specified plugin | `name`: plugin name / 插件名称 |
| `list()`       | List all loaded plugins   | None / 无                      |

### 1.5 Plugin Permissions & Trust Boundary / 插件权限与执行边界

Every tool call goes through a three-tier permission resolution (`R5.2` / `R5.4`):

每个工具调用都经过「三级权限解析」（R5.2 / R5.4）：

1. **Global rule (最终裁决)**：`tools.permissions` in `config.json` — an explicit per-tool rule
   set by the user (or via the Dashboard extension panel). Applies to _all_ execution
   paths and always wins.
   **全局规则（最终裁决）**：`config.json` 中 `tools.permissions` 的用户显式工具级规则
   （或通过 Dashboard 扩展面板设置），对所有执行路径生效且优先级最高。
2. **Plugin-declared default**：`metadata.defaultPermission` in the plugin manifest
   (`allow`/`ask`/`deny`). Only honored for **trusted** plugins.
   **插件声明默认**：插件 manifest 的 `metadata.defaultPermission`
   （`allow`/`ask`/`deny`），仅对**受信任**插件生效。
3. **Untrusted-restricted default (R5.4)**：for **untrusted** plugins with no global rule,
   the tool defaults to a restricted level (`ask` by default, configurable via
   `config.security.untrustedPluginPermission`). A plugin cannot self-authorize by
   declaring `defaultPermission: 'allow'`.
   **不可信受限默认（R5.4）**：不可信插件且无全局规则时，工具默认落到受限级别
   （默认 `ask`，可通过 `config.security.untrustedPluginPermission` 配置）。插件不能通过
   声明 `defaultPermission: 'allow'` 自我授权。

**Trust model / 信任模型**：A plugin is **trusted** only if it appears in
`config.security.trustedPlugins` or in the `COGITO_TRUSTED_PLUGINS` environment
variable (comma-separated). Everything else is untrusted by default (fail-closed).

插件仅当出现在 `config.security.trustedPlugins` 列表或环境变量
`COGITO_TRUSTED_PLUGINS`（逗号分隔）中才被视为**受信任**，其余一律按不可信处理（fail-closed）。

```
{
  "security": {
    "trustedPlugins": ["my-plugin"],
    "untrustedPluginPermission": "ask"   // allow | ask | deny
  }
}
```

**Execution boundary / 执行边界**：Permission gating is enforced on _all_ tool execution
paths — main Agent (`Agent.executeTool`), sub-agents (`orchestrator`), MCP channel
(`mcp.ts`), and speculative execution (only `allow` tools run ahead). `deny` rejects
immediately; `ask` triggers a single user confirmation (combined with danger-level
confirmations); sub-agents and MCP reject `ask` (fail-closed, no interactive channel).

权限门禁在主 Agent（`Agent.executeTool`）、子智能体（`orchestrator`）、MCP 通道
（`mcp.ts`）及推测执行（仅 `allow` 预执行）等**全部执行路径**上强制生效。
`deny` 直接拒绝；`ask` 触发一次用户授权（与危险操作确认合并为单次弹窗）；
子智能体与 MCP 通道无交互能力，`ask` 按拒绝处理（fail-closed）。

**Bottom line / 结论**：What a plugin can do is decided by explicit user configuration,
never by the plugin itself.

插件能做什么，由用户显式配置决定，插件自身不能提高自己的权限。

---

## 2. Tracing Module / 二、追踪模块

The tracing module provides lightweight observability, recording detailed information about tool executions and LLM calls.

追踪模块提供轻量级可观测性，记录工具执行和 LLM 调用的详细信息。

### 2.1 Tracing Features / 追踪特性

The module traces the following aspects of execution.

该模块对以下执行方面进行追踪。

| Feature / 特性         | Description / 说明                                            |
| ---------------------- | ------------------------------------------------------------- |
| Tool execution trace   | Records parameters, results, and duration of each tool call   |
| LLM call trace         | Records LLM request prompts, responses, and token consumption |
| State transition trace | Records Agent state changes                                   |
| Log output             | Outputs tracing information to console and log files          |

### 2.2 Tracing Event Types / 追踪事件类型

The following event types are emitted by the tracing module.

追踪模块会发出以下事件类型。

| Event Type / 事件类型 | Description / 描述 |
| --------------------- | ------------------ |
| `tool_call`           | Tool call started  |
| `tool_result`         | Tool call finished |
| `llm_call`            | LLM invocation     |
| `state_change`        | State transition   |
| `error`               | Error event        |

### 2.3 Enable Tracing / 启用追踪

The tracing module is integrated automatically in `Agent.ts` and enabled via a configuration switch.

追踪模块在 `Agent.ts` 中自动集成，通过配置开关启用。

```json
{
  "tracing": {
    "enabled": true,
    "level": "info"
  }
}
```

### 2.4 Tracing Output Example / 追踪输出示例

The following is a sample of tracing output.

以下是追踪输出的示例。

```
[TRACING] tool_call: ls("./src")
[TRACING] tool_result: ls -> ["agent", "api", "io", "config.js", "index.js"] (12ms)
[TRACING] llm_call: model=gpt-4o, tokens=150
[TRACING] state_change: AWAITING_INPUT -> THINKING
```

---

## 3. Retry Mechanism / 三、重试机制

The retry logic is integrated into the API client layer, providing reliable retry support for network requests with an exponential backoff strategy.

重试逻辑集成在 API 客户端层，为网络请求提供可靠的重试支持，支持指数退避策略。

### 3.1 Retry Configuration / 重试配置

The retry mechanism is controlled by the `api.retry` setting in `config.json`.

重试机制通过 `config.json` 中的 `api.retry` 配置项控制。

```json
{
  "api": {
    "retry": {
      "maxAttempts": 3,
      "baseDelay": 1000,
      "backoffFactor": 2
    }
  }
}
```

### 3.2 Retry Options / 重试选项

The available retry options are as follows.

可用的重试选项如下。

| Option / 选项 | Description / 说明      | Default / 默认值 |
| ------------- | ----------------------- | ---------------- |
| `maxAttempts` | Maximum retry attempts  | 3                |
| `baseDelay`   | Initial delay (ms)      | 1000             |
| `backoff`     | Backoff strategy        | `exponential`    |
| `retryOn`     | Error types to retry on | `[Error]`        |
| `onRetry`     | Retry callback          | `null`           |

### 3.3 Backoff Strategies / 退避策略

The following backoff strategies are supported.

支持的退避策略如下。

| Strategy / 策略 | Description / 说明                      |
| --------------- | --------------------------------------- |
| `fixed`         | Fixed delay                             |
| `exponential`   | Exponential backoff (delay × 2^attempt) |
| `linear`        | Linear growth (delay × attempt)         |

---

## 4. Multi-Model Support / 四、多模型支持

The system supports multiple AI model providers through a unified API client.

系统支持多种 AI 模型提供商，通过统一的 API 客户端调用。

### 4.1 Supported Providers / 支持的提供商

The following providers and models are supported.

支持以下提供商与模型。

| Provider / 提供商 | Example Models / 模型示例            | Protocol / 协议       |
| ----------------- | ------------------------------------ | --------------------- |
| OpenAI            | `gpt-4o`, `gpt-4o-mini`              | OpenAI API            |
| Anthropic         | `claude-3-sonnet`, `claude-3-opus`   | Anthropic API         |
| Google            | `gemini-1.5-pro`, `gemini-1.5-flash` | Google AI API         |
| Moark             | `moark-llm`                          | OpenAI-compatible API |
| Ollama            | Any local model / 任意本地模型       | Ollama API            |

### 4.2 Model Configuration / 模型配置

Configure the model in `config.json`.

在 `config.json` 中配置模型。

```json
{
  "api": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "your-api-key",
    "model": "gpt-4o"
  }
}
```

### 4.3 Switch Model / 切换模型

Switch the model via command-line arguments.

通过命令切换模型。

```bash
npm run cli -- --model claude-3-sonnet --baseURL https://api.anthropic.com/v1 --apiKey your-key
```

---

## 5. Web Search / 五、联网搜索

The web search feature allows the Agent to fetch information from the internet in real time.

联网搜索功能允许 Agent 实时从互联网获取信息。

### 5.1 Search Tools / 搜索工具

`web.ts` provides the following search-related tools.

`web.ts` 提供以下搜索相关工具。

| Tool / 工具      | Description / 说明        | Parameters / 参数 |
| ---------------- | ------------------------- | ----------------- |
| `search`         | Perform a web search      | `query`           |
| `browse`         | Browse web page content   | `url`             |
| `fetchPage`      | Fetch page content        | `url`             |
| `searchOnEngine` | Search on a search engine | `query`           |

### 5.2 Search Configuration / 搜索配置

Configure web search as follows.

按如下方式配置联网搜索。

```json
{
  "webSearch": {
    "enabled": true,
    "provider": "moark",
    "maxResults": 10
  }
}
```

### 5.3 Usage Example / 使用示例

The web search capability is integrated through native tool calls.

联网搜索能力通过原生工具调用接入。

```
工具: search
参数: { "query": "2026年科技趋势" }

工具: fetchPage
参数: { "url": "https://nodejs.org/" }
```

---

> This document covers detailed explanations of the five major extension features: plugin system, tracing module, retry mechanism, multi-model support, and web search.
> 本文档涵盖了插件系统、追踪模块、重试机制、多模型支持和联网搜索五大扩展功能的详细说明。
