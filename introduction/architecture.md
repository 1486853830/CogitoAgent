# 架构设计详解

> 详细文档：核心组件、思考循环、工具调用流程、桌面模式架构与 WebSocket 通信。

---

## 1. 核心组件表

| 组件                 | 文件                  | 职责描述                                                                                     |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| **Agent 引擎**       | `Agent.ts`            | 思考循环主控制器，负责任务编排、状态转换、LLM 交互调度                                       |
| **状态管理**         | `state.ts`            | 集中式状态管理，维护 Agent 生命周期状态（THINKING / AWAITING_INPUT / AWAITING_CONFIRMATION） |
| **工具注册中心**     | `registry.ts`         | 工具注册与发现，管理所有可用工具的元数据、参数 schema 和执行句柄                             |
| **会话管理**         | `session.ts`          | 多会话隔离，管理对话上下文、历史记录和配置持久化，支持自动压缩                               |
| **命令执行器**       | `commands.ts`         | 将 Agent 决策转化为具体操作，执行工具调用并处理结果                                          |
| **安全沙箱**         | `sandbox.ts`          | 命令执行沙箱，提供安全的代码/命令执行环境，使用 `isolated-vm` 进程级隔离                     |
| **统计模块**         | `stats.ts`            | 工具使用追踪和性能指标，记录调用次数、耗时等统计数据                                         |
| **追踪模块**         | `tracing.ts`          | 轻量级可观测性，记录工具执行和 LLM 调用的详细追踪信息                                        |
| **集群命令**         | `cluster-commands.ts` | 子智能体管理，支持创建、委派、停止子智能体                                                   |
| **MCP Server**       | `mcp.ts`              | 将工具暴露为 MCP 协议，支持与其他 AI 客户端集成                                              |
| **插件系统**         | `plugin.ts`           | 动态加载自定义工具插件，扩展 Agent 能力                                                      |
| **WebSocket 服务器** | `ws-server.ts`        | 实时双向通信层，为 Electron 客户端和其他 WS 客户端提供消息通道（端口 9527）                  |

---

## 2. 模块关系图

```mermaid
flowchart TB
    subgraph Electron["Electron 主进程"]
        Main["main.js<br/>窗口管理"]
        Preload["preload.cjs<br/>IPC 桥接"]
        Bridge["agent-bridge.js<br/>Agent 通信桥"]
        WSServer["ws-server.ts<br/>WebSocket 服务<br/>端口: 9527"]
    end

    subgraph Subprocess["Agent 子进程"]
        Agent["Agent.ts<br/>思考循环"]
        State["state.ts<br/>状态管理"]
        Registry["registry.ts<br/>工具注册"]
        Session["session.ts<br/>会话管理"]
        Commands["commands.ts<br/>命令执行"]
        Sandbox["sandbox.ts<br/>安全沙箱"]
        Stats["stats.ts<br/>统计模块"]
        Tracing["tracing.ts<br/>追踪模块"]
        Cluster["cluster-commands.ts<br/>集群命令"]
        MCP["mcp.ts<br/>MCP Server"]
        Plugin["plugin.ts<br/>插件系统"]
    end

    subgraph External["外部接口"]
        LLM["LLM API"]
        Tools["工具集<br/>文件/终端/搜索等"]
        WSClient["自定义 WS 客户端"]
        MCPClient["MCP 客户端"]
    end

    Main --> Preload
    Preload --> Bridge
    Bridge --> WSServer

    Agent --> State
    Agent --> Registry
    Agent --> Session
    Agent --> Commands
    Agent --> Stats
    Agent --> Tracing
    Commands --> Sandbox
    Agent --> Cluster
    Registry --> Plugin
    Agent --> MCP

    WSServer <-->|"WebSocket<br/>JSON 消息"| Agent

    Agent <-->|"HTTP/SSE"| LLM
    Commands --> Tools
    WSClient <-->|"WebSocket"| WSServer
    MCPClient <-->|"MCP Protocol"| MCP
```

---

## 3. 思考循环（Think Cycle）

思考循环是 Agent 的核心运行机制，采用 **观察-思考-行动** 的迭代范式。每一轮循环中，Agent 会：

