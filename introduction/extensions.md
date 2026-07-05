# 扩展功能详解

> 详细文档：插件系统、MCP 协议、追踪模块、熔断器与重试、多模型支持、联网搜索。

---

## 一、插件系统

插件系统允许开发者扩展核心功能，通过标准接口注册自定义工具、行为或事件监听器。

### 1.1 插件目录结构

```
plugins/
├── my-plugin/
│   ├── index.js          # 插件入口文件
│   ├── config.yaml       # 插件配置文件
│   └── README.md         # 插件说明文档
├── another-plugin/
│   ├── index.js
│   └── config.yaml
└── built-in/             # 内置插件目录
    ├── web-search/
    └── code-executor/
```

### 1.2 插件开发

**入口文件示例（index.js）：**

```javascript
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  description: '我的自定义插件',

  async initialize(ctx) {
    // 插件初始化逻辑
    ctx.registerTool('greet', async (params) => {
      return `你好，${params.name}！`;
    });
  },

  async onActivate() {
    console.log('插件已激活');
  },

  async onDeactivate() {
    console.log('插件已停用');
  },
};
```

**配置文件示例（config.yaml）：**

```yaml
name: my-plugin
version: 1.0.0
description: 我的自定义插件
author: example
enabled: true
dependencies:
  - built-in/web-search
settings:
  greeting: "你好，世界！"
  timeout: 5000
```

### 1.3 插件加载

**自动加载：** 系统启动时自动扫描 `plugins/` 目录下的所有有效插件配置。

**手动加载：**

```javascript
const loader = require('./plugin-loader');

// 加载单个插件
await loader.load('/path/to/plugin');

// 卸载插件
await loader.unload('my-plugin');

// 重新加载
await loader.reload('my-plugin');
```

### 1.4 插件管理

| 方法 | 描述 | 参数 |
|------|------|------|
| `list()` | 列出所有已加载插件 | 无 |
| `enable(name)` | 启用指定插件 | `name`：插件名称 |
| `disable(name)` | 停用指定插件 | `name`：插件名称 |
| `install(path)` | 从路径安装插件 | `path`：插件目录或压缩包路径 |
| `uninstall(name)` | 卸载指定插件 | `name`：插件名称 |

### 1.5 工具注册

插件通过 `ctx.registerTool(name, handler, options)` 注册工具：

```javascript
ctx.registerTool(
  'weather_query',
  async (params) => {
    const { city } = params;
    // 查询天气逻辑
    return { temperature: 25, condition: '晴' };
  },
  {
    description: '查询指定城市的天气',
    parameters: {
      city: { type: 'string', description: '城市名称' },
    },
  }
);
```

### 1.6 插件最佳实践

- **单一职责：** 每个插件只负责一个功能领域，避免大而全的插件。
- **错误隔离：** 使用 try-catch 包裹插件逻辑，防止插件崩溃影响主进程。
- **资源清理：** 在 `onDeactivate` 中释放定时器、网络连接等资源。
- **版本兼容：** 声明依赖的最低版本，并测试向后兼容性。
- **配置外部化：** 将可变参数放入 config.yaml，避免硬编码。

---

## 二、MCP 协议兼容性

MCP（Model Context Protocol）是一种标准化的通信协议，用于 AI 模型与外部工具、数据源之间的交互。

### 2.1 协议概述

MCP 协议基于 JSON-RPC 2.0，支持以下核心功能：

- **工具调用（Tool Call）：** 模型调用外部工具并获取结果。
- **资源访问（Resource Access）：** 模型读取外部数据资源。
- **提示模板（Prompts）：** 预设的交互模板。
- **流式传输（Streaming）：** 支持 SSE 流式响应。

### 2.2 启动 MCP 服务器

**默认端口启动：**

```bash
mcp-server start
# 默认监听 localhost:8080
```

**自定义端口：**

```bash
mcp-server start --port 9090 --host 0.0.0.0
```

### 2.3 MCP 工具列表

**请求示例：**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**响应示例：**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "web_search",
        "description": "执行联网搜索",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "搜索关键词" }
          },
          "required": ["query"]
        }
      }
    ]
  }
}
```

### 2.4 MCP 工具调用

**请求示例：**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "web_search",
    "arguments": {
      "query": "今日天气"
    }
  }
}
```

