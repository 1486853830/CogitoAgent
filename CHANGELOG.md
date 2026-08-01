# Changelog

## v2.3.2 (2025-07)

- feat: 新增化学、金融、数学统计工具模块，优化坐标转换参数校验
- feat(agent): add medical tool suite with clinical calculation functions
- feat: 新增生命科学工具模块及相关功能
- feat(gis): 新增地理信息工具模块及配套支持
- refactor: 重构代码结构，拆分通用工具与业务模块
- refactor: 提取公共组件并重构页面逻辑
- feat: add token usage tracking and display feature

## v2.3.1 (2025-06)

- **微信通道集成**:
  - feat: 新增微信通道集成功能
  - feat: 新增微信历史消息同步与会话管理能力
  - feat: 新增微信机器人功能，支持扫码登录、消息收发
- **多智能体集群**:
  - feat: add agent cluster multi-agent tools and standalone monitor panel
  - feat(agent/orchestrator): add multi-agent collaboration utilities
  - feat: 新增多智能体集群管理功能
- **Dashboard 与可视化**:
  - feat: add dashboard mode and optimize session management
  - feat: add thought trace and tool stats dashboard for agent
  - feat(ui): add desktop mode and dashboard mode switch buttons
  - feat: add toast prompts and session recovery feature
  - feat: add collapsible tool result display for terminal and desktop UI
- **视觉与文档工具**:
  - feat: 添加视觉分析工具及相关配置文档
  - feat: 添加Office文档工具链，支持PPT/Word/Excel创建与Excel读取
- **安全与沙箱**:
  - chore: 替换手动XSS过滤为DOMPurify库实现
  - refactor(desktop,dashboard): rewrite html sanitize logic to use regex replace
  - fix(security): 完善XSS防护逻辑，覆盖更多危险协议
  - refactor(utils): upgrade html sanitize logic to avoid regex bypass
  - refactor: 优化多处代码逻辑并新增XSS防护
  - !9 refactor(sandbox): 重构代码执行限制配置读取逻辑
- **配置与会话**:
  - refactor: 重构项目配置与会话管理，更新角色设定
  - feat: 新增聊天中断功能并调整默认maxTokens配置
  - refactor: 重构工具调用处理逻辑，新增空结果和失败处理规则
  - fix(nav): 修复新建会话的流程并添加防重复点击校验
  - feat(session): add automatic session recovery from disk
- **重构与优化**:
  - refactor: 重构代码结构，引入公共共享模块
  - refactor(electron): 重构stats请求相关通信逻辑
  - fix(dashboard): 修复可视化管理器的定时任务资源泄漏问题
  - refactor(persona & agent): 更新人设并优化首次输入处理
  - style: add tool call card style and interactive logic
- **文档**:
  - docs: 更新全量文档适配v2.3.0版本
  - docs: 更新中英文README，修正项目定位与隐私说明
  - docs: 更新README中的系统架构图为流程图格式
  - docs: update README mermaid diagrams to flowchart LR style
  - docs: 优化中英文README里的工具分类命名
  - docs(personas): 更新角色创建指南
  - docs: 更新README里的dashboard图片路径
  - docs: 更新中英文README文档格式与内容
  - docs: 优化中英文README文档并新增dashboard截图
  - docs: 更新README里的预览图说明文字
  - docs: 更新README中的许可证和界面描述
  - docs: 重构并优化README.md文档内容
- **构建与CI/CD**:
  - build(package.json): 更新启动脚本，添加默认COGITO_MODE环境变量
  - build: 更换xlsx依赖源到官方cdn版本
  - build(docker): 将node基础镜像从18升级到22
  - ci: 删除无用的Gitee CI/CD工作流配置
  - build: 更新依赖包版本
- **角色系统**:
  - feat: add multiple advanced configurations and update persona
  - feat: 新增多个角色人设并完善角色系统
  - feat(personas): add athlete profile image
  - feat: add persona media support and dynamic character assets
  - fix(electron): 修正 persona 媒体资源的视频文件路径
  - refactor(personas): 重构人设系统，改用文件夹存储结构
  - style: 合并electron/main.js里的链式调用代码行
- **基础设施**:
  - chore: 删除多个角色的静态资源文件
  - chore: 更新仓库地址和作者信息为SnowLeopard-io组织
  - chore: add author and license info, update copyright year
  - style: 优化页面视觉效果并添加初始终端欢迎内容
  - fix: 调整欢迎页面路径并新增完整首页
  - 5d878dd GitHub pages
  - chore: 更新依赖配置与文档要求

## v2.3.0 (2025-05)

- feat: Initialize CogitoAgent project with core functionalities
- 初始版本发布，包含核心 Agent 功能和基础工具链