1. **感知输入**：从用户消息、系统事件或工具返回结果中获取上下文
2. **构建提示**：将当前状态、历史记录、可用工具 schema 组装为 LLM 提示
3. **调用 LLM**：向大模型发送请求，获取推理结果与行动决策
4. **解析响应**：从 LLM 输出中提取思考内容、工具调用或最终答案
5. **执行工具**：若 LLM 决定调用工具，则通过注册中心执行相应操作
6. **更新状态**：将结果写回会话上下文，更新状态机
7. **决定下一步**：判断是继续循环（工具结果待处理）还是输出最终响应

```mermaid
flowchart TD
    Start(["接收输入"]) --> Step1["感知输入<br/>• 用户消息<br/>• 工具返回结果<br/>• 系统事件"]
    Step1 --> Step2["构建提示<br/>• 系统提示词<br/>• 会话历史<br/>• 工具 Schema"]
    Step2 --> Step3["调用 LLM<br/>• 发送 API 请求<br/>• 流式/非流式"]
    Step3 --> Step4["解析响应<br/>• 提取思考内容<br/>• 识别工具调用<br/>• 检测终止条件"]

    Step4 --> Decide{"检测到<br/>工具调用？"}

    Decide -->|"是"| Step5["执行工具<br/>• 参数校验<br/>• 注册中心查找<br/>• 沙箱执行"]
    Step5 --> Step6["处理结果<br/>• 格式化工具输出<br/>• 更新会话上下文<br/>• 记录执行日志"]
    Step6 --> Step2

    Decide -->|"否"| Step7{"检测到<br/>最终答案？"}

    Step7 -->|"是"| Output(["输出最终响应"])
    Step7 -->|"否，继续思考"| Step2

    style Start fill:#4CAF50,color:#fff
    style Output fill:#2196F3,color:#fff
    style Decide fill:#FF9800,color:#fff
    style Step7 fill:#FF9800,color:#fff
```

---

## 4. 工具调用流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant Agent as Agent.ts
    participant State as state.ts
    participant LLM as LLM API
    participant Registry as registry.ts
    participant Cmd as commands.ts
    participant Sandbox as sandbox.ts
    participant Stats as stats.ts
    participant Tracing as tracing.ts
    participant Tool as 外部工具

    User->>Agent: 发送消息
    Agent->>State: 更新状态 → THINKING
    Agent->>Agent: 构建提示（含工具 Schema）
    Agent->>LLM: POST /chat/completions

    LLM-->>Agent: 返回工具调用请求

    alt 调用工具
        Agent->>Registry: 查找工具注册信息
        Registry-->>Agent: 返回工具句柄与参数 Schema
        Agent->>Tracing: 记录工具调用开始
        Agent->>Cmd: execute(command, params)
        Cmd->>Sandbox: 安全执行
        Sandbox->>Tool: 执行具体操作
        Tool-->>Sandbox: 返回执行结果
        Sandbox-->>Cmd: 返回格式化输出
        Cmd-->>Agent: 返回结果
        Agent->>Stats: 记录工具使用统计
        Agent->>Tracing: 记录工具调用结束

        Agent->>Agent: 解析结果，构建下一步提示
        Agent->>LLM: 发送工具结果与继续请求
        LLM-->>Agent: 返回最终答案（无工具调用）
    end

    Agent->>State: 更新状态 → AWAITING_INPUT
    Agent-->>User: 输出最终响应
```

---

## 5. 桌面模式消息流

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as Electron UI<br/>(Renderer)
    participant Bridge as preload.cjs<br/>IPC Bridge
    participant Main as main.js<br/>主进程
    participant WS as ws-server.ts<br/>WebSocket 服务
    participant Agent as Agent.ts<br/>子进程
    participant AI as LLM API

    User->>UI: 输入消息 / 点击操作
    UI->>Bridge: contextBridge.invoke("agent:message", payload)
    Bridge->>Main: ipcRenderer.invoke
    Main->>Main: agent-bridge.js 转发

    Main->>WS: ws.send(JSON message)
    WS->>Agent: on("message")
    Agent->>Agent: 解析消息，构建提示
    Agent->>AI: 发送 LLM 请求

    AI-->>Agent: 流式/非流式响应
    Agent-->>WS: ws.send(response)
    WS-->>Main: on("message")

    Main->>Bridge: event.sender.send("agent:response", data)
    Bridge->>UI: ipcRenderer.on("agent:response")
    UI-->>User: 渲染响应到界面
```