**响应示例：**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "今日天气：晴，25-30°C"
      }
    ],
    "isError": false
  }
}
```

### 2.5 MCP 资源访问

| 方法 | 描述 | 参数 |
|------|------|------|
| `resources/list` | 列出所有可用资源 | `{protocol?, pattern?}` |
| `resources/read` | 读取指定资源内容 | `{uri: string}` |
| `resources/subscribe` | 订阅资源变更通知 | `{uri: string}` |
| `resources/unsubscribe` | 取消订阅 | `{uri: string}` |

### 2.6 MCP Prompts

MCP 支持预设的提示模板，用于引导模型行为：

```json
// 请求 prompts/list
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "prompts/list",
  "params": {}
}

// 响应
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "prompts": [
      {
        "name": "code_review",
        "description": "代码审查助手",
        "arguments": [
          { "name": "language", "description": "编程语言" }
        ]
      }
    ]
  }
}
```

### 2.7 MCP 客户端示例

```javascript
const { MCPClient } = require('mcp-client');

const client = new MCPClient({ endpoint: 'http://localhost:8080' });

// 列出工具
const tools = await client.listTools();

// 调用工具
const result = await client.callTool('web_search', { query: '最新科技新闻' });

// 读取资源
const data = await client.readResource('file:///config/settings.json');
```

### 2.8 MCP 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `mcp.enabled` | 启用 MCP 服务 | `true` |
| `mcp.host` | 监听地址 | `localhost` |
| `mcp.port` | 监听端口 | `8080` |
| `mcp.maxPayloadSize` | 最大请求体大小（字节） | `1048576` |
| `mcp.timeout` | 请求超时（毫秒） | `30000` |
| `mcp.logLevel` | 日志级别 | `info` |

---

## 三、追踪模块

追踪模块提供全链路监控能力，记录系统运行过程中的关键事件和性能指标。

### 3.1 追踪特性

| 特性 | 说明 |
|------|------|
| 全链路追踪 | 记录一次请求从发起到底层的完整调用链 |
| 异步上下文 | 自动维护异步操作间的追踪上下文 |
| 标签过滤 | 支持按标签（tags）筛选和检索追踪记录 |
| 采样控制 | 可配置采样率，降低高吞吐场景下的性能开销 |
| 导出接口 | 支持将追踪数据导出到 Jaeger、Zipkin 等后端 |

### 3.2 追踪事件类型

| 事件类型 | 描述 | 触发时机 |
|----------|------|----------|
| `llm_call` | LLM 调用 | 发送请求到语言模型时 |
| `tool_exec` | 工具执行 | 调用外部工具时 |
| `state_change` | 状态变更 | Agent 状态发生转换时 |
| `error` | 错误事件 | 发生异常或错误时 |
| `user_interaction` | 用户交互 | 收到用户消息时 |
| `system_event` | 系统事件 | 系统内部事件发生时 |

### 3.3 启用追踪

```javascript
const tracer = require('./tracer');

// 启用追踪
tracer.enable({
  enabled: true,
  sampleRate: 1.0,       // 采样率：1.0 表示全量采样
  exporters: ['console'], // 导出方式
  tags: { environment: 'production' },
});
```

### 3.4 追踪记录

**LLM 调用记录：**

```javascript
const trace = tracer.startSpan('llm_call', {
  tags: { model: 'gpt-4', tokens: 150 },
});

// LLM 调用逻辑
const response = await llm.call(prompt);

trace.end({
  result: response,
  duration: 1200, // 毫秒
});
```

**工具执行记录：**

```javascript
const trace = tracer.startSpan('tool_exec', {
  tags: { tool: 'web_search', query: '最新消息' },
});

try {
  const result = await tool.execute(params);
  trace.end({ status: 'success', result });
} catch (err) {
  trace.end({ status: 'error', error: err.message });
}
```

**状态变更记录：**

```javascript
const trace = tracer.startSpan('state_change', {
  tags: { from: 'idle', to: 'processing' },
});

agent.setState('processing');

