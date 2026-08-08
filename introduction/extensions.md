# 扩展功能详解

> 详细文档：插件系统、追踪模块、重试机制、多模型支持、联网搜索。

---

## 一、插件系统

插件系统允许动态加载自定义工具，扩展 Agent 的能力。

### 1.1 插件目录结构

```
plugins/
├── my-plugin/
│   └── index.ts          # 插件入口文件
└── another-plugin/
    └── index.ts
```

### 1.2 插件开发

插件入口文件需导出一个包含工具定义的对象：

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

### 1.3 插件加载

系统启动时自动扫描 `plugins/` 目录下的所有插件：

```javascript
import pluginLoader from './plugin';

const plugins = await pluginLoader.loadAll();
```

### 1.4 插件管理

| 方法           | 描述               | 参数             |
| -------------- | ------------------ | ---------------- |
| `loadAll()`    | 加载所有插件       | 无               |
| `load(name)`   | 加载指定插件       | `name`：插件名称 |
| `unload(name)` | 卸载指定插件       | `name`：插件名称 |
| `list()`       | 列出所有已加载插件 | 无               |

---

## 二、追踪模块

追踪模块提供轻量级可观测性，记录工具执行和 LLM 调用的详细信息。

### 2.1 追踪特性

| 特性         | 说明                                     |
| ------------ | ---------------------------------------- |
| 工具执行追踪 | 记录每次工具调用的参数、结果和耗时       |
| LLM 调用追踪 | 记录 LLM 请求的提示词、响应和 token 消耗 |
| 状态转换追踪 | 记录 Agent 状态变更                      |
| 日志输出     | 追踪信息输出到控制台和日志文件           |

### 2.2 追踪事件类型

| 事件类型       | 描述         |
| -------------- | ------------ |
| `tool_call`    | 工具调用开始 |
| `tool_result`  | 工具调用结束 |
| `llm_call`     | LLM 调用     |
| `state_change` | 状态变更     |
| `error`        | 错误事件     |

### 2.3 启用追踪

追踪模块在 `Agent.ts` 中自动集成，通过配置开关启用：

```json
{
  "tracing": {
    "enabled": true,
    "level": "info"
  }
}
```

### 2.4 追踪输出示例

```
[TRACING] tool_call: ls("./src")
[TRACING] tool_result: ls -> ["agent", "api", "io", "config.js", "index.js"] (12ms)
[TRACING] llm_call: model=gpt-4o, tokens=150
[TRACING] state_change: AWAITING_INPUT -> THINKING
```

---

## 三、重试机制

重试逻辑集成在 API 客户端层，为网络请求提供可靠的重试支持，支持指数退避策略。

### 3.1 重试配置

重试机制通过 `config.json` 中的 `api.retry` 配置项控制：

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

### 3.2 重试选项

| 选项          | 说明               | 默认值        |
| ------------- | ------------------ | ------------- |
| `maxAttempts` | 最大重试次数       | 3             |
| `baseDelay`   | 初始延迟（毫秒）   | 1000          |
| `backoff`     | 退避策略           | `exponential` |
| `retryOn`     | 需要重试的错误类型 | `[Error]`     |
| `onRetry`     | 重试回调           | `null`        |

### 3.3 退避策略

| 策略          | 说明                         |
| ------------- | ---------------------------- |
| `fixed`       | 固定延迟                     |
| `exponential` | 指数退避（延迟 × 2^attempt） |
| `linear`      | 线性增长（延迟 × attempt）   |

---

## 四、多模型支持

系统支持多种 AI 模型提供商，通过统一的 API 客户端调用。

### 4.1 支持的提供商

| 提供商    | 模型示例                             | 协议            |
| --------- | ------------------------------------ | --------------- |
| OpenAI    | `gpt-4o`, `gpt-4o-mini`              | OpenAI API      |
| Anthropic | `claude-3-sonnet`, `claude-3-opus`   | Anthropic API   |
| Google    | `gemini-1.5-pro`, `gemini-1.5-flash` | Google AI API   |
| Moark     | `moark-llm`                          | OpenAI 兼容 API |
| Ollama    | 任意本地模型                         | Ollama API      |

### 4.2 模型配置

在 `config.json` 中配置模型：

```json
{
  "api": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "your-api-key",
    "model": "gpt-4o"
  }
}
```

### 4.3 切换模型

通过命令切换模型：

```bash
npm run cli -- --model claude-3-sonnet --baseURL https://api.anthropic.com/v1 --apiKey your-key
```

---

## 五、联网搜索

联网搜索功能允许 Agent 实时从互联网获取信息。

### 5.1 搜索工具

`web.ts` 提供以下搜索相关工具：

| 工具             | 说明           | 参数    |
| ---------------- | -------------- | ------- |
| `search`         | 执行联网搜索   | `query` |
| `browse`         | 浏览网页内容   | `url`   |
| `fetchPage`      | 获取页面内容   | `url`   |
| `searchOnEngine` | 在搜索引擎搜索 | `query` |

### 5.2 搜索配置

```json
{
  "webSearch": {
    "enabled": true,
    "provider": "moark",
    "maxResults": 10
  }
}
```

### 5.3 使用示例

联网搜索能力通过原生工具调用接入：

```
工具: search
参数: { "query": "2026年科技趋势" }

工具: fetchPage
参数: { "url": "https://nodejs.org/" }
```

---

> 本文档涵盖了插件系统、追踪模块、重试机制、多模型支持和联网搜索五大扩展功能的详细说明。
