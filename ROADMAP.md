# CogitoAgent Roadmap / 路线图

> This document outlines the public roadmap for CogitoAgent. Community feedback and suggestions are welcome.
>
> 本文档公开了 CogitoAgent 的开发计划和未来方向。我们欢迎社区反馈和建议。

---

## Legend / 图例

| Symbol / 符号 | Meaning / 含义       |
| ------------- | -------------------- |
| ✅            | Completed / 已完成   |
| 🔄            | In Progress / 进行中 |
| 📅            | Planned / 已规划     |
| 💡            | Proposed / 提议中    |

---

## Short-term (v2.4 - v2.5) / 短期目标

### Core Improvements / 核心增强

| Item / 项目                             | Status / 状态 | Description / 说明                                                                          |
| --------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| Tool execution performance optimization | 📅            | Reduce tool call overhead, caching frequently used results / 降低工具调用开销，缓存常用结果 |
| Session context management improvements | 📅            | Better context window utilization, smart compression / 优化上下文窗口利用，智能压缩         |
| Configuration UI in Dashboard           | 💡            | Visual configuration editor in Electron dashboard / 在 Dashboard 中添加可视化配置编辑器     |
| Plugin hot-reload support               | 💡            | Load/unload plugins without restarting agent / 支持不重启 Agent 即可加载/卸载插件           |

### New Tools / 新工具

| Item / 项目                | Status / 状态 | Description / 说明                                                                 |
| -------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| YAML processing tools      | 📅            | Read, write, validate YAML files / 读写和验证 YAML 文件                            |
| Image generation tools     | 💡            | Generate images via supported APIs / 通过支持的 API 生成图片                       |
| PDF generation tools       | 💡            | Create PDF reports from templates / 从模板创建 PDF 报告                            |
| Time zone / calendar tools | 📅            | Date calculation, timezone conversion, calendar ops / 日期计算、时区转换、日历操作 |

### Community & Docs / 社区与文档

| Item / 项目                         | Status / 状态 | Description / 说明                                                           |
| ----------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| English documentation refinement    | 📅            | Improve English docs for international audience / 完善英文文档，服务国际用户 |
| Video tutorials (Chinese + English) | 💡            | Step-by-step setup and usage videos / 分步安装和使用视频教程                 |
| Community plugin registry           | 💡            | Directory for community-contributed plugins / 社区贡献的插件目录             |
| `good first issue` task pool        | 🔄            | 10+ beginner-friendly tasks tagged and ready / 10+ 个新手友好任务已就绪      |

---

## Mid-term (v2.6 - v3.0) / 中期目标

### Agent Capabilities / 智能体能力

| Item / 项目                            | Status / 状态 | Description / 说明                                                                                         |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| Long-term memory (vector DB)           | 💡            | Persistent memory with semantic search via local vector DB / 通过本地向量数据库实现持久化记忆和语义搜索    |
| Multi-agent collaboration improvements | 💡            | Better sub-agent coordination, shared context, result aggregation / 改进子智能体协作、共享上下文和结果聚合 |
| Scheduled autonomous tasks             | 💡            | Agent runs scheduled tasks without user intervention / Agent 无需用户干预即可执行定时任务                  |
| ReAct reasoning enhancements           | 💡            | Improved step-by-step reasoning with self-verification / 改进的逐步推理和自我验证能力                      |

### Platform & Integration / 平台与集成

| Item / 项目                     | Status / 状态 | Description / 说明                                                                            |
| ------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| VS Code extension               | 💡            | CogitoAgent as VS Code extension for inline AI assistance / 作为 VS Code 扩展提供内联 AI 辅助 |
| Slack / Discord bot integration | 💡            | Agent accessible via team chat platforms / 通过团队聊天平台访问 Agent                         |
| MCP Client mode                 | 💡            | Connect to external MCP servers as a client / 作为客户端连接外部 MCP 服务器                   |
| Docker Compose production-ready | 📅            | Optimized Docker deployment with health checks / 优化的 Docker 部署，包含健康检查             |