trace.end({
  transition: 'idle → processing',
  trigger: 'user_message',
});
```

### 3.5 追踪统计

```javascript
const stats = tracer.getStats();
// 输出：
// {
//   totalSpans: 1250,
//   byType: { llm_call: 800, tool_exec: 350, state_change: 100 },
//   avgDuration: { llm_call: 850, tool_exec: 1200 },
//   errorRate: 0.02,
// }
```

### 3.6 追踪日志

```javascript
// 查询最近 100 条错误追踪
const errorTraces = tracer.query({
  types: ['error'],
  limit: 100,
  orderBy: 'timestamp',
  order: 'desc',
});

// 按标签过滤
const gptTraces = tracer.query({
  tags: { model: 'gpt-4' },
  timeRange: { start: '2026-01-01', end: '2026-07-01' },
});
```

### 3.7 追踪最佳实践

- **合理采样：** 生产环境建议采样率设为 0.1~0.5，开发环境设为 1.0。
- **标签规范：** 统一使用小写字母和下划线命名标签，便于检索和聚合。
- **及时结束：** 每个 span 必须调用 `end()`，否则会导致内存泄漏。
- **错误标记：** 工具执行失败时务必在 span 中记录错误信息，便于定位问题。
- **避免过度追踪：** 高频的细粒度事件（如每次循环迭代）不应单独追踪，改用计数器代替。

---

## 四、熔断器与重试

熔断器（Circuit Breaker）和重试（Retry）机制共同保障系统的稳定性和容错能力。

### 4.1 熔断器状态

| 状态 | 说明 | 行为 |
|------|------|------|
| **CLOSED**（关闭） | 正常状态 | 请求正常通过 |
| **OPEN**（开启） | 熔断状态 | 请求直接失败，不执行实际调用 |
| **HALF_OPEN**（半开） | 试探状态 | 允许少量请求通过，检测服务是否恢复 |

### 4.2 状态转换

```
CLOSED → OPEN   ：失败次数超过阈值
OPEN → HALF_OPEN：经过等待时间窗口后自动进入
HALF_OPEN → CLOSED：试探请求成功
HALF_OPEN → OPEN ：试探请求失败
```

### 4.3 熔断器配置

```javascript
const breaker = new CircuitBreaker({
  failureThreshold: 5,        // 连续失败次数阈值
  successThreshold: 2,        // 半开状态下成功次数阈值
  timeout: 30000,             // 熔断等待时间（毫秒）
  halfOpenMaxRequests: 3,     // 半开状态最大请求数
});
```

### 4.4 熔断器使用

```javascript
async function callExternalService() {
  return breaker.execute(async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error('请求失败');
    return response.json();
  });
}

// 监控状态变化
breaker.onStateChange((newState, oldState) => {
  console.log(`熔断器状态：${oldState} → ${newState}`);
});
```

### 4.5 重试配置

```javascript
const retrier = new Retrier({
  maxRetries: 3,          // 最大重试次数
  baseDelay: 1000,        // 初始延迟（毫秒）
  maxDelay: 10000,        // 最大延迟（毫秒）
  retryableErrors: [
    'TimeoutError',
    'NetworkError',
    'ServiceUnavailableError',
  ],
  onRetry: (attempt, error) => {
    console.log(`第 ${attempt} 次重试：${error.message}`);
  },
});
```

### 4.6 重试使用

```javascript
async function fetchWithRetry(url) {
  return retrier.execute(async () => {
    const response = await fetch(url);
    if (response.status === 429) {
      throw new RetryableError('请求限流，需要重试');
    }
    return response.json();
  });
}
```

### 4.7 退避策略

| 策略 | 说明 | 延迟计算公式 |
|------|------|-------------|
| `fixed`（固定） | 每次重试延迟固定时长 | `delay = baseDelay` |
| `exponential`（指数） | 延迟指数增长 | `delay = baseDelay × 2^(attempt-1)` |
| `fibonacci`（斐波那契） | 延迟按斐波那契数列增长 | `delay = baseDelay × fib(attempt+1)` |
| `decorrelated_jitter`（去相关抖动） | 指数退避 + 随机抖动 | `delay = min(maxDelay, random(baseDelay, delay × 3))` |

### 4.8 组合使用

```javascript
// 熔断器 + 重试组合
const protectedCall = async () => {
  return breaker.execute(async () => {
    return retrier.execute(async () => {
      return await externalApi.call(params);
    });
  });
};
```

### 4.9 状态监控

```javascript
const status = breaker.getStatus();
// 输出：
// {
//   state: 'CLOSED',
//   failureCount: 0,
//   successCount: 42,
//   lastFailure: null,
//   lastSuccess: '2026-07-05T10:30:00Z',
// }

