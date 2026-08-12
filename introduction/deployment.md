# Deployment and Development / 部署与开发

> Detailed documentation: Docker deployment, development guide, testing, and contribution guide.
> 详细文档：Docker 部署、开发指南、测试与贡献指南。

---

## 1. Docker Deployment / 一、Docker 部署

### Environment Requirements / 环境要求

The following minimum environment is required to run CogitoAgent with Docker.

运行 CogitoAgent 的 Docker 环境需要满足以下最低要求。

- Docker Engine 20.10+
- Docker Compose v2.0+
- Minimum 2GB available memory / 最低 2GB 可用内存

### Quick Start / 快速开始

Clone the repository and start the service stack with Docker Compose.

克隆仓库并使用 Docker Compose 启动服务。

```bash
git clone https://gitee.com/cnt-code/cogito-agent.git
cd cogito-agent

docker compose up -d

docker compose ps
```

### Environment Variable Configuration / 环境变量配置

The following environment variables configure the runtime. Required variables must be provided.

以下环境变量用于配置运行时。必填变量必须提供。

| Variable / 变量名     | Description / 说明     | Default / 默认值 | Required / 是否必填                   |
| --------------------- | ---------------------- | ---------------- | ------------------------------------- |
| `NODE_ENV`            | Runtime environment    | `production`     | No / 否                               |
| `COGITO_API_BASE_URL` | LLM API base URL       | —                | Yes / 是                              |
| `COGITO_API_KEY`      | LLM API key            | —                | Yes / 是                              |
| `COGITO_MODEL`        | Default model name     | `gpt-4o`         | No / 否                               |
| `COGITO_WS_TOKEN`     | WebSocket access token | —                | **Yes / 是**（Docker 场景必需，见下） |
| `COGITO_WORKSPACE`    | Workspace path         | `./workspace`    | No / 否                               |
| `LOG_LEVEL`           | Log level              | `info`           | No / 否                               |

> 注意：`COGITO_WS_TOKEN` 在 Docker 部署中为**必填**——容器绑定 `0.0.0.0`，访问控制完全依赖该令牌；未设置时 docker-compose 会直接报错退出。日志级别变量名为 `LOG_LEVEL`（不是 `COGITO_LOG_LEVEL`）。

### Docker Compose Configuration / Docker Compose 配置

Below is a sample `docker-compose.yml` configuration for the agent service.

以下是 agent 服务的 `docker-compose.yml` 配置示例。

```yaml
version: '3.8'

services:
  cogito-agent:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: cogito-agent
    restart: unless-stopped
    ports:
      - '127.0.0.1:9527:9527' # WebSocket
      - '127.0.0.1:9528:9528' # 健康检查 HTTP
    environment:
      - NODE_ENV=production
      - COGITO_API_KEY=${COGITO_API_KEY:?COGITO_API_KEY is required}
      - COGITO_API_BASE_URL=${COGITO_API_BASE_URL:-https://api.openai.com/v1}
      - COGITO_MODEL=${COGITO_MODEL:-gpt-4o}
      - COGITO_WORKSPACE=/app/workspace
      - COGITO_WS_TOKEN=${COGITO_WS_TOKEN:?COGITO_WS_TOKEN is required}
    volumes:
      - ./config.json:/app/config.json:ro
      - cogito-data:/app/data
      - ${COGITO_WORKSPACE:-./workspace}:/app/workspace
    healthcheck:
      test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:9528/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

volumes:
  cogito-data:
    driver: local
```

> 以上即仓库根目录 `docker-compose.yml` 的实际内容。启动前需在 `.env` 中设置 `COGITO_API_KEY` 与 `COGITO_WS_TOKEN`（可先 `cp .env.example .env`）。

### Manual Build / 手动构建

Alternatively, build the image manually and run a container with the required environment variables.

你也可以手动构建镜像，并使用所需的环境变量运行容器。

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

## 2. Development Guide / 二、开发指南

### Local Development Environment / 本地开发环境

Set up the local development environment by cloning the repository and installing dependencies.

克隆仓库并安装依赖以搭建本地开发环境。

```bash
git clone https://gitee.com/cnt-code/cogito-agent.git
cd cogito-agent
npm install

npm run cli
```

### Development Mode / 开发模式

Start the application in development mode.

以开发模式启动应用。

```bash
npm start
```

### Build Desktop App / 构建桌面应用

Build the Electron desktop application for Windows.

构建 Windows 平台的 Electron 桌面应用。

```bash
npm run build:win
```

### Code Structure / 代码结构

The project is organized as follows.

项目目录结构如下。

```
cogito-agent/
├── src/
│   ├── agent/              # Core Agent logic
│   │   ├── Agent.ts        # Thinking loop
│   │   ├── state.ts        # State machine
│   │   ├── registry.ts     # Tool registration
│   │   ├── session.ts      # Session management
│   │   ├── commands.ts     # Command handling
│   │   ├── tools/          # 28+ tool modules
│   │   └── ...
│   ├── api/                # API layer
│   │   ├── client.ts       # LLM client
│   │   ├── models.ts       # Model management
│   │   └── webSearch.ts    # Web search
│   ├── io/                 # Input/output
│   │   ├── terminal.ts     # Terminal interaction
│   │   ├── logger.ts       # Logging
│   │   └── ws-server.ts    # WebSocket
│   ├── config.ts           # Configuration management
│   ├── types/              # TypeScript type definitions
│   └── index.ts            # Application entry
├── electron/               # Electron desktop app
├── personas/               # Preset personas
├── tests/                  # Test files
└── data/                   # Runtime data (auto-created)
```

