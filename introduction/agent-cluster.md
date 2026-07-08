# 智能体集群与监控面板

> 实时可视化智能体集群状态、思维链和工具使用统计。

---

## 1. 概述

CogitoAgent 支持**子智能体**（Sub-Agent）的创建和管理，实现多智能体协作。同时提供独立的**监控面板**窗口，用于实时可视化集群状态、思维链和工具使用统计。

![Agent Cluster](AgentCluster.png)

---

## 2. 智能体集群

### 2.1 子智能体管理

通过 `/spawn` 命令可以创建子智能体，当前支持以下创建方式：

| 命令 | 说明 |
|------|------|
| `/spawn` | 默认创建（无需指定参数） |
| `/spawn <name>` | 指定名称创建子智能体 |

子智能体创建后，主智能体可以对子智能体进行任务委派：

| 命令 | 说明 |
|------|------|
| `/delegate <agentId> <task>` | 向指定子智能体委派任务 |
| `/stop-agent <agentId>` | 停止指定子智能体 |
| `/stop-all` | 停止所有子智能体 |

### 2.2 集群状态

每个子智能体包含以下状态信息：

| 字段 | 说明 |
|------|------|
| `id` | 智能体唯一标识 |
| `name` | 智能体名称 |
| `persona` | 智能体人设 |
| `state` | 当前状态（idle / thinking / tool_executing / done / error） |
| `toolCalls` | 工具调用次数 |
| `iterationCount` | 思考迭代次数 |
| `lastActiveAt` | 最后活跃时间 |
| `hasError` / `error` | 错误信息 |

### 2.3 状态流转

```
idle → thinking → tool_executing → thinking → ... → done
  ↓                                                    ↓
  └────────────────── error ←──────────────────────────┘
```

- **idle**: 空闲状态，等待任务
- **thinking**: 正在思考/推理
- **tool_executing**: 正在执行工具
- **done**: 任务完成
- **error**: 执行出错

---

## 3. 监控面板

监控面板是一个独立的 Electron 窗口，提供三块实时可视化面板：

### 3.1 思维链（Thought Chain）

实时展示主智能体的思考过程，包含：

- **思考步骤名称**：当前正在执行的思考步骤
- **步骤详情**：关键参数或上下文信息
- **执行状态**：运行中 / 完成 / 失败
- **耗时**：每个步骤的执行时长

### 3.2 工具统计（Tool Statistics）

展示工具使用情况的统计数据和图表：

- **总调用次数**：所有工具累计调用次数
- **成功率**：工具执行成功率百分比
- **调用分布图**：ECharts 柱状图，按工具分类展示调用次数和成功率
  - 颜色深浅表示成功率高低
  - 悬停可查看详细信息

### 3.3 智能体集群（Agent Cluster）

实时展示集群拓扑和智能体详情：

- **拓扑图**：Canvas 绘制的环形拓扑图
  - 中心节点：主智能体
  - 环绕节点：子智能体
  - 连线表示通信关系
  - 活跃节点有脉冲光晕效果
- **智能体列表**：每个智能体的详细信息卡片
  - 状态标签（颜色区分）
  - Persona / 工具调用次数 / 迭代次数
  - 最后活跃时间
  - 错误信息（如有）

### 3.4 打开方式

在 Dashboard 主窗口侧边栏点击 **监控面板** 按钮，即可弹出独立的监控面板窗口（16:9 横向布局）。

---

## 4. 数据流

```
终端 Agent (WebSocket 9527)
    ↓
Agent Bridge (agent-bridge.js)
    ├── Dashboard 窗口
    └── 监控面板窗口 ← 同时接收所有实时消息
```

所有窗口通过 `initAgentBridge()` 注册到 `agent-bridge.js`，自动接收以下 IPC 消息：

- `thought-trace`：思维链步骤更新
- `stats-response`：工具统计信息
- `cluster-state`：集群状态更新

---

## 5. 技术实现

### 5.1 窗口管理

监控面板窗口由 Electron 主进程管理：

```javascript
// main.js - 创建监控面板窗口
function createMonitorWindow() {
  monitorWindow = new BrowserWindow({
    width: 960,
    height: 540,
    frame: false,
    backgroundColor: '#030712',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  });
  monitorWindow.loadFile(path.join(__dirname, 'monitor', 'index.html'));
  initAgentBridge(monitorWindow);
}
```

### 5.2 文件结构

```
electron/
├── monitor/                    # 监控面板
│   ├── index.html              # 页面结构（左右布局）
│   ├── style.css               # 暗色主题样式
│   └── renderer.js             # 渲染逻辑（ThoughtManager / StatsManager / ClusterManager）
├── main.js                     # 主进程（窗口管理 + IPC）
├── preload.cjs                 # 预加载脚本（IPC 桥接）
└── agent-bridge.js             # WebSocket 桥接（消息转发）
```

### 5.3 关键模块

- **ThoughtManager**：管理思维链追踪，按 add/update/clear 操作更新时间轴
- **StatsManager**：管理工具统计，包含 ECharts 图表初始化和定期刷新
- **ClusterManager**：管理集群状态，包含 Canvas 拓扑图绘制和智能体列表渲染