---

## 6. 状态机

```mermaid
stateDiagram-v2
    [*] --> IDLE: 初始化完成

    state IDLE {
        [*] --> AWAITING_INPUT
    }

    AWAITING_INPUT --> THINKING: 用户输入 / 系统事件

    state THINKING {
        [*] --> BUILDING_PROMPT: 构建提示
        BUILDING_PROMPT --> CALLING_LLM: 调用 LLM
        CALLING_LLM --> PARSING_RESPONSE: 解析响应
        PARSING_RESPONSE --> EXECUTING_TOOL: 检测到工具调用
        PARSING_RESPONSE --> FINALIZING: 检测到最终答案
        EXECUTING_TOOL --> BUILDING_PROMPT: 工具结果返回
        FINALIZING --> [*]
    }

    THINKING --> AWAITING_INPUT: 输出最终响应
    THINKING --> AWAITING_CONFIRMATION: 需要用户确认

    AWAITING_CONFIRMATION --> THINKING: 用户确认 / 拒绝
    AWAITING_CONFIRMATION --> AWAITING_INPUT: 用户取消 / 超时

    AWAITING_INPUT --> [*]: 会话结束
```

### 状态说明

| 状态                    | 说明                                               |
| ----------------------- | -------------------------------------------------- |
| `IDLE`                  | 初始空闲状态，等待输入                             |
| `AWAITING_INPUT`        | 等待用户输入消息或系统事件触发                     |
| `THINKING`              | Agent 正在思考循环中——构建提示、调用 LLM、执行工具 |
| `AWAITING_CONFIRMATION` | 等待用户确认高风险操作（如文件删除、命令执行等）   |

---

## 7. 桌面模式（Electron）

### 7.1 架构图

```mermaid
flowchart TB
    subgraph Renderer["Renderer Process（窗口）"]
        DesktopWin["Desktop Window<br/>主交互界面"]
        DashWin["Dashboard Window<br/>仪表盘"]
        SetupWin["Setup Window<br/>配置向导"]
    end

    subgraph MainProcess["Main Process"]
        MainJS["main.js<br/>• 窗口创建与生命周期<br/>• IPC 消息路由<br/>• 托盘与菜单"]
        Preload["preload.cjs<br/>• contextBridge<br/>• 安全 API 暴露"]
        AgentBridge["agent-bridge.js<br/>• 消息序列化/反序列化<br/>• 请求路由<br/>• 错误处理"]
        WSServer["ws-server.ts<br/>• WebSocket 服务端<br/>• 连接管理<br/>• 心跳检测"]
    end

    subgraph Subprocess["Subprocess"]
        Agent["Agent 引擎"]
    end

    DesktopWin -->|"contextBridge.invoke"| Preload
    DashWin -->|"contextBridge.invoke"| Preload
    SetupWin -->|"contextBridge.invoke"| Preload
    Preload -->|"ipcRenderer/ipcMain"| MainJS
    MainJS -->|"事件转发"| AgentBridge
    AgentBridge -->|"ws.send"| WSServer
    WSServer <-->|"WebSocket"| Agent
```

### 7.2 窗口

| 窗口                 | 文件             | 用途                                             |
| -------------------- | ---------------- | ------------------------------------------------ |
| **Desktop Window**   | `desktop.html`   | 主交互界面——用户输入、对话展示、实时流式输出     |
| **Dashboard Window** | `dashboard.html` | 仪表盘——会话概览、工具调用统计、运行状态监控     |
| **Setup Window**     | `setup.html`     | 配置向导——首次配置 API Key、模型、工作目录、角色 |

### 7.3 主要进程

#### `main.js` — 窗口管理器

- 创建和管理 Desktop、Dashboard、Setup 窗口实例
- 注册 IPC 通道（`ipcMain.handle` / `ipcMain.on`）
- 管理系统托盘、菜单栏和全局快捷键
- 控制窗口生命周期（创建、隐藏、显示、销毁）

#### `preload.cjs` — IPC 桥接

