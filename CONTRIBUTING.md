# Contributing to CogitoAgent

> 感谢你有兴趣为 CogitoAgent 做出贡献！我们欢迎各种形式的贡献，包括但不限于代码、文档、测试、bug 报告和功能建议。
>
> Thanks for your interest in contributing to CogitoAgent! We welcome contributions of all kinds, including but not limited to code, documentation, tests, bug reports, and feature suggestions.

---

## Table of Contents / 目录

- [How to Contribute / 如何贡献](#how-to-contribute--如何贡献)
- [Development Setup / 开发环境搭建](#development-setup--开发环境搭建)
- [Development Workflow / 开发流程](#development-workflow--开发流程)
- [Code Standards / 代码规范](#code-standards--代码规范)
- [Commit Message Guidelines / 提交信息规范](#commit-message-guidelines--提交信息规范)
- [Testing / 测试](#testing--测试)
- [Project Structure / 项目结构](#project-structure--项目结构)
- [Communication / 沟通](#communication--沟通)

---

## How to Contribute / 如何贡献

### 1. 寻找任务 / Find a Task

- 查看 [Issues](https://github.com/SnowLeopard-io/CogitoAgent/issues) 页面，寻找标有 `good first issue` 或 `help wanted` 标签的任务
- 如果你有新的想法或发现了 bug，可以先创建一个 Issue 进行讨论

- Check the [Issues](https://github.com/SnowLeopard-io/CogitoAgent/issues) page for tasks labeled with `good first issue` or `help wanted`
- If you have new ideas or find bugs, create an Issue to discuss first

### 2. Fork 仓库 / Fork the Repository

点击 GitHub 页面右上角的 **Fork** 按钮，将仓库克隆到你的账户下。

Click the **Fork** button in the upper right corner of the GitHub page to clone the repository to your account.

### 3. 创建分支 / Create a Branch

从 `main` 分支创建一个新分支，分支命名遵循以下规则：

Create a new branch from the `main` branch, following these naming conventions:

```bash
git checkout -b feature/your-feature-name   # 新功能 / New feature
git checkout -b fix/your-bug-fix            # Bug 修复 / Bug fix
git checkout -b docs/your-documentation     # 文档更新 / Documentation update
git checkout -b refactor/your-refactoring   # 代码重构 / Code refactoring
```

---

## Development Setup / 开发环境搭建

### 环境要求 / Requirements

- **Node.js** 22.12 或更高版本 / 22.12 or higher
- **npm** 或 **yarn** 包管理器 / or yarn package manager
- **Python** 3.x（可选，用于 Python 代码执行）/ (optional, for Python code execution)

### 安装步骤 / Installation

```bash
# 克隆你的 fork / Clone your fork
git clone https://github.com/your-username/CogitoAgent.git
cd CogitoAgent

# 安装依赖 / Install dependencies
npm install
```

### 国内用户注意 / Note for Users in China

如果 `npm install` 下载 Electron 失败，请设置国内镜像：

If `npm install` fails to download the Electron binary, set the Chinese mirror:

```bash
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install
```

### 启动开发模式 / Start Development

```bash
npm start              # 启动设置向导 / Start setup wizard
npm run cli            # CLI 模式 / CLI mode
npm run electron:desktop    # 桌面悬浮窗口模式 / Desktop floating window mode
npm run electron:dashboard  # 仪表盘模式 / Dashboard mode
```

---

## Development Workflow / 开发流程

1. **同步上游代码 / Sync with Upstream**

   在开始工作前，确保你的 fork 与原始仓库保持同步：

   Before starting work, ensure your fork is synchronized with the original repository:

   ```bash
   git remote add upstream https://github.com/SnowLeopard-io/CogitoAgent.git
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **编写代码 / Write Code**

   - 遵循项目的代码规范（见下文）/ Follow the project's code standards (see below)
   - 为新增功能编写测试 / Write tests for new features
   - 更新相关文档 / Update relevant documentation

3. **提交代码 / Commit Changes**

   ```bash
   git add .
   git commit -m "feat: add new feature"  # 使用规范的提交信息 / Use standard commit message
   ```

4. **推送到远程 / Push to Remote**

   ```bash
   git push origin feature/your-feature-name
   ```

5. **创建 Pull Request / Create a Pull Request**

   在 GitHub 上打开你的 fork，点击 **Compare & pull request** 按钮，填写 PR 描述并提交。

   Open your fork on GitHub, click the **Compare & pull request** button, fill in the PR description, and submit.

---

## Code Standards / 代码规范

### TypeScript

- 核心模块使用 TypeScript（`.ts` 扩展名）/ Core modules use TypeScript (`.ts` extension)
- 保持类型安全，避免 `any` 类型 / Maintain type safety, avoid `any` type
- 导出类型定义到 `src/types/index.ts` / Export type definitions to `src/types/index.ts`

### 代码风格 / Code Style

项目使用 ESLint + Prettier 进行代码检查和格式化：

The project uses ESLint + Prettier for code checking and formatting:

```bash
npm run lint           # 运行 ESLint 检查并自动修复 / Run ESLint and auto-fix
npm run lint:check     # 仅检查，不自动修复 / Check only, no auto-fix
npm run format         # 使用 Prettier 格式化代码 / Format code with Prettier
npm run typecheck      # TypeScript 类型检查 / TypeScript type check
```

### 提交前检查 / Pre-commit Checks

项目使用 Husky 配置了 pre-commit 钩子，提交前会自动运行：

The project uses Husky for pre-commit hooks, which automatically run before commits:

- ESLint 检查 / ESLint check
- Prettier 格式化 / Prettier formatting

### 命名规范 / Naming Conventions

| 类型 / Type                 | 格式 / Format                  | 示例 / Example             |
| --------------------------- | ------------------------------ | -------------------------- |
| 文件 / File                 | kebab-case                     | `tool-parser.ts`           |
| 类 / Class                  | PascalCase                     | `class Agent { }`          |
| 函数/方法 / Function/Method | camelCase                      | `executeTool()`            |
| 变量 / Variable             | camelCase                      | `sessionId`                |
| 常量 / Constant             | UPPER_SNAKE_CASE               | `MAX_TOKEN_LIMIT`          |
| 接口 / Interface            | PascalCase + `I` 前缀 / prefix | `interface IToolEntry { }` |

---

## Commit Message Guidelines / 提交信息规范

提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

Commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

<body>

<footer>
```

### 类型 / Types

| 类型 / Type | 说明 / Description                                         |
| ----------- | ---------------------------------------------------------- |
| `feat`      | 新功能 / New feature                                       |
| `fix`       | Bug 修复 / Bug fix                                         |
| `docs`      | 文档更新 / Documentation update                            |
| `style`     | 代码风格（不影响功能）/ Code style (no functional changes) |
| `refactor`  | 代码重构 / Refactoring                                     |
| `test`      | 测试相关 / Tests                                           |
| `chore`     | 构建/工具更新 / Build/tooling updates                      |

### 示例 / Examples

```
feat(tools): add GIS coordinate conversion tools

- add convertCoord() for coordinate system conversion
- add calcDistance() for distance calculation
- add calcArea() for area calculation
```

```
fix(session): resolve session creation failure

- route metadata writes through Electron main process
- fix permission issue with data directory
```

```
feat(tools): 添加 GIS 坐标转换工具

- 添加 convertCoord() 用于坐标系转换
- 添加 calcDistance() 用于距离计算
- 添加 calcArea() 用于面积计算
```

```
fix(session): 修复会话创建失败问题

- 通过 Electron 主进程路由元数据写入
- 修复数据目录权限问题
```

---

## Testing / 测试

### 运行测试 / Run Tests

```bash
npm test               # 运行所有测试 / Run all tests
npm run test:e2e       # 仅运行 E2E 测试 / Run E2E tests only
```

### 测试覆盖 / Test Coverage

- 新增功能必须编写对应的单元测试 / New features must have corresponding unit tests
- 修复 bug 时应添加回归测试 / Add regression tests when fixing bugs
- 保持测试覆盖率稳定 / Maintain stable test coverage

### 测试文件结构 / Test File Structure

```
tests/
├── unit/              # 单元测试 / Unit tests
│   ├── config.test.ts
│   ├── session.test.ts
│   └── ...
└── e2e/               # E2E 测试 / E2E tests
    ├── agent-flow.test.js
    └── websocket.test.js
```

---

## Project Structure / 项目结构

```
cogito-agent/
├── src/                              # 源代码（TypeScript）/ Source code (TypeScript)
│   ├── agent/                        # 核心 agent 模块 / Core agent module
│   │   ├── Agent.ts / state.ts / registry.ts
│   │   ├── commands.ts / session.ts / stats.ts
│   │   ├── mcp.ts / plugin.ts / thought-trace.ts / retry.ts
│   │   ├── wechat-manager.ts         # 微信通道管理 / WeChat channel management
│   │   └── tools/                    # 工具模块 / Tool modules
│   ├── api/                          # API 层 / API layer (client, models, webSearch)
│   ├── io/                           # Terminal, Logger, WebSocket
│   ├── config.ts                     # 配置管理 / Configuration management
│   ├── types/                        # TypeScript 类型定义 / TypeScript type definitions
│   └── index.ts                      # 应用入口 / Application entry
├── electron/                         # 桌面模式（JavaScript）/ Desktop mode (JavaScript)
│   ├── main.js / preload.cjs / agent-bridge.js
│   ├── desktop/ / dashboard/ / monitor/ / setup/
│   └── shared/                       # 共享工具组件 / Shared utility components
├── personas/                         # 预设角色 / Preset personas
├── tests/                            # 测试文件 / Test files
├── introduction/                     # 详细文档 / Detailed documentation
└── docs/                             # API 文档 / API documentation
```

---

## Communication / 沟通

- **GitHub Issues**: 报告 bug、提出功能建议 / Report bugs, suggest new features
- **GitHub Discussions**: 讨论使用问题、分享想法 / Discuss usage issues, share ideas
- **Pull Requests**: 代码审查和讨论 / Code review and discussion

---

## License / 许可证

所有贡献都将在 [Apache 2.0](LICENSE) 许可证下发布。

All contributions will be released under the [Apache 2.0](LICENSE) license.

---

感谢你的贡献！🎉

Thanks for your contribution! 🎉