### Tool Ecosystem / 工具生态

| Item / 项目                       | Status / 状态 | Description / 说明                                                                     |
| --------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| Web scraping enhancements         | 💡            | Structured data extraction, pagination support / 结构化数据提取，分页支持              |
| Advanced data visualization       | 💡            | More chart types, interactive dashboards / 更多图表类型，交互式仪表盘                  |
| Natural language query for SQLite | 💡            | Ask questions in natural language, get SQL results / 用自然语言提问，获取 SQL 查询结果 |
| Audio processing tools            | 💡            | Speech-to-text, audio analysis / 语音转文字，音频分析                                  |

---

## Long-term (v3.0+) / 长期目标

| Item / 项目                | Description / 说明                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Local AI model support** | Run local LLMs (via Ollama/LM Studio) without any API key / 运行本地 LLM，无需任何 API Key               |
| **Mobile companion app**   | iOS/Android app for communicating with your desktop agent / 与桌面 Agent 通信的 iOS/Android 应用         |
| **Enterprise features**    | RBAC, audit logging, team workspaces, SSO integration / 角色权限、审计日志、团队工作区、SSO 集成         |
| **Plugin Marketplace**     | A web marketplace for community plugins with one-click install / 社区插件市场，一键安装                  |
| **Knowledge Graph**        | Auto-build knowledge graph from workspace files / 从工作区文件自动构建知识图谱                           |
| **Multi-platform desktop** | Native Linux packages, macOS .dmg, Windows MSI / 原生 Linux 包、macOS .dmg、Windows MSI                  |
| **Self-hosted web UI**     | Browser-based full UI (no Electron needed) for server deployment / 基于浏览器的完整 UI，适用于服务器部署 |

---

## Recently Completed / 近期完成

| Version / 版本 | Highlights / 亮点                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v2.3.2**     | Full TypeScript migration, 6 new professional modules (GIS, Bio, Med, Chem, Finance, Math), CI/CD pipelines / 全量 TypeScript 迁移，6 个专业模块，CI/CD 流水线                                    |
| **v2.3.1**     | WeChat iLink protocol integration, QR login, message send/receive / 微信 iLink 协议集成，扫码登录，消息收发                                                                                       |
| **v2.3.0**     | Multi-session, sandbox upgrade, MCP protocol, plugin system, OCR/Vision, thought chain visualization / 多会话、沙箱升级、MCP 协议、插件系统、OCR/视觉、思维链可视化                               |
| **v2.2.0**     | Agent modularization, logger levels / Agent 模块化，日志级别                                                                                                                                      |
| **v2.1.0**     | Removed vm2, switched to native Node.js vm module / 移除 vm2，切换到原生 Node.js vm 模块                                                                                                          |
| **v2.0.0**     | Code execution engine, Git, task management, memory system, data processing, SQLite, email, monitoring, scheduler / 代码执行引擎、Git、任务管理、记忆系统、数据处理、SQLite、邮件、监控、定时任务 |

---

## How to Influence This Roadmap / 如何影响路线图

1. **Upvote existing issues**: 👍 react on GitHub Issues to show interest / 在 GitHub Issues 上点赞 👍 表达兴趣
2. **Create feature requests**: Use the [Feature Request template](https://github.com/SnowLeopard-io/CogitoAgent/issues/new?template=feature_request.yml) / 使用功能建议模板提交
3. **Join discussions**: Share your thoughts in [GitHub Discussions](https://github.com/SnowLeopard-io/CogitoAgent/discussions) / 在讨论区分享你的想法
4. **Contribute**: We welcome PRs! See [CONTRIBUTING.md](CONTRIBUTING.md) / 我们欢迎 PR！详见贡献指南

---

> **Disclaimer**: This roadmap reflects current plans and is subject to change based on community feedback and project priorities.
>
> **免责声明**：本路线图反映当前计划，可能会根据社区反馈和项目优先级进行调整。
