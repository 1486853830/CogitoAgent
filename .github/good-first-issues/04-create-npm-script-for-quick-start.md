---
title: '[Good First Issue] 添加 npm run quickstart 一键启动脚本 / Add npm run quickstart Script'
labels: ['good first issue', 'enhancement', 'area: agent-core']
---

## 任务描述 / Task Description

目前新用户需要先运行 `npm start`（设置向导），再运行 `npm run cli` 才能使用。建议添加一个 `npm run quickstart` 脚本，自动完成首次配置并启动 CLI 模式。
Currently, new users must first run `npm start` (setup wizard) and then `npm run cli` to start using the tool. It is recommended to add an `npm run quickstart` script that automatically completes the initial configuration and launches CLI mode.

### 实现方案 / Implementation Plan

在 `package.json` 的 `scripts` 中添加：
Add the following to the `scripts` section of `package.json`:

```json
"quickstart": "node dist/index.js --quickstart"
```

并在 `src/index.ts` 中添加 `--quickstart` 参数支持：
And add `--quickstart` argument support in `src/index.ts`:

- 如果检测到没有 `config.json`，自动使用默认配置创建 / If no `config.json` is detected, automatically create one with default configuration
- 跳过交互式设置向导，直接启动 CLI 模式 / Skip the interactive setup wizard and launch directly into CLI mode
- 默认使用 `.env.example` 中的环境变量（如果存在）/ Use environment variables from `.env.example` by default (if it exists)

### 文件修改 / Files to Modify

- `package.json` - 添加脚本 / Add the script
- `src/index.ts` - 添加 `--quickstart` 参数处理 / Add `--quickstart` argument handling
- `src/setup.ts` - 添加自动配置方法（可选）/ Add auto-configuration method (optional)

### 验收标准 / Acceptance Criteria

- [ ] `npm run quickstart` 能直接启动 CLI 模式 / `npm run quickstart` directly launches CLI mode
- [ ] 首次运行时自动生成默认配置 / Default configuration is automatically generated on first run
- [ ] 不影响现有逻辑 / Does not affect existing logic

### 难度 / Difficulty

⭐⭐ 中等 / Intermediate

### 学习资源 / Learning Resources

- 阅读 `src/index.ts` 了解入口逻辑 / Read `src/index.ts` to understand the entry logic
- 阅读 `src/setup.ts` 了解配置流程 / Read `src/setup.ts` to understand the configuration flow
