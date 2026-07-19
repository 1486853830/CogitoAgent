# 部署与开发

> 详细文档：Docker 部署、开发指南、测试与贡献指南。

---

## 一、Docker 部署

### 环境要求

- Docker Engine 20.10+
- Docker Compose v2.0+
- 最低 2GB 可用内存

### 快速开始

```bash
git clone https://gitee.com/cnt-code/cogito-agent.git
cd cogito-agent

docker compose up -d

docker compose ps
```

### 环境变量配置

| 变量名 | 说明 | 默认值 | 是否必填 |
|--------|------|--------|----------|
| `NODE_ENV` | 运行环境 | `production` | 否 |
| `COGITO_API_BASE_URL` | LLM API 基础地址 | — | 是 |
| `COGITO_API_KEY` | LLM API 密钥 | — | 是 |
| `COGITO_MODEL` | 默认模型名称 | `gpt-4o` | 否 |
| `COGITO_WORKSPACE` | 工作目录路径 | `./workspace` | 否 |
| `COGITO_LOG_LEVEL` | 日志级别 | `info` | 否 |

### Docker Compose 配置

```yaml
version: "3.8"

services:
  agent:
    image: cogito-agent:latest
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ./data:/app/data
      - ./workspace:/app/workspace
    environment:
      - NODE_ENV=production
      - COGITO_API_BASE_URL=${COGITO_API_BASE_URL}
      - COGITO_API_KEY=${COGITO_API_KEY}
      - COGITO_MODEL=${COGITO_MODEL:-gpt-4o}
      - COGITO_WORKSPACE=/app/workspace
    restart: unless-stopped
```

### 手动构建

```bash
docker build -t cogito-agent:latest .

docker run -d \
  --name cogito-agent \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/workspace:/app/workspace \
  -e COGITO_API_BASE_URL="https://api.openai.com/v1" \
  -e COGITO_API_KEY="your-api-key" \
  -e COGITO_MODEL="gpt-4o" \
  cogito-agent:latest
```

---

## 二、开发指南

### 本地开发环境

```bash
git clone https://gitee.com/cnt-code/cogito-agent.git
cd cogito-agent
npm install

npm run cli
```

### 开发模式

```bash
npm run dev
```

### 构建桌面应用

```bash
npm run electron:build
```

### 代码结构

```
cogito-agent/
├── src/
│   ├── agent/              # 核心 Agent 逻辑
│   │   ├── Agent.ts        # 思考循环
│   │   ├── state.ts        # 状态机
│   │   ├── registry.ts     # 工具注册
│   │   ├── session.ts      # 会话管理
│   │   ├── commands.ts     # 命令处理
│   │   ├── tools/          # 工具模块
│   │   └── ...
│   ├── api/                # API 层
│   │   ├── client.ts       # LLM 客户端
│   │   ├── models.ts       # 模型管理
│   │   └── webSearch.ts    # 网络搜索
│   ├── io/                 # 输入输出
│   │   ├── terminal.ts     # 终端交互
│   │   ├── logger.ts       # 日志
│   │   └── ws-server.ts    # WebSocket
│   ├── config.ts           # 配置管理
│   ├── types/              # TypeScript 类型定义
│   └── index.ts            # 应用入口
├── electron/               # Electron 桌面应用
├── personas/               # 预设角色
├── tests/                  # 测试文件
└── data/                   # 运行时数据（自动创建）
```

### 配置文件

开发环境使用 `config.json`，生产环境使用环境变量覆盖：

```json
{
  "api": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "",
    "model": "gpt-4o"
  },
  "workspace": "./workspace",
  "thinkingInterval": 3000,
  "maxHistoryLength": 100,
  "tracing": {
    "enabled": true,
    "level": "info"
  }
}
```

---

## 三、测试

### 运行测试

```bash
npm test
```

### 测试覆盖

| 模块 | 测试文件 | 说明 |
|------|----------|------|
| Agent 引擎 | `agent.test.js` | 思考循环、状态转换、工具调用 |
| 工具注册 | `registry.test.js` | 工具注册、参数校验、分类加载 |
| 会话管理 | `session.test.js` | 多会话、上下文压缩、持久化 |
| 命令处理 | `commands.test.js` | 命令解析、执行、结果处理 |
| WebSocket | `ws-server.test.js` | 连接管理、消息路由、心跳检测 |

### 测试规范

- 使用 Jest 测试框架
- 每个工具模块应有对应的测试文件
- 测试用例应覆盖正常路径和边界情况

---

## 四、贡献指南

### 贡献步骤

1. **Fork 仓库**：点击项目页面的 Fork 按钮
2. **创建分支**：基于 `main` 分支创建功能分支
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **编写代码**：遵循项目的代码规范
4. **运行测试**：确保所有测试通过
   ```bash
   npm test
   ```
5. **提交 Pull Request**：将分支推送至远程仓库并提交 PR

### 代码规范

- **语言**：使用 TypeScript（ES6+）
- **格式化**：使用 Prettier，提交前运行 `npm run format`
- **Lint**：使用 ESLint + TypeScript ESLint，提交前运行 `npm run lint`
- **命名**：
  - 变量/函数：`camelCase`
  - 类：`PascalCase`
  - 常量：`UPPER_SNAKE_CASE`
  - 文件：`kebab-case`
- **提交信息**：遵循 Conventional Commits 规范
  - `feat(agent): 添加新工具`
  - `fix(session): 修复会话压缩问题`
  - `docs(readme): 更新文档`
- **测试要求**：新增代码必须包含对应的测试用例

### 开发建议

1. **工具开发**：在 `src/agent/tools/` 目录下创建新工具文件
2. **工具注册**：在 `registry.ts` 中注册新工具
3. **文档更新**：同步更新 `introduction/tools.md`
4. **测试编写**：在 `tests/` 目录下添加对应的测试文件