const retryStats = retrier.getStats();
// 输出：
// {
//   totalAttempts: 15,
//   totalRetries: 12,
//   successRate: 0.87,
//   avgDuration: 2300,
// }
```

### 4.10 最佳实践

- **熔断器粒度：** 按外部服务或资源独立配置熔断器，避免一个服务故障影响其他服务。
- **合理阈值：** 根据服务 SLA 设置失败阈值，一般建议 3~10 次。
- **退避与抖动：** 生产环境优先选择 `decorrelated_jitter` 策略，避免重试风暴。
- **重试幂等性：** 确保被重试的操作是幂等的，防止重复执行产生副作用。
- **熔断与重试组合：** 熔断器在外层兜底，重试在内层处理临时故障。
- **告警通知：** 熔断器状态变更时应触发告警，及时通知运维人员。

---

## 五、多模型支持

系统支持同时接入多个 AI 模型提供商，根据任务需求灵活切换模型。

### 5.1 支持的提供商

| 提供商 | 模型标识符 | 协议/库 |
|--------|-----------|---------|
| OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` | OpenAI API |
| Anthropic | `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku` | Anthropic API |
| Google | `gemini-pro`, `gemini-ultra` | Google AI API |
| Meta | `llama-3-70b`, `llama-3-8b` | 自托管 / API |
| 阿里云 | `qwen-max`, `qwen-plus`, `qwen-turbo` | 通义千问 API |
| 百度 | `ernie-4.0`, `ernie-3.5` | 文心一言 API |
| 智谱 | `glm-4`, `glm-4v`, `glm-3-turbo` | 智谱开放平台 API |
| 深度求索 | `deepseek-chat`, `deepseek-coder` | DeepSeek API |
| 本地模型 | 任意 Ollama 模型 | Ollama 本地服务 |

### 5.2 配置多个模型

**环境变量方式：**

```bash
# .env 文件
LLM_PROVIDER_1_TYPE=openai
LLM_PROVIDER_1_API_KEY=sk-xxx
LLM_PROVIDER_1_MODEL=gpt-4o

LLM_PROVIDER_2_TYPE=anthropic
LLM_PROVIDER_2_API_KEY=sk-ant-xxx
LLM_PROVIDER_2_MODEL=claude-3-opus

LLM_PROVIDER_3_TYPE=deepseek
LLM_PROVIDER_3_API_KEY=sk-ds-xxx
LLM_PROVIDER_3_MODEL=deepseek-chat
```

**配置文件方式：**

```yaml
# config.yaml
llm:
  providers:
    - name: openai
      type: openai
      apiKey: ${OPENAI_API_KEY}
      model: gpt-4o
      params:
        temperature: 0.7
        maxTokens: 2048

    - name: claude
      type: anthropic
      apiKey: ${ANTHROPIC_API_KEY}
      model: claude-3-opus
      params:
        temperature: 0.5
        maxTokens: 4096

    - name: deepseek
      type: deepseek
      apiKey: ${DEEPSEEK_API_KEY}
      model: deepseek-chat
      params:
        temperature: 0.6

  default: openai
```

### 5.3 切换模型

**命令方式：**

```bash
# 临时切换模型
agent set-model gpt-4o-mini

# 查看当前模型
agent current-model

# 列出可用模型
agent list-models
```

**环境变量方式：**

```bash
# 设置默认模型
export LLM_DEFAULT_PROVIDER=claude

# 启动时指定模型
LLM_PROVIDER=deepseek agent start
```

### 5.4 模型参数配置

```javascript
const llm = require('./llm');

// 调用时指定参数
const response = await llm.call({
  prompt: '解释量子计算的基本原理',
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1024,
  topP: 0.95,
  stop: ['\n\n'],
});
```

### 5.5 获取模型信息

```javascript
// 获取所有可用模型
const models = await llm.listProviders();

// 获取模型能力详情
const info = await llm.getModelInfo('gpt-4o');
// 输出：
// {
//   provider: 'openai',
//   model: 'gpt-4o',
//   contextWindow: 128000,
//   maxOutputTokens: 4096,
//   supportsVision: true,
//   supportsFunctions: true,
//   supportsStreaming: true,
//   pricing: { input: 0.0025, output: 0.01 }, // 每千 token 价格（美元）
// }
```

