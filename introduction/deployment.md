# 部署与开发

> 详细文档：Docker 部署、CI/CD 集成、测试指南与贡献指南。

---

## 一、Docker 部署

### 环境要求

- Docker Engine 20.10+
- Docker Compose v2.0+
- Node.js 18+（仅本地开发时需要）
- 最低 2GB 可用内存

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/your-project.git
cd your-project

# 2. 复制环境配置
cp .env.example .env

# 3. 使用 Docker Compose 启动所有服务
docker compose up -d

# 4. 查看运行状态
docker compose ps
```

### 环境变量配置

| 变量名 | 说明 | 默认值 | 是否必填 |
|--------|------|--------|----------|
| `NODE_ENV` | 运行环境 | `production` | 否 |
| `PORT` | 应用监听端口 | `3000` | 否 |
| `DATABASE_URL` | 数据库连接字符串 | — | 是 |
| `REDIS_URL` | Redis 连接字符串 | — | 是 |
| `JWT_SECRET` | JWT 签名密钥 | — | 是 |
| `LOG_LEVEL` | 日志级别 | `info` | 否 |
| `API_RATE_LIMIT` | API 速率限制（次/分钟） | `100` | 否 |

### 手动构建

```bash
# 构建镜像
docker build -t your-project:latest .

# 运行容器
docker run -d \
  --name your-project \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e JWT_SECRET="your-secret-key" \
  your-project:latest
```

### Docker Compose 生产配置

```yaml
version: "3.8"

services:
  app:
    image: your-project:latest
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/project
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=project
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

---

## 二、CI/CD 集成

### 工作流文件一览

| 文件名 | 触发条件 | 主要职责 |
|--------|----------|----------|
| `ci.yml` | push / PR（任意分支） | 代码检查、单元测试、构建验证 |
| `release.yml` | tag 推送（v*） | 构建镜像、推送仓库、自动部署 |

### 使用步骤

1. 将项目推送至 GitHub（或 GitLab）仓库。
2. GitHub Actions（或对应 CI 平台）会自动检测 `.github/workflows/` 下的配置文件。
3. 每次提交代码时，`ci.yml` 自动执行 lint、测试与构建。
4. 当维护者推送形如 `v1.2.3` 的标签时，`release.yml` 触发自动发布流程。

### 流水线说明

**CI 流水线（ci.yml）**
- **lint**：运行 ESLint / Prettier 检查代码风格。
- **test**：执行单元测试并生成覆盖率报告。
- **build**：验证项目能否成功构建。
- **cache**：缓存 `node_modules` 和 Docker 层，加速后续运行。

**发布流水线（release.yml）**
- **build**：基于 `Dockerfile` 构建生产镜像。
- **push**：将镜像推送至容器注册表（Docker Hub / GitHub Container Registry）。
- **deploy**：通过 SSH 或 Kubernetes 触发远程服务器更新。

---

## 三、测试

### 运行测试

```bash
# 运行所有单元测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行端到端测试
npm run test:e2e

# 以监听模式运行测试（开发时使用）
npm run test:watch
```

### 测试覆盖情况

| 模块 | 测试文件数 | 用例数 | 覆盖率 |
|------|-----------|--------|--------|
| 核心模块（core/） | 12 | 156 | 98% |
| API 路由（routes/） | 8 | 89 | 95% |
| 数据模型（models/） | 6 | 72 | 97% |
| 工具函数（utils/） | 10 | 103 | 99% |
| 中间件（middleware/） | 4 | 41 | 96% |
| **总计** | **40** | **461** | **97%** |

### 端到端测试

E2E 测试覆盖关键用户流程，确保系统各模块集成正常工作。主要测试文件：

- **`websocket.test.js`**：验证 WebSocket 连接的建立、消息收发、断线重连及心跳机制。
- **`agent-flow.test.js`**：验证智能体从任务创建、执行到完成的全流程，包括状态转换与结果回调。

### E2E 覆盖范围

- 用户注册与登录流程
- WebSocket 实时通信
- 智能体任务的全生命周期
- API 鉴权与权限校验
- 数据持久化与查询
- 错误处理与边界场景

---

## 四、贡献指南

### 贡献步骤

1. **Fork 仓库**：点击项目页面的 Fork 按钮，将仓库复制到你的账户下。
2. **创建分支**：基于 `main` 分支创建功能分支，命名建议为 `feat/xxx`、`fix/xxx` 或 `docs/xxx`。
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **编写代码**：遵循项目的代码规范，确保代码风格一致。
4. **运行测试**：确保所有现有测试通过，并为新增功能编写相应测试。
   ```bash
   npm test
   npm run test:e2e
   ```
5. **提交 Pull Request**：将你的分支推送至远程仓库，然后向原仓库提交 PR。
   ```bash
   git push origin feat/your-feature-name
   ```
6. **等待审核**：维护者会审核你的代码，可能需要根据反馈进行调整。

### 代码规范

- **语言**：使用 TypeScript 编写，严格模式下运行。
- **格式化**：使用 Prettier 统一代码格式，提交前运行 `npm run format`。
- **Lint**：ESLint 配置遵循 Airbnb 风格指南，提交前运行 `npm run lint`。
- **命名**：
  - 变量/函数：使用 `camelCase`。
  - 类/接口：使用 `PascalCase`。
  - 常量：使用 `UPPER_SNAKE_CASE`。
  - 文件：使用 `kebab-case`（如 `user-service.ts`）。
- **提交信息**：遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范，格式为 `类型(作用域): 描述`，例如：
  - `feat(auth): 添加邮箱登录功能`
  - `fix(api): 修复分页参数越界问题`
  - `docs(readme): 更新快速开始说明`
- **测试要求**：新增代码必须包含对应的单元测试，关键路径需包含 E2E 测试。