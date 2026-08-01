---
title: '[Good First Issue] Add Docker Health Check / 为 Docker 部署添加健康检查'
labels: ['good first issue', 'enhancement', 'ci-cd']
---

## Task Description / 任务描述

The Docker deployment currently lacks a health check mechanism. A health check needs to be added to the `Dockerfile` and `docker-compose.yml`.
目前 Docker 部署缺少健康检查机制。需要为 `Dockerfile` 和 `docker-compose.yml` 添加健康检查。

### Files to Modify / 需要修改的文件

- `Dockerfile` - Add the HEALTHCHECK instruction / 添加 HEALTHCHECK 指令
- `docker-compose.yml` - Add healthcheck configuration / 添加 healthcheck 配置

### Implementation Requirements / 实现要求

1. Use `node -e "..."` or `curl` to check if the Agent process is alive / 使用 `node -e "..."` 或 `curl` 检查 Agent 进程是否存活
2. Health check interval: 30s, timeout: 10s, retries: 3 / 健康检查间隔：30 秒，超时：10 秒，重试：3 次
3. Configure health checks for dependent services in `docker-compose.yml` / 在 `docker-compose.yml` 中设置依赖服务的健康检查

### Additional Suggestions / 额外建议

- Expose a simple health check HTTP endpoint in `src/index.ts` (e.g. `GET /health` returning `{"status": "ok"}`) / 可以在 `src/index.ts` 中暴露一个简单的健康检查 HTTP 端点（如 `GET /health` 返回 `{"status": "ok"}`）
- Add an environment variable `HEALTH_CHECK_PORT` to control the listening port / 添加环境变量 `HEALTH_CHECK_PORT` 控制监听端口

### Acceptance Criteria / 验收标准

- [ ] Health status is visible after running `docker-compose up -d` / `docker-compose up -d` 后能看到健康状态
- [ ] `docker ps` shows the `healthy` status / `docker ps` 显示 `healthy` 状态
- [ ] Does not affect existing functionality / 不影响现有功能

### Difficulty / 难度

⭐⭐ Medium / 中等

### Learning Resources / 学习资源

- [Docker HEALTHCHECK Documentation](https://docs.docker.com/engine/reference/builder/#healthcheck)
- Review the existing `Dockerfile` and `docker-compose.yml` / 查看现有 `Dockerfile` 和 `docker-compose.yml`
