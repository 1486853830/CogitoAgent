# Changelog

> 本文档依据 Git 提交历史整理（`git log`），版本日期以仓库 tag 时间为准。
> 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
> [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 约定。

## [Unreleased] (2026-08-12)

> `v2.3.2` 之后、尚未发布的新提交。

### 构建与打包

- build: 新增智能构建脚本，优化 Electron 下载与网络适配（`scripts/electron-build.mjs`）
- build: 新增 `build:dir` 脚本（免安装目录模式）并优化 electron-builder 配置
- build: 将 ts-jest 从 30.0.0 降级到 29.4.11，规避 Jest 30 + ts-jest ESM 兼容问题
- chore(deps): 升级 Electron 至 42.8.1

### 桌面与 UI

- refactor(electron): 重构仪表盘面板布局与样式
- chore: 添加应用图标并为所有页面配置 favicon

### Agent 与核心

- refactor(electron, agent): 调整 stderr 日志输出，解决模块循环依赖
- refactor(mcp, pubmed): 优化 MCP 会话 id 生成与 PubMed XML 实体处理
- chore: 完成全项目代码审查与批量修复（致命/严重/一般/建议分级落地）

## v2.3.2 (2026-08-09)

### 功能

- feat: 新增 **MCP 支持**（R4.3 完整落地：客户端接入、工具 Schema 注入、会话增强）
- feat: 全面迁移至**原生 function calling** 工具调用协议（R2.1/R2.2，彻底移除文本标记）
- feat: 实现 R1.7 工具注解（readOnly / destructive / idempotent）与 R1.8 结构化输出模式
- feat: 新增**图像生成**工具（OpenAI 兼容 `images/generations`，文生图 / 图生图，默认 `qwen-image-2.0-pro`）
- feat: 新增多通道能力（回复投递多来源隔离）与 Office 读取工具（`readWord` / `readPpt`）
- feat: 实现**多语言切换**全链路支持（zh / en），重构语言相关测试用例
- feat: 新增**危险操作确认**（Dangerous Operation Confirmation）功能
- feat: 新增默认人设系统（`personas/cogito/`）并优化形象加载逻辑
- fix(agent/session): 调整会话初始化与懒加载逻辑，优化首次启动体验
- feat(dashboard): 仪表盘新增 skills 与 tools 面板动态数据支持
- feat: 完成 R2.7 推测执行 / R2.8 PASTE 模式挖掘 / R2.9 推理深度旋钮
- feat: 完成 R3.1 / R3.5 / R3.7 / R3.8 / R3.9 / R4.5 / R4.6 / R4.8 / R5.2 / R5.4 系列需求落地
- feat: 新增科学工具链（化学 RDKit、生物 Biopython、文献 PubMed 插件）与配置优化

### 安全

- fix(desktop-preview): 修复富文本内容插入的 XSS 风险（`insertAdjacentHTML` 替代 `innerHTML`）
- refactor(escapeHtml): 重写 HTML 转义逻辑，避免正则绕过
- chore: 升级 dompurify 至 3.4.13
- refactor(plugins): 统一插件安全实现，修复命令注入与 XML 解析风险
- refactor: 实现凭据加密存储与日志文件轮转
- fix: 修复多场景下 Python 执行的编码与换行问题，完善参数转义逻辑

### 重构与修复

- refactor(agent): 重构回复回调机制，支持多来源隔离与工具中断
- refactor(code): 抽取代码执行通用工具，移除 vm 降级路径
- refactor: 升级上下文哈希算法并修复选择器转义问题
- refactor(plugin): 重构 PluginManager，支持自定义插件目录
- refactor: 修复回复目标可能错发的问题；修复异步调用与配置缓存问题
- refactor(config): 移除配置缓存、saveConfig 等冗余代码
- refactor: 全面升级类型安全，修复多处类型断言问题
- fix(deps): 更新依赖并修复 skills manager 内存泄漏
- chore: 修复多处 parseInt 缺 radix、临时文件路径回退、数据库事务安全等问题

### 测试

- test(io-ws-server): 优化测试中消息断言逻辑
- test(io-terminal): 修复终端 logo / printBanner 断言以适配新日志实现
- refactor(test: system-prompt): 重构语言相关测试用例

### 构建与 CI

- build: 移除 patch-package 并调整 isolated-vm 打包策略（`npmRebuild: false`，桌面版走沙箱降级路径）
- ci: 适配 Electron 42 / Node 22，修复 isolated-vm 兼容性问题
- chore(eslint): 更新忽略文件与测试环境全局变量

## v2.3.1 (2026-07-09)

### 微信通道（iLink）

- feat: 新增微信通道集成（`wechat-manager.ts` + `wechat.ts` 工具）
- feat: 新增微信历史消息同步与会话管理能力
- feat: 新增微信机器人功能，支持扫码登录、消息收发、工具气泡展示

### 多智能体集群

- feat: 新增多智能体集群管理（`orchestrator.ts`、`cluster.ts` 工具）
- feat: 新增独立监控面板（思维链、工具统计、集群拓扑实时可视化）

### Dashboard 与可视化

- feat: 新增 dashboard 模式并优化会话管理（`npm run electron:dashboard`）
- feat: 新增思维链（thought trace）与工具统计面板
- feat(ui): 桌面模式与仪表盘模式切换按钮
- feat: 新增 toast 提示与**会话自动恢复**功能（从磁盘恢复上次会话）
- feat: 新增可折叠工具结果展示（终端与桌面 UI）

### 视觉与文档工具

- feat: 添加视觉分析工具（`vision` / `visionFromUrl`）及相关配置文档
- feat: 添加 Office 文档工具链（PPT / Word / Excel 创建与 Excel 读取）

### 安全与沙箱

- chore: 以 DOMPurify 库替换手动 XSS 过滤
- fix(security): 完善 XSS 防护逻辑，覆盖更多危险协议（file / data / javascript 等）
- refactor(utils): 升级 HTML 清洗逻辑，避免正则绕过
- refactor(sandbox): 重构代码执行限制配置读取逻辑（R5.x）

### 配置与会话

- refactor: 重构项目配置与会话管理，更新角色设定
- feat: 新增聊天中断功能并调整默认 maxTokens 配置
- refactor: 重构工具调用处理逻辑，新增空结果与失败处理规则
- fix(nav): 修复新建会话流程并添加防重复点击校验

### 角色系统

- refactor(personas): 重构人设系统，改用文件夹存储结构（`personas/<name>/persona.md`）
- feat: 新增多个人设与高级配置；新增角色媒体资源与动态形象
- feat(personas): 新增运动员等角色头像素材

### 构建与 CI

- build(package.json): 更新启动脚本，添加默认 `COGITO_MODE` 环境变量
- build: 更换 xlsx 依赖源为官方 CDN 版本
- build(docker): 将 Node 基础镜像从 18 升级到 22
- ci: 删除无用的 Gitee CI/CD 工作流配置

### 文档

- docs: 更新中英文 README，修正项目定位与隐私说明
- docs: 更新 README 系统架构图为 flowchart 格式
- docs(personas): 更新角色创建指南
- docs: 更新全量文档适配 v2.3.0 版本

## v2.3.0 (2026-06-23)

> 项目初始里程碑（首个提交 2026-06-07，共 84+ 提交）。

- feat: 初始化 CogitoAgent 项目，包含核心 Agent 功能与基础工具链
- feat: 工作区路径配置与动态活动范围支持
- feat: 浏览器自动化（Playwright：点击、填表、截图、下载）、网页抓取、应用管理
- feat: 多角色人设系统与设置向导中的角色选择
- refactor(agent/tools): 拆分独立工具文件并统一导出
- docs: 建立 README / REQUIREMENTS / ROADMAP / CONTRIBUTING / SECURITY 文档体系

---

完整的需求级变更记录请见 [REQUIREMENTS.md](REQUIREMENTS.md)。