- 通过 `contextBridge.exposeInMainWorld` 安全暴露 API
- 定义白名单通道，限制渲染进程可调用的主进程方法
- 实现请求-响应模式的异步调用

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (payload) => ipcRenderer.invoke('agent:message', payload),
  onResponse: (callback) => ipcRenderer.on('agent:response', (_event, data) => callback(data)),
});
```

#### `agent-bridge.js` — Agent 通信桥

- 作为主进程与 Agent 子进程之间的中间层
- 负责消息的序列化/反序列化、协议转换
- 请求超时管理、错误重试策略
- 统一消息路由：将渲染进程请求转发至 WebSocket，并将响应回传

#### `ws-server.ts` — WebSocket 服务

详见第 8 节。

### 7.4 窗口特性

| 特性                          | 说明                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Frameless（无边框）**       | `frame: false`，自定义标题栏和拖拽区域，实现沉浸式 UI                                                   |
| **Transparent（透明）**       | `transparent: true`，配合 CSS `background: transparent`，实现圆角、阴影等视觉效果                       |
| **AlwaysOnTop（置顶）**       | `alwaysOnTop: true`，窗口始终保持在最上层，方便快捷访问                                                 |
| **Click-Through（点击穿透）** | 通过 `win.setIgnoreMouseEvents(true, { forward: true })` 实现，在特定模式下鼠标事件可穿透窗口到下层应用 |

---

## 8. WebSocket 通信详解

### 8.1 WebSocket 服务器

`ws-server.ts` 是基于 `ws` 库构建的 WebSocket 服务端，作为 Agent 与外部客户端（Electron 主进程、自定义客户端）的实时通信桥梁，默认监听端口 **9527**。

#### 核心功能

| 功能         | 说明                                     |
| ------------ | ---------------------------------------- |
| **连接管理** | 维护活跃客户端列表，处理连接/断开事件    |
| **消息路由** | 基于 `action` 字段分发消息到对应处理器   |
| **心跳检测** | 定时 ping/pong 检测客户端存活状态        |
| **重连支持** | 客户端断线后自动重连，服务端保持会话状态 |
| **广播**     | 支持向所有或指定客户端广播消息           |

#### 消息格式

```json
{
  "action": "message_action",
  "id": "req-uuid-xxxx",
  "timestamp": "2026-07-05T10:30:00.000Z",
  "payload": {
    "content": "消息内容",
    "sessionId": "session-uuid",
    "metadata": {}
  }
}
```

| 字段        | 类型   | 说明                       |
| ----------- | ------ | -------------------------- |
| `action`    | string | 消息动作类型               |
| `id`        | string | 请求唯一标识，用于响应关联 |
| `timestamp` | string | ISO 8601 时间戳            |
| `payload`   | object | 消息体，存放具体数据       |

#### 消息类型

| 方向            | action            | 说明                   |
| --------------- | ----------------- | ---------------------- |
| Client → Server | `user:message`    | 用户发送消息           |
| Client → Server | `session:create`  | 创建新会话             |
| Client → Server | `session:switch`  | 切换会话               |
| Client → Server | `session:delete`  | 删除会话               |
| Client → Server | `session:rename`  | 重命名会话             |
| Client → Server | `tool:confirm`    | 确认工具执行           |
| Client → Server | `tool:reject`     | 拒绝工具执行           |
| Server → Client | `agent:thinking`  | Agent 开始思考         |
| Server → Client | `agent:response`  | Agent 输出响应         |
| Server → Client | `agent:tool_call` | Agent 请求工具调用确认 |
| Server → Client | `agent:error`     | Agent 发生错误         |
| Server → Client | `session:list`    | 返回会话列表           |
| System          | `ping` / `pong`   | 心跳检测               |

### 8.2 Electron 客户端连接流程

```mermaid
sequenceDiagram
    participant Main as main.js
    participant Bridge as agent-bridge.js
    participant WS as ws-server.ts
    participant Agent as Agent.ts

    Main->>Bridge: 初始化 AgentBridge
    Bridge->>WS: new WebSocket("ws://localhost:9527")

    activate WS
    WS-->>Bridge: on("open") — 连接成功
    Bridge->>WS: ws.send({ action: "handshake", ... })
    WS-->>Bridge: on("message") — 握手确认

    loop 心跳
        Bridge->>WS: ws.send({ action: "ping" })
        WS-->>Bridge: { action: "pong" }
    end

    Note over Bridge,WS: IPC 桥接层

    Main->>Bridge: agent-bridge.send(request)
    Bridge->>WS: ws.send(JSON.stringify(message))
    WS->>Agent: 转发消息

    Agent->>WS: 发送响应
    WS-->>Bridge: on("message")
    Bridge-->>Main: 返回响应

    deactivate WS