### 5.6 模型选择建议

| 任务类型 | 推荐模型 | 理由 |
|----------|---------|------|
| 通用对话 | `gpt-4o` / `claude-3-sonnet` | 综合能力强，响应速度快 |
| 代码生成 | `deepseek-coder` / `gpt-4o` | 代码理解精准，上下文窗口大 |
| 长文本处理 | `gemini-ultra` / `claude-3-opus` | 超长上下文支持 |
| 视觉理解 | `gpt-4o` / `glm-4v` | 原生支持图片输入 |
| 成本敏感 | `qwen-turbo` / `deepseek-chat` | 性价比高，适合大批量任务 |
| 数据隐私 | 本地 Ollama 模型 | 数据不出本机，完全可控 |

---

## 六、联网搜索

联网搜索功能允许 Agent 实时从互联网获取信息，弥补知识截止日期的限制。

### 6.1 基本配置

```yaml
# config.yaml
search:
  enabled: true
  provider: duckduckgo    # 搜索提供商
  maxResults: 10           # 每次搜索返回的最大结果数
  timeout: 10000           # 搜索超时（毫秒）
  userAgent: "Mozilla/5.0 CogitoAgent/1.0"
```

### 6.2 搜索 URL 配置规则

支持自定义搜索结果 URL 模板，使用 `{query}` 和 `{page}` 占位符：

```yaml
search:
  urlTemplate: "https://www.google.com/search?q={query}&start={page}"
  customHeaders:
    Accept: "text/html,application/xhtml+xml"
    Accept-Language: "zh-CN,zh;q=0.9"
```

### 6.3 时效筛选

| 值 | 说明 |
|----|------|
| `all` | 不限时间（默认） |
| `day` | 过去 24 小时 |
| `week` | 过去一周 |
| `month` | 过去一个月 |
| `year` | 过去一年 |

### 6.4 站点筛选

```yaml
search:
  siteFilter:
    enabled: true
    include: ["github.com", "stackoverflow.com"]   # 只搜索指定站点
    exclude: ["spam-site.com", "example.com"]       # 排除指定站点
```

### 6.5 搜索使用

```javascript
const search = require('./search');

// 基本搜索
const results = await search.query('2026年科技趋势');

// 带选项的搜索
const refined = await search.query('Python异步编程', {
  maxResults: 5,
  timeRange: 'month',       // 过去一个月
  siteFilter: {
    include: ['github.com', 'docs.python.org'],
  },
  region: 'zh-CN',          // 地域偏好
});
```

### 6.6 搜索结果格式

```json
[
  {
    "title": "2026年十大科技趋势",
    "url": "https://example.com/tech-trends-2026",
    "snippet": "人工智能、量子计算和生物技术将引领2026年的科技发展方向……",
    "source": "example.com",
    "published": "2026-06-15",
    "relevance": 0.95
  },
  {
    "title": "Python异步编程完全指南",
    "url": "https://docs.python.org/3/library/asyncio.html",
    "snippet": "asyncio 是编写并发代码的库，使用 async/await 语法……",
    "source": "docs.python.org",
    "published": "2026-03-20",
    "relevance": 0.88
  }
]
```

### 6.7 搜索最佳实践

- **明确关键词：** 搜索关键词应具体明确，避免过于宽泛的查询。
- **合理设置超时：** 网络请求存在不确定性，建议超时时间设为 5~15 秒。
- **善用站点过滤：** 使用 `siteFilter` 缩小搜索范围，提高结果质量。
- **结合时效筛选：** 查询时效性内容（如新闻）时使用 `day` 或 `week` 筛选。
- **尊重速率限制：** 避免高频请求导致 IP 被封禁，建议添加请求间隔。
- **缓存常用结果：** 对同一查询的短时间重复请求可使用缓存，减少网络开销。

---

> 本文档涵盖了插件系统、MCP 协议、追踪模块、熔断器与重试、多模型支持和联网搜索六大扩展功能的详细说明。
> 如需更多帮助，请参考项目文档或提交 Issue。