### Configuration File / 配置文件

The development environment uses `config.json`, which is overridden by environment variables in production.

开发环境使用 `config.json`，生产环境使用环境变量覆盖。

```json
{
  "api": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "",
    "model": "gpt-4o"
  },
  "chat": {
    "maxHistoryLength": 100
  },
  "workspace": "./workspace",
  "tracing": {
    "enabled": true,
    "level": "info"
  }
}
```

---

## 3. Testing / 三、测试

### Run Tests / 运行测试

Execute the test suite with the following command.

使用以下命令运行测试套件。

```bash
npm test
```

### Test Coverage / 测试覆盖

The following modules are covered by tests.

以下模块均有对应的测试覆盖。

| Module / 模块      | Test File / 测试文件                                | Description / 说明                                    |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------- |
| Agent Engine       | `Agent.test.js`                                     | Thinking loop, state transitions, tool calls          |
| Config Management  | `config.test.ts`                                    | Env/file merging, MCP config, tool permissions (R5.2) |
| Command Handling   | `commands.test.ts`                                  | Command parsing, execution, result handling           |
| WebSocket          | `io-ws-server.test.ts`                              | Connection management, message routing, heartbeat     |
| Browser Tools      | `browser-tools.test.ts`                             | Browser automation tool invocation                    |
| Memory / Task / DB | `memory-tools.test.ts` / `cluster-tools.test.ts` 等 | 各工具模块测试                                        |

> 完整测试文件见 `tests/` 目录（unit + e2e，共 49 个测试文件 / 870+ 用例）。

### Testing Conventions / 测试规范

Follow these conventions when writing tests.

编写测试时请遵循以下规范。

- Use the Jest testing framework / 使用 Jest 测试框架
- Each tool module should have a corresponding test file / 每个工具模块应有对应的测试文件
- Test cases should cover both happy paths and edge cases / 测试用例应覆盖正常路径和边界情况

---

## 4. Contribution Guide / 四、贡献指南

### Contribution Steps / 贡献步骤

Contribute to the project by following these steps.

请按以下步骤为项目做出贡献。

1. **Fork the repository**: Click the Fork button on the project page. / **Fork 仓库**：点击项目页面的 Fork 按钮
2. **Create a branch**: Create a feature branch based on `main`. / **创建分支**：基于 `main` 分支创建功能分支
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Write code**: Follow the project's code conventions. / **编写代码**：遵循项目的代码规范
4. **Run tests**: Ensure all tests pass. / **运行测试**：确保所有测试通过
   ```bash
   npm test
   ```
5. **Submit a Pull Request**: Push your branch to the remote repository and open a PR. / **提交 Pull Request**：将分支推送至远程仓库并提交 PR

### Code Conventions / 代码规范

Adhere to the following code conventions.

请遵守以下代码规范。

- **Language**: Use TypeScript (ES6+). / **语言**：使用 TypeScript（ES6+）
- **Formatting**: Use Prettier, run `npm run format` before committing. / **格式化**：使用 Prettier，提交前运行 `npm run format`
- **Lint**: Use ESLint + TypeScript ESLint, run `npm run lint` before committing. / **Lint**：使用 ESLint + TypeScript ESLint，提交前运行 `npm run lint`
- **Naming**: / **命名**：
  - Variables / functions: `camelCase` / 变量/函数：`camelCase`
  - Classes: `PascalCase` / 类：`PascalCase`
  - Constants: `UPPER_SNAKE_CASE` / 常量：`UPPER_SNAKE_CASE`
  - Files: `kebab-case` / 文件：`kebab-case`
- **Commit messages**: Follow the Conventional Commits specification. / **提交信息**：遵循 Conventional Commits 规范
  - `feat(agent): 添加新工具`
  - `fix(session): 修复会话压缩问题`
  - `docs(readme): 更新文档`
- **Testing requirement**: New code must include corresponding test cases. / **测试要求**：新增代码必须包含对应的测试用例

### Development Tips / 开发建议

Recommended workflow for adding new tools and extending the project.

新增工具和扩展项目的推荐工作流。

1. **Tool development**: Create a new tool file under `src/agent/tools/`. / **工具开发**：在 `src/agent/tools/` 目录下创建新工具文件
2. **Tool registration**: Register the new tool in `registry.ts`. / **工具注册**：在 `registry.ts` 中注册新工具
3. **Update docs**: Update `introduction/tools.md` accordingly. / **文档更新**：同步更新 `introduction/tools.md`
4. **Write tests**: Add the corresponding test file under `tests/`. / **测试编写**：在 `tests/` 目录下添加对应的测试文件