```

#### IPC 桥接

Electron 渲染进程不能直接访问 WebSocket，而是通过以下链路通信：

```
Renderer (contextBridge)
    → ipcRenderer.invoke → ipcMain.handle
        → agent-bridge.js → ws.send
            → ws-server.ts → Agent
```

### 8.3 自定义 WebSocket 客户端示例

```javascript
import WebSocket from 'ws';

class AgentClient {
  constructor(url = 'ws://localhost:9527') {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.reconnectInterval = 3000;
    this.heartbeatInterval = 25000;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('[AgentClient] 连接已建立');
      this._startHeartbeat();
      this.emit('connected');
    });

    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      this.emit(msg.action, msg.payload, msg);
    });

    this.ws.on('close', () => {
      console.log('[AgentClient] 连接断开，准备重连...');
      this._stopHeartbeat();
      setTimeout(() => this.connect(), this.reconnectInterval);
    });

    this.ws.on('error', (err) => {
      console.error('[AgentClient] 连接错误:', err.message);
    });
  }

  send(action, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        action,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        payload,
      });
      this.ws.send(message);
    }
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  emit(event, ...args) {
    const handler = this.handlers.get(event);
    if (handler) handler(...args);
  }

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send('ping');
    }, this.heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  disconnect() {
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

const client = new AgentClient('ws://localhost:9527');

client.on('connected', () => {
  console.log('已连接到 Agent');
  client.send('user:message', { content: 'Hello Agent!' });
});

client.on('agent:response', (payload) => {
  console.log('Agent:', payload.content);
});

client.on('agent:tool_call', (payload) => {
  console.log('Agent 请求执行工具:', payload.tool);
  client.send('tool:confirm', { requestId: payload.id });
});

client.connect();
```

### 8.4 WebSocket 配置

| 配置项              | 默认值             | 说明                               |
| ------------------- | ------------------ | ---------------------------------- |
| `port`              | `9527`             | WebSocket 服务监听端口             |
| `reconnectInterval` | `3000` ms          | 客户端断线重连间隔                 |
| `heartbeatInterval` | `25000` ms         | 心跳检测间隔（服务端 ping 客户端） |
| `heartbeatTimeout`  | `10000` ms         | 心跳超时时间，超时则判定连接断开   |
| `maxPayload`        | `10 * 1024 * 1024` | 最大消息负载（字节），默认 10 MB   |
| `maxClients`        | `100`              | 最大并发客户端连接数               |

---

## 9. 会话管理

### 9.1 会话结构

每个会话包含独立的对话上下文，支持自动压缩和持久化存储。

```javascript
{
  id: 'session-uuid',
  name: '会话名称',
  createdAt: '2026-07-05T10:00:00.000Z',
  updatedAt: '2026-07-05T10:30:00.000Z',
  messages: [...],
  config: { model: 'gpt-4o', persona: 'developer' },
  metadata: { }
}
```

### 9.2 上下文压缩

当会话历史超过配置的最大长度时，自动触发压缩：

- 使用 LLM 总结早期对话
- 保留最近 N 条消息
- 将总结作为上下文前缀

---

## 10. 工具分类按需加载

工具注册表支持按分类按需加载，减少启动时间和内存占用：

```javascript
const TOOL_CATEGORIES = {
  file: ['file.ts', 'path.ts'],
  web: ['web.ts', 'browser.ts'],
  code: ['code.ts', 'sandbox.ts'],
  git: ['git.ts'],
  database: ['db.ts', 'data.ts'],
  // ...
};
```

---

> 本文档覆盖了 Cogito Agent 的核心架构设计，包括组件职责、模块关系、思考循环机制、工具调用流程、桌面模式架构以及 WebSocket 通信细节，为开发和集成提供完整的架构参考。
