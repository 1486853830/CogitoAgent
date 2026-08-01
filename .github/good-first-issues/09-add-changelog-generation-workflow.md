---
title: '[Good First Issue] Add Automated Changelog Generation GitHub Actions Workflow / 添加自动生成 Changelog 的 GitHub Actions 工作流'
labels: ['good first issue', 'enhancement', 'ci-cd']
---

## Task Description / 任务描述

Currently, the Changelog needs to be maintained manually. Add a GitHub Actions workflow that automatically generates the Changelog when a new version is released.
目前 Changelog 需要手动维护。添加一个 GitHub Actions 工作流，在发布新版本时自动生成 Changelog。

### Implementation Approach / 实现方案

Use `release-drafter` or `conventional-changelog` to automatically generate the Changelog.
使用 `release-drafter` 或 `conventional-changelog` 自动生成 Changelog。

### Files to Create / 需要创建的文件

Create `.github/workflows/release-drafter.yml` with the following configuration:
创建 `.github/workflows/release-drafter.yml`，配置如下：

1. Trigger on `push` events to the `main` branch / 监听 `push` 到 `main` 分支的事件
2. Automatically categorize PRs based on the Conventional Commits specification / 根据 Conventional Commits 规范自动分类 PR
3. Generate formatted Release Notes / 生成格式化的 Release Notes
4. Auto-populate content when creating a GitHub Release / 在创建 GitHub Release 时自动填充内容

### Optional: Create `.github/release-drafter.yml` Configuration File / 可选：创建 `.github/release-drafter.yml` 配置文件

Configure category rules:
配置分类规则：

- `feat` → 🚀 New Features
- `fix` → 🐛 Bug Fixes
- `docs` → 📖 Documentation
- `refactor` → 🔧 Refactoring
- `test` → ✅ Tests
- `chore` → ⚙️ Chores

### Acceptance Criteria / 验收标准

- [ ] Automatically generates a categorized Changelog when creating a Release / 创建 Release 时自动生成分类好的 Changelog
- [ ] Consistent with the existing Changelog format in `README.md` / 与现有的 `README.md` 中的 Changelog 格式保持一致

### Difficulty / 难度

⭐⭐ Medium / 中等

### Learning Resources / 学习资源

- [release-drafter](https://github.com/release-drafter/release-drafter)
- Refer to existing workflow files under `.github/workflows/` / 参考现有 `.github/workflows/` 下的工作流文件
