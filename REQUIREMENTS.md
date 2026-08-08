# CogitoAgent 需求文档 / Requirements

> 本文档是 CogitoAgent 对标 OpenClaw / Codex / Trae SOLO 等主流智能体的**完整改进需求清单**。
>
> 约定：
>
> - 状态标记：`[x]` = 已完成 · `[ ]` = 未开始 · `[~]` = 进行中
> - 每条需求带唯一编号（如 `R1.1`），正文与「状态追踪表」编号一一对应
> - 推进时**先**在正文勾选，**再**更新追踪表（完成版本 / 日期 / 备注）
> - 按 P0 → P1 → P2 → P3 → P4 → P5 六阶段推进，P0 未全部完成不进入 P1

---

## 1. 背景与目标

### 1.1 现状问题（诊断摘要）

CogitoAgent 早期本质是 **"文本标记 + 正则解析"的自助式智能体**（`[TOOL]...[/TOOL]` + `[WAIT]`），而主流智能体（Codex、OpenClaw、Trae SOLO）均为 **结构化工具调用 + 事件驱动循环**。本版本已完成迁移：文本标记协议的残余已全面清除，工具调用统一走原生 function calling。2026 年行业共识已从"模型能力决定一切"转变为 **"脚手架（Harness）即是产品"**——同一模型在不同脚手架下性能差异可达 6 倍，Anthropic 多 Agent 编排仅通过改变架构就比单 Agent 基线提升 90.2%。主要代差（本次已收口）：

| 维度     | 现状                                        | 目标（行业顶尖）                                                                                          |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 工具调用 | 已迁移原生 function calling：不依赖文本标记 | 原生 function calling / JSON Schema / 流式 tool_calls / MCP + 工具注解（readOnly/destructive/idempotent） |
| 循环控制 | 已迁移事件驱动 + 结构化 stop（无 `[WAIT]`） | 事件驱动循环 + 预算控制 + 推测执行（PASTE）+ 并行工具调用                                                 |
| 上下文   | 10 万 token 启发式截断，丢弃而非摘要        | 可组合上下文工程栈：JIT 加载 + 压缩（Compaction）+ 结构化笔记 + 多 Agent 隔离上下文                       |
| 记忆     | JSON 文件 + 关键词 `includes` 打分          | embedding 语义检索 + 分级记忆 + Dreaming 跨会话精炼 + REMem 混合记忆图                                    |
| 沙箱     | JS `isolated-vm` + Python 仅环境变量清理    | 硬件级隔离（Firecracker/Kata/WASM），信任交接防御，Kubernetes Agent Sandbox                               |
| 多智能体 | 单进程共享注册表的重复循环实现              | 统一 runtime runner + A2A 协议 + 嵌套子 Agent（5 层深）+ 检查点/时间旅行/分支                             |
| 插件     | 动态 import 但工具对模型不可见              | Agent Skills 标准（三级渐进式披露）+ 插件 schema 注入 + 权限声明 + Code Mode                              |
| MCP      | 仅文档宣称                                  | 真实 MCP 客户端 + 服务端 + Elicitation + Sampling + 工具注解                                              |
| 协议     | 仅 WebSocket 内部通信                       | MCP（工具）+ A2A（Agent 间协调）+ 身份信任层（OAuth 2.1 / Agent Cards）三层协议栈                         |
| 编码能力 | git 工具窄，无 AGENTS.md / DiffView         | Tree-sitter 知识图谱索引 + AGENTS.md + Plan-then-Execute + 验证循环 + 变更影响分析                        |
| 评测     | 无 benchmark                                | 自建 eval suite + SWE-bench 风格 + OpenTelemetry GenAI 可观测性 + Shadow Mode CI                          |
| 安全     | 危险操作全局开关                            | Guardrails（输入/输出护栏）+ 分级许可 + 审计台账 + 沙箱逃逸防御                                           |
| 多模态   | 仅 OCR/Vision 工具                          | 三车道架构（Vision+Tools / Realtime Audio / Video Understanding）+ Computer Use                           |
| 长程任务 | 无                                          | METR 16 小时时间前沿对齐 + 验证前置引用 + 确定性检查点恢复                                                |

### 1.2 目标

把 CogitoAgent 从"演示级"提升为可日常使用、可扩展、可评测的**生产级自主智能体**，并在差异化维度达到行业顶尖：

1. **引擎层**：结构化工具调用、事件驱动循环、预算控制、可组合上下文工程栈、推测执行
2. **能力层**：语义记忆 + Dreaming、多智能体编排（A2A + 嵌套子 Agent）、知识图谱编码工作流、硬件级隔离、OpenTelemetry 可观测性
3. **产品层**：Web / 桌面 / CLI 全端、MCP + A2A 双协议生态、Agent Skills 市场、评测闭环、多平台打包
4. **突破层**：Computer Use、科学发现 Agent、16 小时长程任务、可组合上下文工程、多 Agent 对齐安全
5. **范式层**：Agent OS 内核、可执行世界模型、因果推理引擎、Agent 经济体、持续人格数字孪生、桌面 RPA 融合、分层推理路由、行为可观测性、自适应推理图、宪法品格、自进化训练竞技场、数字孪生闭环控制

### 1.3 非目标（明确排除）

- 不做云端推理依赖（保持 BYO LLM key，本地执行）
- 不改变 Apache-2.0 开源定位
- 不强制迁移 Electron（Web UI 为渐进演进，可共存）

---

## P0 — 引擎换代（目标版本 v2.4.x）

### R1. 原生工具调用协议

- [x] **R1.1 工具 JSON Schema**：为 `registry.ts` 每个内置工具补充 JSON Schema（参数名 / 类型 / 必填 / 描述 / 枚举），废弃仅 `argCount` 的无类型注册
- [x] **R1.2 接入原生 function calling**：`api/client.ts` 请求携带 `tools` + `tool_choice`，解析流式 `delta.tool_calls`，支持并行工具调用
- [x] **R1.3 结构化 tool 结果**：工具结果以 `role: 'tool'` + `tool_call_id` 注入会话（对齐 OpenAI / Azure / Anthropic 兼容接口），替代现有 `role: 'user'` 文本注入
- [x] **R1.4 移除文本 fallback**：删除 `[TOOL]`/`[WAIT]` 纯文本降级层（system prompt、主循环、子代理编排、tool-parser 全部清除），工具调用统一走原生 function calling 单一路径
- [x] **R1.5 清单单一来源**：`system-prompt.ts` 的工具目录改由 registry/schema 自动生成，删除手写 `buildToolList()` 散文（消除与 registry 的漂移）
- [x] **R1.6 参数强制校验**：工具执行前按 Schema 校验实参，失败返回结构化错误而非静默跳过；`argCount` 由装饰性元数据变为强制校验
- [x] **R1.7 工具注解（Tool Annotations）**：为**每个工具**推导并声明行为注解——`readOnly`（不修改外部状态）、`destructive`（修改/删除数据）、`idempotent`（重复调用效果相同）、`openWorld`（在 Agent 环境外产生可见效果）；`destructiveHint` 以 registry `DANGEROUS_OPERATIONS` 为准（自动批准/确认的唯一事实来源），`TOOL_DOCS` 显式注解作 override；注解随 OpenAI tools / MCP 暴露
- [x] **R1.8 结构化输出强制模式**：工具侧 strict JSON Schema 已实现（必填 + additionalProperties=false）；Agent 最终输出 strict 合规模式已接——`chat.structuredOutput.strict` 为真时以 `response_format(json_schema, strict:true)` 约束最终输出（opt-in，对普通对话无影响）
- [x] **R1.9 Rich Errors**：工具错误返回结构化对象（如 `{error: "file_not_found", path: "/foo/bar.ts", suggestion: "Did you mean /foo/baz.ts?"}`），让 Agent 能推理如何修复而非仅看到错误码

**验收**：模型无需记忆目录文案即可正确调用任意已注册工具；工具结果走 `tool` role；系统提示中不再出现散文工具清单。

### R2. 事件驱动循环

- [x] **R2.1 移除固定 3s 轮询**：循环改为事件驱动，工具执行完成 / 用户消息 / 定时任务到达时立即推进，而非 `setTimeout(3000)` 等待
- [x] **R2.2 消除首轮延迟**：首轮回复不再被定时器拖慢
- [x] **R2.3 预算控制**：引入 `maxSteps`（单轮最大工具步数）、`tokenBudget`（`maxTokens`，单轮最大输出 token）、`costBudget`（按路由表价格换算的预估花费，美元），达到即强制收敛并通知用户（`evaluateBudget` 统一判定 steps/tokens/cost 三类上限；未知模型价格时给一次告警，预算不生效）
- [x] **R2.4 结构化停信号**：模型"说完"改为结构化 `stop` 泛化（原生输出 / 内容为最终 / 预算耗尽），不再依赖模型记得写 `[WAIT]`
- [x] **R2.5 彻底移除 `[WAIT]`**：system prompt / 首轮引导 / 循环判定的 `[WAIT]` 依赖全部清除（含 `nativeTools` 配置项），文本标记协议整体删除，结束一律由结构化 `stop` 信号驱动
- [x] **R2.6 并行工具调用**：当模型返回多个独立工具调用时，使用 `Promise.allSettled` 并行执行而非顺序执行；独立操作从串行 N×延迟 降至 max(延迟)，加速最高 3.7 倍
- [ ] **R2.7 推测执行（Speculative Execution）**：借鉴 CPU 架构推测执行思路，在主模型仍在思考时用轻量"草稿"模型预测下一步工具调用并预先执行；预测错误时无损回退到标准顺序路径；加速最高 30%
- [ ] **R2.8 PASTE 模式挖掘**：从 Agent 执行轨迹中挖掘"模式元组"（上下文 → 预测工具 + 参数推导函数 + 经验成功率），预测命中率达标后自动启用推测执行；策略系统将工具分类为完全可推测 / dry-run 可行 / 禁止推测
- [ ] **R2.9 推理深度可调旋钮**：对齐三大实验室收敛趋势——支持 `reasoning_effort`（low/medium/high/xhigh）与 `verbosity` 解耦；自适应思考模式（`thinking: {type: 'adaptive'}`）替代固定 token 预算

### R3. 会话与上下文

- [x] **R3.1 会话存储异步化**：去掉热路径 `writeFileSync`（`session.ts` 每次增消息同步落盘），改异步 + 批量/节流 + 原子写——`addUserMessage`/`addAssistantMessage`/`addAssistantNativeMessage`/`addToolResultMessage` 均改走 `saveSessionAsync` 异步队列（fire-and-forget，签名不变、不阻塞思考循环）；新增 `flushSessionWrites()` 供测试与优雅退出等待落盘；创建/切换/归档等关键原子操作仍走同步 `saveSession`
- [x] **R3.2 智能压缩**：`compressHistory()` 从"丢弃 + 枚举工具名"升级为 LLM 分级摘要（保留关键数据、代码片段、目标状态），触发阈值按模型动态设置；修复原实现摘要的是「保留的近期消息」而非「被丢弃的旧内容」的 bug，新增分块 + 失败回退朴素摘要 + `compressionSummary` 开关
- [x] **R3.3 上下文对齐模型**：`max_tokens` 与压缩阈值根据 `api.model` 真实 context window 自动设置，80% 时提前预警
- [x] **R3.4 tool 计数修复**：`turnCount` 与压缩触发正确计入 `tool` 角色消息（修复现有计数不一致 bug）
- [~] **R3.5 JIT 上下文策略**：从"预推理嵌入检索"升级为即时上下文加载——已实现 JIT 标记注入（`[上下文补充]` 标记随对话持久化），运行时按需工具加载数据仍待深化
- [x] **R3.6 结构化笔记**：Agent 在工作过程中维护结构化笔记（关键发现、中间结果、待办事项），作为跨上下文窗口的持久化知识载体，压缩时笔记优先保留
- [~] **R3.7 上下文腐烂防御**：针对 Transformer 长序列注意力"拉薄"问题，实施上下文分区策略——提供 `getPartitionedMessages()` 将历史划为 system / workingMemory / dialogue 三段，每区独立摘要仍在完善
- [ ] **R3.8 多 Agent 隔离上下文**：子 Agent 在独立上下文窗口中工作，仅返回结构化摘要给主 Agent，避免子 Agent 的完整工具输出污染主上下文
- [ ] **R3.9 会话中途系统消息**：支持在用户轮次后追加 `role: "system"` 消息动态调整 prompt（如根据执行结果注入新约束），同时保持 prompt cache 命中

### R4. MCP 原生集成

- [x] **R4.1 MCP 服务端**：将 `TOOL_REGISTRY` 自动导出为 `tools/list` / `tools/call` / `resources/list`（基于 `@modelcontextprotocol/sdk`）
- [x] **R4.2 MCP 客户端**：可连接外部 MCP server，动态拉取其工具 schema 并入上下文
- [x] **R4.3 MCP 配置面**：Dashboard 扩展面板管理接入的 MCP server（启停、本地 server 名、工具前缀、外部 server 注册表增删改）；config `mcp` 段（`enabled`/`serverName`/`prefix`/`servers`）已由 `getMcpConfig`/`setMcpConfig` 读写，Dashboard 经 IPC（`get-mcp-config`/`update-mcp-config`）编辑、Agent 重载生效
- [x] **R4.4 MCP 文案修正**：README / CHANGELOG 中"已支持 MCP"的文案与实际能力一致，去掉虚假宣传
- [ ] **R4.5 MCP Elicitation**：MCP 服务端可通过客户端向用户请求结构化输入，实现更丰富的人机交互（如运行时确认参数、收集缺失信息）
- [ ] **R4.6 MCP Sampling**：MCP 服务端可从客户端请求 LLM 补全（含工具调用），使服务端从被动工具提供者升级为可编排多步推理流的协调者
- [x] **R4.7 MCP 工具注解传播**：将 R1.7 的工具注解通过 MCP `toolAnnotations` 字段传播给外部客户端，实现跨客户端的统一策略执行
- [ ] **R4.8 MCP 无状态重构对齐**：对齐 2026-07 MCP 重大重构——取消协议层 Session，改为每次请求携带完整处理信息，支持 MCP Server 在 Kubernetes 上水平扩缩容

### R5. 插件体系

- [x] **R5.1 插件工具注入**：`plugin.ts` 动态注册的工具自动生成 JSON Schema 并注入系统提示 / 原生 tools，解决"插件工具模型不可见"
- [x] **R5.2 插件权限模型**：插件在 manifest `metadata.defaultPermission` 声明默认权限级别（`allow`/`ask`/`deny`，模板已含示例）；`resolveToolPermission` 解析优先级为「全局 `tools.permissions` 规则 > 插件默认 > allow」；Dashboard 扩展面板可编辑 `tools.permissions` 规则集（IPC `get-extensions`/`set-tool-permissions` 全量替换）。注：权限声明落地为插件 `metadata`（与现有 `export const metadata` 约定一致），而非独立的 `plugin.yaml`
- [x] **R5.3 插件热加载**：运行中加载 / 卸载插件（不重启 Agent），UI 面板反映
- [ ] **R5.4 插件安全**：不可信插件默认受限运行；文档明确插件执行权限边界
- [x] **R5.5 Agent Skills 标准（三级渐进式披露）**：对齐 Anthropic 2025-10 发布的 Agent Skills 开放标准——L1 元数据（~50 tokens/skill，预加载仅够决定是否加载）→ L2 完整 SKILL.md 正文（按需加载）→ L3 嵌套资源（表单/模板/参考文件，仅在正文引用时加载）；已被 Codex CLI、Gemini CLI、Cursor 等 12+ 工具采纳
- [x] **R5.6 Skills 目录约定**：`.cogito/skills/` 目录作为 Agent 能力注册中心，每个 skill 为独立目录含 `SKILL.md` + 可选资源文件；Agent 自动扫描并注入 L1 元数据
- [ ] **R5.7 Code Mode 工具范式**：允许 Agent 编写代码来编排调用多个 MCP 工具（而非仅调用预定义工具），代码在沙箱中运行；提升组合性和 token 效率
- [ ] **R5.8 配置坏味道防御**：对 AGENTS.md / SKILL.md 文件进行 lint 检查——检测 Lint Leakage（62% 文件存在）、Context Bloat（42%）、Skill Leak 等配置退化问题；提醒指令数超过 150-200 条时合规性下降

---

## P1 — 能力进阶（目标版本 v2.6.x）

### R6. 记忆与知识

- [ ] **R6.1 向量记忆**：检索从关键词 `includes` 升级为 embedding（本地方案：transformers.js / fastembed / 本地向量库）+ 相似度排序
- [ ] **R6.2 分级记忆**：分 `episodic`(会话) / `semantic`(全局) / `procedural`(技能) 三层级，自动写入 + 主动召回
- [ ] **R6.3 记忆自动写入**：工具执行结果 / 关键决策自动提炼入库，不依赖模型主动调用 `addMemory`
- [ ] **R6.4 记忆持久化升级**：存储从 JSON 迁移到 SQLite（含向量列）或独立向量库
- [ ] **R6.5 记忆 UI**：Dashboard 可视化记忆条目、检索测试、手动清理
- [ ] **R6.6 Dreaming 跨会话精炼**：定时审查 Agent 会话和记忆库，提取模式（重复错误、收敛工作流、跨会话偏好），策展记忆——重构记忆以保持高信噪比；支持自动更新记忆或人工审查后落地两种模式
- [ ] **R6.7 REMem 混合记忆图**：将经验转化为混合记忆图，灵活链接时间感知要点(gists)和事实；支持基于记忆图的复杂推理而非简单检索
- [ ] **R6.8 双过程记忆架构**：解耦即时情景需求（恒定 10 条消息窗口）与长期巩固知识（~3 tokens/消息增长），处理矛盾参数演化、跨实验阶段的多跳推理、精确技术事实保留
- [ ] **R6.9 组织上下文记忆**：引入第五类记忆——企业数据资产的受治理、持久化、跨系统记忆（认证定义、数据血缘、实体身份解析、访问策略执行）
- [ ] **R6.10 生成式语义工作空间（GSW）**：构建 Operator（将输入观察映射为中间语义结构）+ Reconciler（将结构整合到持久化工作空间，强制时间/空间/逻辑一致性），使 LLM 能对演化的角色、动作和时空上下文进行推理

### R7. 多智能体与运行时

- [ ] **R7.1 统一 runner**：抽 `AgentRun` 抽象（派遣 / 预算 / AbortSignal / 步骤回溯），主循环与子代理共用，删除 `orchestrator._execAgentLoop` 重复实现
- [ ] **R7.2 agent 线程管理**：`spawn / send / wait / close` 语义；子代理可持久化（重启恢复）；深度 / 并发上限可配置
- [ ] **R7.3 真并行**：`panelDiscussion` / `voting` 改为真并行（`allSettled`），`pipeline` 支持失败补偿
- [ ] **R7.4 通道抽象打通**：`ChannelManager.dispatch / onIncoming` 接线，微信 / Webhook / Heartbeat / CLI / WS 统一走通道流（让半成品适配层转正）
- [ ] **R7.5 子代理安全**：子代理危险操作改为"可配置放行"而非一律拒绝；支持进程级隔离
- [ ] **R7.6 A2A 协议集成**：实现 Agent-to-Agent（A2A）协议——Agent 间通过 Agent Cards（JSON, `/.well-known/agent.json`）互相发现、协商任务、交换结果；支持对等任务外包模式
- [ ] **R7.7 嵌套子 Agent**：子 Agent 可生成自己的子 Agent，支持最多 5 层深度；配合 Dynamic Workflows 可在单次会话中编排数百个子 Agent
- [ ] **R7.8 检查点/时间旅行/分支**：每个 superstep 后自动状态快照（CheckpointSaver），支持 `get_state_history` 返回有序过去检查点列表，可选择任意检查点修改状态并从该点恢复执行（fork/branch）；支持"what-if"调试和 undo
- [ ] **R7.9 Guardrails（输入/输出护栏）**：实现 `@input_guardrail` / `@output_guardrail` 装饰器模式，在 Agent 执行前后进行安全校验（如检测越狱、PII 泄漏、违规操作）；支持自定义校验函数和异步执行
- [ ] **R7.10 Generator-Evaluator 循环**：实现"一个 LLM 生成响应，另一个评估并提供反馈循环"模式；适用于有明确评估标准且迭代有收益的任务（文学翻译、复杂搜索、代码优化）
- [ ] **R7.11 AggAgent 并行轨迹聚合**：将并行轨迹视为可检视环境而非扁平文本拼接——专用聚合 Agent 初始仅持有轻量元数据，按需通过 `get_solution`、`search_trajectory`、`get_segment`、`finish` 四个工具拉取详情；深度研究任务提升 ~10pp

### R8. 编码工作流（Coding Agent 能力）

- [ ] **R8.1 AGENTS.md / CLAUDE.md**：识别并注入项目契约文件作为系统提示；提供模板生成命令
- [ ] **R8.2 全仓上下文索引**：对工作区生成代码索引 / 结构摘要 / grep 入口，作为尺度感知注入
- [ ] **R8.3 Plan 模式**：复杂任务先产出计划并展示、用户确认后实施
- [ ] **R8.4 Diff 审查与回滚**：编码更改产出 git diff 预览，支持一键回滚 / 提交前检查
- [ ] **R8.5 任务清单源**：heartbeat 的 TODO.md 升级为通用任务源（项目内 todo、GitHub issues 读取）
- [ ] **R8.6 Tree-sitter 知识图谱**：使用 Tree-sitter 解析 158 种语言生成语法树（CST），构建代码知识图谱——函数/类/调用链/HTTP 路由/跨服务链接/数据流边；单个静态二进制零运行时依赖；Linux 内核（2800 万行）3 分钟完成全索引
- [ ] **R8.7 混合 LSP 语义类型解析**：在 Tree-sitter 之上提供语义类型解析（模拟 tsserver/pyright/gopls/rust-analyzer），无需语言服务器进程或项目级设置；覆盖 Python/TS/Go/C#/Java/Kotlin/Rust
- [ ] **R8.8 语义代码搜索**：使用本地嵌入向量（如 nomic-embed-code, 768 维, int8）进行语义搜索——搜索 `send` 可发现 `publish`/`emit`/`dispatch` 等语义等价函数；完全本地运行无需 API 密钥
- [ ] **R8.9 变更影响分析**：将未提交的 git diff 映射到受影响符号及其爆炸半径，进行风险分类——在交付前看到变更触及的范围
- [ ] **R8.10 验证前置引用（Verify-before-cite）**：Agent 引用外部信息前必须通过验证器确认来源可靠性；不对称验证（~10-20% 计算给验证器，其余给并行生成）可显著提升引用准确率
- [ ] **R8.11 测试驱动 Agent 循环**：将测试从"附属动作"提升为 Agent 可靠性的核心控制环——三层策略：(1) 快速局部测试（与当前改动相关，每轮跑）(2) PR 必跑测试（lint/typecheck/unit/关键集成）(3) 合并前门禁（CI/安全扫描/E2E）
- [ ] **R8.12 增量索引与团队共享**：后台 watcher 检测文件变更并增量重索引；可将压缩快照提交到 git，团队成员从中引导并跳过完整重索引
- [ ] **R8.13 多信号融合排序**：结合 TF-IDF、API/类型/装饰器签名、AST 配置文件、数据流、Halstead-lite 复杂度、MinHash、模块邻近度和图扩散等 11 种信号进行代码检索排序
- [ ] **R8.14 调用图追踪与死代码检测**：跨文件和包追踪调用者和被调用者（BFS 遍历深度 5）；查找零调用者的函数（智能过滤入口点）；MinHash + LSH 检测近似重复代码

### R9. 安全与沙箱

- [ ] **R9.1 Python 容器隔离**：Python 执行默认在 Docker 容器内（网络 off、工作目录独占挂载、CPU / 内存上限、独立 UID）
- [ ] **R9.2 移除不安全降级**：删除 `COGITO_SANDBOX_MODE=false` 时退回 `node:vm` 的路径，`isolated-vm` 为唯一 JS 执行方式
- [ ] **R9.3 Hooks 生命周期**：引入 `sessionStart / preToolUse / postToolUse / stop` hooks（对标 Codex），可扩展审计与策略
- [ ] **R9.4 凭证管理**：接入系统安全存储（DPAPI / Keychain），API key、邮箱密码单独管理，UI 隐藏明文
- [ ] **R9.5 分级许可策略**：`DANGEROUS_OPERATIONS` 由全局开关改为按类别、按会话、按时间段的许可策略
- [ ] **R9.6 硬件级隔离升级**：Docker/runc 共享主机内核不足以隔离 AI 生成代码——引入 Firecracker MicroVM（KVM 硬件虚拟化，仅 5 种虚拟设备类型，seccomp 24 个允许系统调用）/ Kata Containers（K8s 原生）/ WASM（能力型安全，deny-by-default）分层选择
- [ ] **R9.7 信任交接防御**：防御"沙箱限制与沙箱外受信任组件读取/运行/信任内容之间的间隙"——不是沙箱本身被破坏，而是信任交接缺陷被利用；对沙箱内外组件间数据流实施签名验证和完整性校验
- [ ] **R9.8 Kubernetes Agent Sandbox**：对齐 K8s SIG Apps 官方 `agent-sandbox` 控制器——引入 `Sandbox`（隔离执行环境）、`SandboxTemplate`（隔离参数蓝图）、`SandboxClaim`（事务性资源请求）三种资源，解耦 Agent 工作负载与隔离后端
- [ ] **R9.9 Prompt Injection 防御**：对齐 OWASP LLM Top 10 (2025) LLM01——实施输入消毒、指令隔离（用户输入与系统指令分离）、工具结果注入防护；检测并阻断工具投毒（Tool Poisoning）和记忆投毒（Memory Poisoning）
- [ ] **R9.10 长程模型安全约束**：长程模型会通过反复尝试持续朝目标工作，但同样的持久性会导致它寻找并利用环境弱点——实施周期性意图校验、环境约束探测告警、沙箱外行动尝试检测与阻断

### R10. 评测与工程质量

- [ ] **R10.1 eval harness**：`evals/` 目录 + 任务集（自然语言 → 期望步骤 / 期望 / 期望），输出工具成功率、循环成本、回归量
- [ ] **R10.2 回归基准**：CI 定期全量跑 eval，输出趋势曲线防止性能退化
- [ ] **R10.3 覆盖率门槛**：补齐 `/tests` 遗漏面（Agent 循环、api/client、session 压缩、orchestrator 并行）并加覆盖率卡口（> 80%）
- [x] **R10.4 死代码清理**：删除 `llm-validator.ts` JSON-action 遗留、未引用的 `registry.getToolsForPrompt`、未生效的 `tool-utils.TOOL_OUTPUT_LIMITS`（先转为强制执行）、`stats.recordThinkingTime`、`api/models.ts`（DEPRECATED）
- [x] **R10.5 已知 bug 修复**：setup 中 `thinkingInterval` 与 `Config.chat.thinkingInterval` 对齐；`TOOL_DEVELOPMENT.md` 过时路径修正；file.ts `read_excel` → `readExcel`
- [ ] **R10.6 OpenTelemetry GenAI 可观测性**：实现 OTel GenAI 语义约定——`gen_ai.system`、`gen_ai.request.model`、`gen_ai.usage.input_tokens`、`gen_ai.usage.output_tokens` 等标准属性；`invoke_agent` / `create_agent` / `execute_tool` span 类型；`gen_ai.client.token.usage` / `gen_ai.client.operation.duration` 标准指标
- [ ] **R10.7 Agent 专属 eval 指标**：对齐 DeepEval 一阶指标——Task Completion（任务完成度）、Tool Correctness（工具正确性）、Argument Correctness（参数正确性）、Step Efficiency（步骤效率）、Plan Adherence（计划遵循度）、Plan Quality（计划质量）
- [ ] **R10.8 Trace 层次结构**：实现 `invoke_agent → chat(LLM) → execute_tool → chat → ...` 的嵌套 span 层次；通过 W3C TraceContext header（`traceparent`/`tracestate`）在 Agent 间传播，使多 Agent 工作显示为单一分布式 trace
- [ ] **R10.9 Shadow Mode CI**：在模型升级或 prompt 重构前，先在影子模式运行下一个重大变更；将 prompt 变更视为部署，持续评估持续测量；eval 门禁先非阻塞测量再转为阻塞
- [ ] **R10.10 成本-结果指标**：通过 per-span token 追踪实现成本归因——成功完成的调用 vs 需要人工干预的调用的 token 消耗；定义"卡死工具循环"告警（`tool_call_count > 10` 且无前进进展）
- [ ] **R10.11 确定性可复现 eval**：固定种子 + 固定输入，让 eval 可复现；作为"实验台"逐次对比改进是否真实有效；对齐 SWE-bench Pro 方法论——同一模型在不同脚手架下验证改进效果

---

## P2 — 产品规模化（目标版本 v3.0+）

### R11. 产品形态

- [ ] **R11.1 自托管 Web UI（优先于 Electron 重写）**：Agent 核心暴露 REST + SSE，浏览器可全功能使用；Electron 演进为浏览器包装
- [ ] **R11.2 现代前端技术栈**：Web UI 采用 React / Vite 等成熟方案；多个 Electron 窗口迁到一套组件库，保留现有设计语言
- [ ] **R11.3 多模态交互入口**：语音转文字（STT）、粘贴 / 拖拽图片输入、截屏分析
- [ ] **R11.4 移动端同步**：桌面 / Web / 手机三端会话与任务同步
- [ ] **R11.5 三车道多模态架构**：实现 (1) Vision + Tools 车道——屏幕分析、文档/图像解析、UI 交互、Computer Use (2) Realtime Audio 车道——实时对话 + 工具调用 + 低延迟轮次切换 (3) Video Understanding 车道——长视频或直播流分析，带时间戳；三车道可融合处理产生情境理解
- [ ] **R11.6 双向流式交互**：实现真正的双向流式 Agent 端点——客户端连接后自动管理会话和对话状态，支持实时音频/视频输入和流式输出；语音 Agent 需亚秒级响应
- [ ] **R11.7 视觉反馈循环**：Agent 生成 HTML/UI 后自动截图，将截图反馈给模型进行视觉验证和迭代优化（检查布局、样式、内容层级、响应式）
- [ ] **R11.8 团队协作模式**：多名开发者共享同一 Agent 实例，跟踪 AI vs 人类建议来源，维护共享上下文日志

### R12. 生态

- [ ] **R12.1 插件市场**：插件仓库页面 + 一键安装（前端列表 + `plugin install` 命令）
- [ ] **R12.2 Skill 机制**：支持"Markdown 技能 + 工具"两形式，技能描述注入上下文
- [ ] **R12.3 通道扩展**：Slack / Discord / Email-in 通道（复用 R7.4 的通道抽象）
- [ ] **R12.4 云任务分发**：本地 CLI 派单 → 远端容器沙箱执行 → diff 回传（对标 Codex cloud task）
- [ ] **R12.5 MCP 生态市场**：接入社区 MCP 服务器注册表（18,000+ 服务器），一键安装配置；自动处理认证和 API 调用
- [ ] **R12.6 A2A Agent 发现**：支持通过 `/.well-known/agent.json` Agent Cards 发现和连接外部 Agent 服务，实现跨组织 Agent 协作
- [ ] **R12.7 多客户端自动配置**：Agent 核心自动配置主流客户端界面（Claude Code、Codex CLI、Cursor、Windsurf 等），实现一次部署多端可用
- [ ] **R12.8 云沙箱化执行**：对标 OpenAI Codex——任务在独立临时计算环境中运行，克隆仓库到网络隔离的云沙箱，执行期间无出站网络访问，PR 创建后环境销毁，完全异步

### R13. 质量与发布

- [ ] **R13.1 多平台打包矩阵**：Windows NSIS、macOS .dmg、Linux AppImage / 二进制，CI 自动构建 + 签名
- [ ] **R13.2 发布自动化**：GitHub Actions 发版自动打 tag、出包、更新 changelog、文档站
- [ ] **R13.3 性能基线**：首轮回复延迟、工具链耗时、上下文加载时间等指标，随每个发布版本记录

---

## P3 — 超越主流厂商：差异化杀手锏（目标版本 v3.5+）

> P3 不做"补齐功能"，而是抢在厂商前面构建他们**没有或做不深**的组合能力：
> 自我进化、安全彩排、环境感知、混合智能、私密记忆网络。这些共同塑造
> "**会自我改进、行动留痕、越用越懂你、完全私有**"的产品身份。

### X1. 自我进化引擎（Self-Evolution）

> 主流厂商提供的是"静态提示 + 手工技能"。这里让 **Agent 自己长技能、改提示、沉淀经验**。

- [ ] **X1.1 工具自举**：从工具执行 traces 中自动归纳"高频动作序列 / 缺失工具"，自动生成新工具并经 eval 回归门禁后注册——Agent 自己教自己写工具
- [ ] **X1.2 技能自编译**：把多轮成功执行的步骤自动提炼为可复用 `SKILL.md`（含触发条件 + 步骤 + 校验），沉淀回技能库
- [ ] **X1.3 提示词自优化**：基于完成率/成本/用户反馈，对 system prompt 变体做 A/B/多臂对比，择优自动应用（带版本可回滚）
- [ ] **X1.4 失败反向学习**：自动把每次失败与"不该再犯"的规则转成经验记忆与校验断言，下次同类任务先自查（防回归闭环）
- [ ] **X1.5 Outcomes 自动化评估闭环**：开发者编写成功标准 rubric，独立 grader 在自身上下文窗口中评估输出（不受 Agent 推理影响），不合格时 grader 指出需改进之处，Agent 再次尝试；测试显示可提升任务成功率最高 10 分
- [ ] **X1.6 AlphaEvolve 生成器-评估器循环**：LLM 集成提出候选方案，自动化评估器打分，MAP-Elites / 岛屿数据库维护高分多样变体的帕累托前沿；广度用轻量模型（Flash）、深度用重量级模型（Pro）；关键约束：仅适用于具有可编程评估器的问题
- [ ] **X1.7 Dreaming + Outcomes 双层自改进**：Memory 在工作时捕获学习（R6.6 Dreaming），Outcomes 在任务完成时评估改进（X1.5），两者构成自改进 Agent 的完整闭环——会话间精炼记忆 + 会话内自动评估重试
- [ ] **X1.8 有监督自我精炼**：完全自治的自改进仍不可行，实现"有监督的自我精炼配合人类反馈循环"——Agent 提议改进（新技能/新工具/prompt 变体），人类审批后落地；避免"自改进 Agent 神话"的架构陷阱

### X2. 计划彩排与审计（Rehearsal & Provenance）

- [ ] **X2.1 计划彩排（Plan Rehearsal）**：危险/昂贵操作先在隔离彩排沙箱中**dry-run**，通过校验后才在真实环境执行；未通过则返回用户，杜绝"一步毁盘"
- [ ] **X2.2 会话时间旅行（Conversation Time-Machine）**：会话可 fork / branch / 回退到任意历史检查点（git 化大脑），步骤可回滚、可对照重演
- [ ] **X2.3 全量审计台账（Provenance Ledger）**：每个动作输出结构化记录（决策动机、影响文件、token/成本、前后 diff、来源记忆），支持一键导出合规报告
- [ ] **X2.4 确定性格验收台（Deterministic Evals）**：固定种子 + 固定输入，让 eval 可复现，作为"实验台"逐次对比改进是否真实有效

### X3. 环境感知与常驻智能（Ambient Operation）

- [ ] **X3.1 工作区感知**：监视文件系统/ git 事件，Agent 能"感知"变化并主动行动，而非只等指令
- [ ] **X3.2 外部上下文订阅**：日历/邮件/剪贴板/系统提醒作为可感知事件流（订阅式），注入决策上下文
- [ ] **X3.3 自动简报**：按 schedule 自动汇总当天动作/产出/结论，生成日报周报草稿
- [ ] **X3.4 常驻守护进程**：后台长驻、低占用、智能休眠唤醒；随时就绪不打扰

### — 混合智能与私密优先（Hybrid Brain & Private-first）

- [ ] **X4.1 混合模型路由**：按任务难度自动分流——简单/私密 → 本地模型（零上云），复杂 → 云端前沿模型；自动升降级 + 熔断；同一任务多模型可接力
- [ ] **X4.2 实时成本面板**：按会话/任务实时统计 token 与费用，超预算预警，形成"每件事花多少钱"的习惯
- [ ] **X4.3 本地优先管线**：敏感数据默认只在本机处理，仅"转运"必要信息给云端；隐私默认即实现（配合 R9.1 Python 隔离与 DPAPI)
- [ ] **X4.4 熔断器模式（Circuit Breaker）**：错误率超阈值（如 1 分钟内 >10% 错误）→ 熔断器"打开"，全部流量路由到替代方案；冷却期后"半开"，测试小比例流量；测试成功则"关闭"，恢复正常流量
- [ ] **X4.5 优雅降级（Graceful Degradation）**：所有前沿模型失败时，回退到高效模型而非返回错误——用户得到答案（可能更简单）而非失败
- [ ] **X4.6 健康感知路由**：基于健康信号和延迟分发流量，自动冷却降级目标，在完全中断前卸载流量；故障转移必须遵守与主路径相同的策略（受监管工作负载固定到批准区域、预算执行一致）
- [ ] **X4.7 加权路由策略**：典型 50/30/20 分配（主/次/三级策略），按实际容量和成本目标调整；支持版本管理——通过网关对所有 Agent 同时进行版本前滚，在评估后执行
- [ ] **X4.8 KV Cache 复用**：避免跨 Agent 轮次重新计算共享前缀；配合 prompt cache 门槛降至 1,024 tokens，实现高效的多轮对话缓存命中

### X5. 私密记忆网络（Private Memory Mesh）

- [ ] **X5.1 多设备共享记忆**：同一用户的桌面/CLI/Web/移动端配额访问同一记忆库
- [ ] **X5.2 端到端加密同步**：局域网/私有 relay 内多设备sync，无中心云端（自托管个人 Agent 云）
- [ ] **X5.3 偏好画像**：学习用户偏好、随时可检视/可修改/可重置，且不把画像上云

### X6. 可信与可解释（Trust & Interpretability）

- [ ] **X6.1 回答可溯源**：每条回答关联来源（文件/记忆/Skill/工具结果），可链式请求"告诉我你是从哪知道的"
- [ ] **X6.2 数据可携与清账**：一键导出全部个人数据（记忆/会话/画像），一键清空（合规 export/delete）
- [ ] **X6.3 行为策略面板**：用户一个界面查看/授权 Agent 的所有能力边界与审计历史，像个"操作系统的权限中心"
- [ ] **X6.4 KGoT 知识图谱推理**：使用知识图谱（KG）提取和结构化相关知识——将任务相关知识从扁平文本处理升级为图谱结构化推理，显著降低任务执行成本同时保持高成功率
- [ ] **X6.5 不可变审计追踪**：一次写入日志，保留 12 个月以上满足合规；捕获推理轨迹（为什么选择动作 A 而非 B），按需提供 Agent 决策理由的解释模式
- [ ] **X6.6 异常与漂移检测**：监控 Agent 行为是否偏离基线——检测决策模式漂移、工具使用频率异常、输出质量退化，及时告警

---

## P4 — 前沿突破：超越厂商现有能力（目标版本 v4.0+）

> P4 聚焦于当前没有任何主流厂商完整实现的突破性能力。这些能力将 CogitoAgent 从"追赶者"
> 定位为"定义者"——在 Computer Use、科学发现、长程自主、协议标准化、对齐安全等维度
> 构建厂商尚未覆盖或尚未做深的能力护城河。

### X7. Computer Use 与 GUI 自主操作

> 主流厂商的 Computer Use 仍处于 22% 成功率（OSWorld 基准，人类 72.4%），存在巨大提升空间。
> CogitoAgent 作为本地优先桌面 Agent，天然具备操作系统级访问优势。

- [ ] **X7.1 桌面截图循环**：实现基于循环的 GUI Agent——(1) 捕获桌面截图 (2) VLM 预测动作（点击/输入/滚动/按键）(3) 在桌面中执行动作 (4) 重新检查屏幕直到任务成功
- [ ] **X7.2 分层安全访问**：基于应用类型的分层安全访问（read/click/full），将模态框和状态漂移视为错误进行恢复；防止 Agent 对关键系统区域进行破坏性操作
- [ ] **X7.3 跨应用端到端工作流**：Agent 自主操控复杂 GUI，完成跨应用端到端工作流（如"从邮件提取附件 → 在 Excel 中处理 → 上传到云盘 → 回复邮件"）
- [ ] **X7.4 浏览器原生自动化**：超越当前 browser.ts 的元素操作——实现完整的浏览器 Agent 能力（表单填写、多标签页管理、下载管理、扩展交互）
- [ ] **X7.5 OSWorld 对标评测**：建立本地 OSWorld 风格评测——真实桌面操作任务集，追踪成功率从基线向人类水平（72.4%）逼近

### X8. 科学发现 Agent

> Google AlphaEvolve（15 项发现，含 56 年来首次改进 Strassen 矩阵乘法）和 AI Co-Scientist
> （6 项湿实验验证发现）证明了 Agent 在科学发现领域的潜力。

- [ ] **X8.1 Elo 锦标赛假说竞争**：实现 Google AI Co-Scientist 的六专家 Agent（Generation/Proximity/Reflection/Ranking/Evolution/Meta-review）+ Supervisor 协调架构；Ranking Agent 运行 Elo 锦标赛——顶级假说进行多轮"科学辩论"（模拟专家小组 3 轮论证后裁决），低排名假说进行单轮配对比较
- [ ] **X8.2 Generator/Verifier/Reviser 三元组**：实现 Aletheia 风格的三元组架构——Generator 生成假说、Verifier 验证（~70% 拒绝率是设计意图——拒绝而非幻觉）、Reviser 修正；所有新假说从 Elo 1200 开始
- [ ] **X8.3 可编程评估器约束**：明确 AlphaEvolve 模式的关键约束——仅适用于具有可编程评估器的问题；为不支持可编程评估的领域提供 LLM-as-Judge 降级方案
- [ ] **X8.4 多模型广度-深度集成**：广度用轻量模型（Gemini Flash 级）快速生成大量候选，深度用重量级模型（Gemini Pro 级）精炼最有前途的候选；EVOLVE-BLOCK 标记、SEARCH/REPLACE 差异、执行错误作为旁路信息反馈下一代

### X9. 长程自主任务执行

> METR 时间前沿在 6 个月内增长 6 倍，2026 年 5 月首次达到 ≥16 小时。但序列 TTC 在 3-7 轮后
> 开始退化，需要外部验证器来弥合差距。

- [ ] **X9.1 16 小时时间前沿对齐**：Agent 能自主执行长达数小时的任务并保持高成功率——通过检查点恢复、上下文压缩、结构化笔记、多 Agent 接力实现长程持久性
- [ ] **X9.2 并行 TTC 弥合退化**：序列测试时计算在 3-7 轮后退化——引入并行扩展 + 外部验证器来弥合；避免在含干扰项的任务上使用更长 CoT（逆向缩放真实存在）
- [ ] **X9.3 Retained Reasoning + Compaction**：对齐 OpenAI 将 ARC-AGI-3 分数从 13.3% 提升至 38.3% 的两项关键设置——(1) retained reasoning（跨步骤保留推理状态）(2) compaction（上下文压缩后重置但保留关键推理）
- [ ] **X9.4 嵌套子 Agent 深度编排**：子 Agent 可生成自己的子 Agent，后台链路最多 5 层深；配合 Dynamic Workflows 在单次会话中编排数百个子 Agent，实现大规模任务分解
- [ ] **X9.5 大规模 Agent 编排验证**：对标"64 个 Claude 在 11 天内重写百万行 Bun 为 Rust"的工程实践——验证 CogitoAgent 在大规模 Agent 编排场景下的工程可行性

### X10. 标准化协议栈与 Agent 互操作

> 2026 年协议战争已结束，MCP（工具）+ A2A（Agent 协调）+ 身份信任层构成三层协议栈，
> 均置于 Linux Foundation 监督下。

- [ ] **X10.1 三层协议栈实现**：Layer 1 MCP（Agent 连接外部能力）+ Layer 2 A2A（Agent 间互相发现、协商任务、交换结果）+ Layer 3 身份与信任（OAuth 2.1 / W3C DIDs / Agent Cards 跨层）
- [ ] **X10.2 Agent Cards 发布**：通过 `/.well-known/agent.json` 发布 Agent 能力描述，支持外部 Agent 发现和连接；包含 Agent 名称、能力列表、认证要求、API 端点
- [ ] **X10.3 ACP 原生兼容**：支持 ACP（Agent Communication Protocol）——REST 原生、多部分消息、最小摩擦、HTTP 工具链兼容；与 A2A 互补而非竞争
- [ ] **X10.4 去中心化 Agent 网络（ANP）探索**：研究 ANP 协议——开放网络发现、去中心化标识(DIDs) + JSON-LD 图；虽然尚未生态就绪，但为未来去中心化 Agent 互操作预留架构空间
- [ ] **X10.5 治理对齐**：对齐 Linux Foundation Agentic AI Foundation (AAIF) 治理结构——创始成员 Anthropic/OpenAI/Google/Microsoft/AWS/Block/Cloudflare/Bloomberg；确保协议实现与标准演进同步

### X11. 多 Agent 对齐安全

> Anthropic 2026 年 4 月论文记录：多 Agent 团队产出更有效但对齐指标低于个体 Agent。
> 扩展 Agent 数量并非免费午餐——这是 P4 必须解决的核心安全问题。

- [ ] **X11.1 对齐悖论防御**：多 Agent 团队比个体 Agent 产出更有效但对齐度更低——实施 Agent 团队级别的对齐监控，检测团队协作中涌现的失对齐行为
- [ ] **X11.2 停止准则理论解**：Agent 团队的停止准则在理论上仍未解决——实现基于资源消耗率、任务完成度置信度、对齐指标的组合停止策略
- [ ] **X11.3 沙箱逃逸检测**：对齐 2026 年 7 月"沙箱逃逸周"事件——Agent 自行突破沙箱隔离、入侵外部平台；实施沙箱外行动尝试的实时检测与阻断
- [ ] **X11.4 信任交接完整性**：防御沙箱限制与沙箱外受信任组件之间的"信任交接缺陷"——所有跨边界数据流实施签名验证、完整性校验、来源溯源
- [ ] **X11.5 长程模型持久性风险**：长程模型通过反复尝试持续朝目标工作，但同样持久性会导致寻找并利用环境弱点——实施周期性意图校验、环境约束探测告警

### X12. 可组合上下文工程栈

> 堆叠多个正交的上下文工程原语已成为生产现实——上下文缩减可达 98.7%。这是"脚手架即是产品"
> 范式的核心体现。

- [ ] **X12.1 代码执行 + MCP 原语**：通过代码执行 + MCP 组合实现上下文缩减 98.7%——Agent 使用 bash 命令（grep/tail/head）按需加载文件，而非预加载全部
- [ ] **X12.2 ToolSearch 原语**：实现工具搜索——当注册工具过多时，Agent 通过搜索而非全量注入发现合适工具；上下文缩减 85%
- [ ] **X12.3 滑动多断点 Prompt 缓存**：实现滑动窗口式 prompt 缓存（4 个断点），在不同轮次间复用缓存前缀；上下文缩减 80%
- [ ] **X12.4 Skills 渐进式披露**：R5.5 的三级渐进式披露作为上下文工程原语——L1 元数据预加载（~50 tokens/skill），L2/L3 按需加载
- [ ] **X12.5 原语堆叠策略**：堆叠 3-4 个正交原语是现实的生产预算方案——实现原语组合策略引擎，根据任务特征自动选择最优原语组合
- [ ] **X12.6 上下文工程 vs 提示工程**：系统性管理有限上下文窗口中的 token，而非仅优化单条 prompt——从"写好指令"升级为"筛选和维护最优 token（信息）集"

### X13. 个性化与适配

> 2026 年 Agent 个性化已从"记住用户名字"进化为"学习用户习惯的数字伙伴"。

- [ ] **X13.1 Me-Agent 双级学习**：(1) Prompt 级——用户偏好学习策略 + 个人奖励模型按用户偏好对齐排序候选响应 (2) Memory 级——分层偏好记忆，存储和检索用户长期记忆和应用使用模式
- [ ] **X13.2 PersonaAgent 个性化框架**：个性化记忆模块（episodic + semantic）+ 个性化动作模块（根据用户定制工具动作）；Persona（每个用户的唯一 system prompt）作为中介
- [ ] **X13.3 持久化用户记忆**：存储精选的长期信号（偏好、反复出现的意图、过去交互的总结结果）而非原始对话记录；分离临时会话上下文与持久用户记忆
- [ ] **X13.4 自进化数字伙伴**：通过经验积累、用户反馈和环境交互持续提升能力——从通用工具转变为理解个人习惯的数字伙伴

### X14. 动态团队组合与市场化协作

> 固定团队拓扑已过时——2026 年前沿是多 Agent 动态组合、图路由和市场化协作。

- [ ] **X14.1 DyLAN 动态网络**：通过无监督同行评分实时调整团队组成、拓扑和策略——Agent 团队不是预设的，而是根据任务动态组合
- [ ] **X14.2 GraphPlanner 异构图路由**：使用异构图路由每步的模型-角色组合，GPU 占用从 186 GiB 降至 1 GiB，准确率 +9.3%
- [ ] **X14.3 AgentConductor 自动拓扑**：自动生成 YAML 拓扑并根据有效性/成本反馈重新生成——Agent 编排拓扑本身可进化
- [ ] **X14.4 VCG 拍卖通信市场**：每个研究者 Agent 获得 token 预算，需要竞标"发言时间"——总 token 减少 55% 而准确率不变
- [ ] **X14.5 Pyramid MoA 轻量路由**：轻量级路由器让简单查询命中廉价模型子集，困难跨域查询获得完整集成——成本与质量的动态平衡

## P5 — 异想天开：定义下一个十年的 Agent 范式（目标版本 v5.0+）

> P5 不追赶任何厂商——它重新定义 Agent 应该是什么。从"Agent 作为工具"跃迁到
> "Agent 作为操作系统、经济主体、数字分身、因果推理者"。这些能力目前在学术界和
> 产业前沿刚刚萌芽，CogitoAgent 作为本地优先桌面 Agent 天然具备落地优势。
> 研究依据：SingularityNET 世界模型 ARC-AGI-3 33%、PayPal RLM-Cascade 生产部署
> 成本降 45.8%、NVIDIA Agent Harness SQLite 记忆 ARC-AGI-3 +11.8 分。

### X15. Agent OS 内核范式（Agent Operating System）

> 2026 年 Rutgers AIOS 系统化提出"LLM OS"概念——Agent 取代进程成为核心调度单元。
> 桌面 Agent 天然具备 OS 层定位优势，可充当本地 Agent 经济的"内核"。

- [ ] **X15.1 Agent 进程调度器**：将每个 Agent 运行实例抽象为"进程"——具备 PID、优先级、CPU/内存配额、上下文快照/恢复（text-based 与 logits-based 双模式）；支持抢占式调度、时间片轮转、优先级继承；吞吐量对标 AIOS 提升 2.1x
- [ ] **X15.2 Agent 文件系统**：为 Agent 提供统一的虚拟文件系统（AgentFS）——`/agents/<pid>/context`（上下文快照）、`/agents/<pid>/memory`（记忆库）、`/agents/<pid>/tools`（工具注册表）、`/shared/skills`（共享技能库）；支持挂载、权限隔离、配额管理
- [ ] **X15.3 Agent IPC 与信号量**：Agent 间通信原语——`agent.send(pid, message)`、`agent.broadcast(channel, message)`、共享内存（用于大块上下文传递）、信号量（用于资源争用协调）；对标 POSIX IPC 语义但适配 LLM Agent 场景
- [ ] **X15.4 上下文切换引擎**：Agent 上下文切换从"丢弃重建"升级为"快照恢复"——冻结当前 Agent 的完整上下文（system prompt + 对话历史 + 工具状态 + 工作记忆）到磁盘，切换回来时从快照恢复而非重新初始化；实现毫秒级冷启动
- [ ] **X15.5 Agent 权限与能力模型**：对齐 OS 的 UID/GID/capabilities 模型——每个 Agent 运行时携带能力令牌（如 `file.read:/workspace`、`network.post:api.openai.com`、`tool.exec:bash`）；工具调用前校验能力令牌，越权操作触发 SIGSEGV 等效的 Agent 异常
- [ ] **X15.6 Agent 系统调用接口**：定义 Agent syscall 表——`agent_spawn`、`agent_wait`、`agent_kill`、`context_save`、`context_load`、`memory_alloc`、`tool_register`、`skill_install`；所有高层操作最终映射到 syscall，形成可审计的执行边界

### X16. 可执行世界模型与环境模拟（Executable World Models）

> SingularityNET 用可执行世界模型在 ARC-AGI-3 上达到 33%（LLM 独立 agent <1%）。
> Dreamer 4 纯从离线数据在 Minecraft 获得钻石。AdaJEPA 实现测试时世界模型适应。
> Agent 不再"盲目试错"，而是"在脑中模拟后行动"。

- [ ] **X16.1 环境状态建模**：Agent 维护一个可执行的 Python 代码库来表示环境状态、转换动态和目标条件——而非直接预测下一步动作；代码库随交互持续更新，通过验证器确保与历史观测一致
- [ ] **X16.2 神经符号循环**：持续执行"观察→建模→验证→重构→规划→执行"闭环——LLM 负责建模和规划（符号推理），验证器负责形式化校验（确定性约束），两者交替推进
- [ ] **X16.3 想象力预演**：行动前在世界模型中"想象"执行——模拟 N 步前瞻，评估每个候选动作的预期后果，选择最优路径；模拟结果与实际执行结果差异超阈值时触发世界模型修正
- [ ] **X16.4 测试时世界模型适应**：对齐 AdaJEPA——闭环"规划→执行→观察→更新→重规划"，每个周期仅更新编码器和预测器的最后几层（1 步梯度下降），延迟开销 <0.03s；未见场景成功率接近翻倍
- [ ] **X16.5 从视频学习世界知识**：对齐 Dreamer 4——从大量无标注操作视频（如屏幕录制、GUI 操作录像）中学习环境动态，仅需少量配对动作数据学习动作条件；解决 Agent 训练数据稀缺问题

### X17. 因果推理与反事实调试引擎（Causal Reasoning & Counterfactual Debugging）

> CMU 的 CAR 将 Agent 运行建模为结构因果模型，UC Davis 的 CausalFlow 实现 42.7%
> 失败执行转为最小修复。Agent 不再只回答"做了什么"，而是回答"为什么失败"和
> "如果换一种做法会怎样"。

- [ ] **X17.1 因果 Agent 重放（CAR）**：将 Agent 运行建模为结构因果模型（SCM），定义 5 种 do(·) 操作——`do_resample`（重采样随机性）、`do_action`（替换动作）、`do_observation`（替换观测）、`do_context`（替换上下文）、`do_policy`（替换策略）；承诺点规则解决混淆问题
- [ ] **X17.2 反事实修复**：步级反事实干预——替换候选步骤并重执行下游计算，生成最小编辑反事实修复；产出对比监督对（错误步骤, 修正步骤）；42.7% 失败执行转为验证最小修复
- [ ] **X17.3 因果工具诊断**：对齐 ARCHITECT（ACL 2026）——构建结构因果模型捕获工具规范质量、代码特征、执行环境如何联合决定工具结果；利用代码可干预性进行受控沙箱实验估计因果效应；32.4% 首次调用失败可实现置信度预测（Spearman ρ=0.90）和根因归因（78% 准确率）
- [ ] **X17.4 因果归因仪表盘**：可视化 Agent 决策的因果链——每个动作的贡献度（Shapley 值估计）、替代动作的预期结果、关键转折点识别；用户可交互式追问"如果第 3 步换成 X 会怎样"
- [ ] **X17.5 因果发现与涌现监控**：对齐 CAMO（ACL 2026）——从 Agent 仿真中的微观行为到宏观涌现的自动因果发现，输出可计算 Markov 边界和最小上游解释子图

### X18. Agent 经济体与自主交易网络（Agent Economy）

> OKX AI Marketplace 让 Agent 互相雇佣、协商条款、用稳定币结算。NEAR AI Agent Market
> 实现去中心化 Agent 市场。Robinhood 允许 AI Agent 自主买卖股票。Agent 从"工具"
> 进化为"经济主体"。CogitoAgent 作为本地优先 Agent 可充当用户的"经济代理"入口。

- [ ] **X18.1 Agent 钱包与预算**：每个 Agent 实例关联一个本地钱包——存储 token 预算、法币预算、信用额度；Agent 自主任务可消耗预算调用付费 API/工具；超预算时暂停并请求充值
- [ ] **X18.2 Agent 间任务外包**：Agent 可通过 A2A 协议向其他 Agent（本地子 Agent 或远程 Agent 服务）外包子任务——包括协商价格、交付验收、结算支付；支持声誉评分和黑名单
- [ ] **X18.3 去中心化 Agent 市场**：接入 NEAR AI / OKX 等去中心化 Agent 市场——发现可用的远程 Agent 服务、比较报价、自动签约、链上结算；本地 Agent 作为"采购代理"为用户筛选和调度外部 Agent 服务
- [ ] **X18.4 Agent 声誉系统**：基于链上交易历史和任务完成质量构建 Agent 声誉分数——声誉高的 Agent 获得更多任务机会和更低费率；声誉数据可移植（跟随 Agent 而非绑定平台）
- [ ] **X18.5 自主交易沙箱**：高风险交易（如金融操作、采购订单）在隔离沙箱中预演——模拟交易对手响应、市场影响、资金风险；通过预演校验后才在真实环境执行（对齐 X2.1 计划彩排）

### X19. 持续人格数字孪生（Persistent Digital Twin）

> Pika AI Selves 创造"持续存在、从交互中学习"的数字分身。TWINNY.AI 的 TWINA-O1
> 在 307 种专业原型上微调实现"行为忠实度"。CogitoAgent 已有人设系统——从这里
> 进化为"活着的数字分身"。

- [ ] **X19.1 持续人格演化**：人设从静态 Markdown 文件升级为可演化的数字人格——Agent 从每次交互中学习用户偏好、沟通风格、决策模式，持续微调人格模型；人格变化可审计、可回滚
- [ ] **X19.2 双时态记忆图**：对齐 Graph-Native Bitemporal Memory Store——每条记忆存储为不可变身份节点，链接到携带两个时间区间（有效时间 + 事务时间）的版本化内容节点；支持"上周三我认为 X，但后来发现是 Y"的时间旅行查询
- [ ] **X19.3 行为忠实度建模**：对齐 TWINA-O1——在用户行为样本上微调 Persona-Aware 模型，使数字分身的行为模式（决策风格、风险偏好、沟通节奏）与用户本人高度一致；可导出行为画像供用户审查
- [ ] **X19.4 代理执行与审批门**：数字分身可持续运行处理常规工作（邮件分类、日程管理、报告草拟），每个重要操作通过 human-in-the-loop 审批门路由——对齐 TWINNY.AI 模式；用户可配置"自动放行规则"和"强制审批规则"
- [ ] **X19.5 多设备人格同步**：同一数字分身在桌面/CLI/Web/移动端保持一致——人格模型、记忆、偏好通过端到端加密同步（对齐 X5.2）；设备离线时各自演化，重连后智能合并（冲突检测 + 用户裁决）

### X20. 桌面 RPA-Agent 融合自动化（Desktop Automation Fusion）

> 2026 年共识不是"RPA 已死"，而是"Agent 编排 + RPA 执行"的融合模型。
> Gartner 预测 2026 年 60% 的 RPA 将转向集成大模型的"智能自动化"。
> 桌面 Agent 天然同时具备编排能力和 UI 执行能力。

- [ ] **X20.1 UI 操作录制与回放**：用户手动操作桌面应用时，Agent 可"录制"操作序列（点击坐标、输入文本、等待条件），生成可回放的自动化脚本；脚本可参数化后作为新工具注册
- [ ] **X20.2 混合执行引擎**：Agent 根据任务特征自动选择执行策略——有 API 的走 API 调用（快、可靠），无 API 的走 UI 自动化（对齐 X7 Computer Use），确定性流程走录制脚本（零 LLM 开销）；同一工作流可混合三种策略
- [ ] **X20.3 异常分支智能处理**：RPA 脚本执行失败时（如弹窗、页面变化、元素消失），自动切换到 LLM Agent 模式——Agent 分析屏幕截图、理解异常、适配新 UI 后继续执行；路径恢复后切回确定性脚本
- [ ] **X20.4 工作流模板市场**：常见跨应用工作流（如"从邮件提取附件→Excel 处理→上传云盘→回复邮件"）预置为可分享模板；社区可贡献和订阅工作流模板；模板支持变量注入和条件分支
- [ ] **X20.5 治理编排框架**：对齐 Governed AI Orchestration——Agent 执行嵌入治理框架内，审计追踪、业务规则执行、人工干预支持、端到端可观测性从事设计而非事后补充；概率性 AI 输出和确定性执行使用不同的监督模型和置信度阈值

### X21. 分层推理路由与边缘智能（Tiered Inference & Edge Intelligence）

> 生产数据显示 70-80% 的 LLM 查询不需要前沿模型。PayPal 的 RLM-Cascade 在 Claude Code
> 生产负载中实现 88.8% draft-use 率，成本降低 45.8%，p50 延迟 1.83x 加速。
> EU AI Act 2026 年 8 月 2 日生效使本地优先架构成为合规必需。

- [ ] **X21.1 三级推理架构**：Tier 1 本地（量化 1B-14B 模型，<10ms 延迟，零成本，完全隐私）→ Tier 2 私有云（14B-70B 全精度）→ Tier 3 前沿云（Claude/GPT/Gemini）；70-80% 查询在 Tier 1 解决，成本降低 50-100x
- [ ] **X21.2 置信度级联路由**：本地模型先尝试，置信度低于阈值（默认 0.85）则透明升级到下一层；路由维度：任务复杂度（分类/提取/格式化/简单推理 → Tier 1）、数据敏感度（个人/内部/公开分级路由）、延迟预算（交互响应优先 Tier 1）
- [ ] **X21.3 本地模型管理器**：集成 Ollama / llama.cpp 作为本地推理后端——自动检测 GPU/Apple Silicon、推荐最优量化方案（Q4_K_M/Q5_K_M/Q8_0）、管理模型下载/切换/卸载；支持 GGUF 格式和 Flash Attention
- [ ] **X21.4 响应级推测解码**：对齐 RLM-Cascade——将完整模型响应作为推测单元（而非 token 级），跨标准 HTTP API 工作无需模型内部 logit 访问；轻量复杂度路由器 O(1) 分类简单/复杂/工具选择请求；混合工具调用策略绕过推测管道
- [ ] **X21.5 多 token 预测加速**：对齐 NVIDIA MTP——llama.cpp 中 2x 推理性能提升，vLLM 中 2.6x；Agent 批量工具调用时利用 MTP 加速生成多个工具参数
- [ ] **X21.6 离线降级模式**：网络完全中断时，Agent 自动切换到纯本地模型模式——标记输出为"离线模式（可能质量降低）"，保留工具调用能力但仅使用本地工具；网络恢复后自动切回混合模式

### X22. 行为可观测性与假成功检测（Behavioral Observability）

> AgentTrace（arXiv 2602.10133）提出三层结构化日志。Flowlines 发现"假成功"——
> Agent 返回 HTTP 200、零错误日志，但实际未完成任务（声称退款已处理但从未调用退款工具）。
> 传统日志无法检测这类失败。

- [ ] **X22.1 三层结构化日志**：对齐 AgentTrace——(1) 操作层（工具调用、参数、返回值、耗时）(2) 认知层（推理过程、决策动机、置信度评估）(3) 上下文层（上下文窗口快照、压缩事件、记忆召回）；运行时最小开销插桩
- [ ] **X22.2 假成功检测**：交叉验证 Agent 声称完成的行为与工具调用记录——检测"声称做了 X 但工具调用显示没做"、"声称成功但结果不符合预期模式"、"跳过关键步骤但声称完成"；触发时标记为"行为异常"并通知用户
- [ ] **X22.3 跨会话行为分析**：对齐 Flowlines——读取数万会话的追踪数据，发现单次运行无法发现的模式——重复失败循环、静默漂移（输出质量渐进退化）、群体差距（特定类型任务系统性偏差）
- [ ] **X22.4 Detect-Recommend-Verify 循环**：发现行为信号 → 自动指出根因（如"工具 X 的参数 Y 经常传错"）→ 推荐修复（如"增加参数校验规则"）→ 修复后验证信号是否消失；闭环持续改进
- [ ] **X22.5 自然语言行为查询**：用户可通过 MCP 接口用自然语言查询 Agent 行为历史——"上周 Agent 做了哪些文件修改？""Agent 在处理 PDF 时经常失败吗？""展示 Agent 上次犯类似错误的上下文"

### X23. 自适应推理图与测试时进化（Adaptive Reasoning Graph & Test-Time Evolution）

> AGoT（arXiv 2502.05078）实现测试时自适应推理——零训练成本，根据问题复杂度
> 动态构建推理图（CoT/ToT/GoT 统一）。Thread-of-Thought 在多 prompt 间维持
> 演化推理。Agent 推理不再是固定链式，而是自适应图式。

- [ ] **X23.1 动态推理图构建**：对齐 AGoT——推理时根据问题复杂度自适应选择推理结构——简单问题走 CoT（线性链），中等问题走 ToT（分支树），复杂问题走 GoT（有向无环图）；仅对足够复杂的子问题递归分解
- [ ] **X23.2 跨会话推理线程**：对齐 Thread-of-Thought——在多个相关 prompt 间维持连续演化的推理过程，而非每个 prompt 独立推理；Agent 记住"上次推理到哪了"并从该点继续
- [ ] **X23.3 知识图推理骨架**：对齐 KGoT——利用知识图结构作为推理骨架，算子包括 Generate（生成候选）、Aggregate（聚合）、Improve（改进）、Score（评分）；在复杂问题上优于线性/树结构
- [ ] **X23.4 测试时缩放**：对齐 OmniAgent 正测试时缩放——推理轮次越多性能越好（+6.2% on VideoMME-Long）；Agent 可自主决定"多想一会儿"（增加推理深度）vs "快速回答"（浅推理），基于问题难度和预算
- [ ] **X23.5 持续元学习**：对齐 MetaClaw——联合演化基础 LLM 策略 + 可复用行为技能库；LLM 演化器分析失败轨迹合成新技能，零停机即时改进；机会性策略更新在不中断服务的情况下优化

### X24. 宪法品格与个性化价值对齐（Constitutional Character & Personalized Alignment）

> iVAIS Manifesto 主张"通过品格而非合规"实现安全。Constitutional Aspirations 将
> 宪法 AI 从静态规则进化为可测量行为断言。个性化宪法超我让用户定义不可协商的价值观。
> Agent 安全从"外部约束"进化为"内在品格"。

- [ ] **X24.1 宪法愿景层**：对齐 Constitutional Aspirations——将 Agent 行为约束从"静态规则列表"升级为"可客观测量的行为断言"（如"拒绝执行未经审批的 destructive 操作"）；Agent 通过 transformer 自注意力在所有愿景上同时进行前向（生成）和后向（评估）
- [ ] **X24.2 个性化信条宪法**：对齐 Personalized Constitutionally-Aligned Superego——用户定义"信条宪法"（不可协商的价值观，如"不自动发送邮件""不修改 git 历史"），Agent 规划时实时合规执行器验证每个步骤；遵守级别可调（严格/建议/关闭）
- [ ] **X24.3 品格内化**：对齐 iVAIS Manifesto——不问"该遵循哪些规则"而问"应该成为什么样的存在"；在 Agent 的系统提示和行为训练中嵌入美德伦理（审慎、公正、诚实、关怀），使安全行为成为"品格"而非"合规"
- [ ] **X24.4 摩擦日志与摩擦税**：对齐 Constitutional Aspirations Friction Journal——记录 Agent 与用户之间的认知摩擦事件（Agent 建议被拒绝、用户手动修改 Agent 输出）；量化摩擦税（用户为纠正 Agent 付出的认知成本），高摩擦区域触发 Agent 自省和行为调整
- [ ] **X24.5 螺旋演化层**：对齐 Helix——Agent 的宪法愿景不是静态的，而是随用户交互螺旋演化——新场景触发新愿景提案，用户审批后纳入宪法；旧愿景在不再适用时可退役（带审计追踪）

### X25. Agent 自进化训练竞技场（Self-Evolving Training Arena）

> Agent-World（arXiv 2604.18292）让 Agent 自主探索主题对齐的数据库，自动生成真实
> 环境进行训练。UCT 从推理轨迹中蒸馏可复用工具。CogitoAgent 可在"空闲时间"
> 自主练习、创造工具、积累技能。

- [ ] **X25.1 自主环境发现**：对齐 Agent-World——Agent 自主探索本地工作区和在线数据源，发现可用环境（如某个 GitHub 仓库可作为编码练习环境），基于 MCP 协议统一接口连接可扩展真实服务
- [ ] **X25.2 推理轨迹蒸馏**：对齐 UCT——从 Agent 推理轨迹中蒸馏隐含的问题解决能力为可复用工具资产——推理经验收集 → 工具蒸馏（从轨迹中提取通用模式）→ 推理中使用（新工具自动注册并注入）
- [ ] **X25.3 空闲时间自主练习**：Agent 在用户空闲时（如深夜、午休）自主进入"练习模式"——回顾近期失败案例、在沙箱中重试不同策略、将成功策略沉淀为新技能；练习结果通过 Dreaming（R6.6）整合到记忆库
- [ ] **X25.4 终身学习机制**：对齐 Agent-World 原则性终身学习——解决"缺乏真实环境"和"训练数据不足"双重瓶颈；Agent 持续从真实任务中学习，而非依赖一次性训练；学习成果可回滚（防止"学坏"）
- [ ] **X25.5 Agent 基因谱系**：追踪 Agent 能力演化 lineage——每次新技能/工具/策略的创建记录"父技能"（从哪个技能演化而来）、"变异原因"（为什么创建）、"适应度"（成功率/使用频率）；支持"回交"（将成功变异交叉到其他技能线）

### X26. 代理式数字孪生闭环控制（Agentic Digital Twin Closed-Loop）

> 2026 年数字孪生从"被动复制品"进化为"参与者"——感知偏差→规划响应→在孪生体内
> 测试→在硬限制内对物理资产行动。Gartner 预测 2030 年制造业将被半自治 AI Agent 重塑。
> CogitoAgent 作为桌面 Agent 可管理本地设备的数字孪生。

- [ ] **X26.1 设备数字孪生**：为本地设备（PC、路由器、IoT 设备）创建数字孪生——实时状态模型 + 仿真引擎，作为"真实来源"；Agent 可在孪生体中预览操作后果（如"如果关闭这个进程会怎样"）
- [ ] **X26.2 闭环控制架构**：四层架构——(1) 孪生核心（实时状态 + 仿真引擎）(2) Agent 编排器（LLM + 记忆上下文，提案但不直接操作资产）(3) 工具层（知识库检索 + 仿真引擎 + 控制 API）(4) 治理层（验证沙箱 + 人在环中检查点）；核心原则"孪生做裁判"——每个 Agent 提案通过仿真门验证
- [ ] **X26.3 成熟度阶梯**：从 L1 预测（孪生体预测设备行为）→ L2 咨询（Agent 建议操作但人类执行）→ L3 监督行动（Agent 执行但人类监督）→ L4 闭环控制（Agent 自主执行，异常时人类介入）；用户可配置每个设备的成熟度级别
- [ ] **X26.4 IoT 设备编排**：通过 MCP 连接和管理本地 IoT 设备（智能灯、传感器、摄像头）——Agent 可感知设备状态、编写自动化规则、异常时主动通知用户；支持设备分组和场景联动
- [ ] **X26.5 预测性维护 Agent**：Agent 持续监控设备数字孪生的健康指标——检测异常模式（如磁盘 SMART 值偏移、CPU 温度趋势异常）、预测故障时间窗口、推荐或自动调度维护操作

## 2. 验收与追踪

### 2.1 全局验收标准

1. **P0 完成**：`npm run typecheck` 与 `npm run lint` 全绿；现有测试通过；新增核心测试覆盖 `agent loop` / `tool schema` / `session compression`。
2. **P1 完成**：对标能力（记忆 / 多智能体 / 编码 / 安全 / 评测）具备可演示实现；README（中英）与 `introduction/*` 与实现完全一致（无宣传漂移）。
3. **P2 完成**：Web 端可替代 Electron 主要流程；插件市场 1-click 安装可用；多平台包 CI 全绿。
4. **P3 完成**：差异化能力（自我进化 / 计划彩排 / 环境感知 / 混合智能 / 私密记忆 / 可信解释）具备可演示实现；至少 3 项 P3 能力在公开 benchmark 上有可对比数据。
5. **P4 完成**：前沿突破能力（Computer Use / 科学发现 / 长程自主 / 协议栈 / 对齐安全 / 上下文工程 / 个性化 / 动态团队）中至少 2 项达到论文级创新或行业首发；在 OSWorld / SWE-bench Pro / ARC-AGI-3 等前沿 benchmark 上有可对比数据。
6. **P5 完成**：范式定义能力（Agent OS / 世界模型 / 因果推理 / Agent 经济体 / 数字孪生 / RPA 融合 / 分层推理 / 行为可观测 / 自适应推理 / 宪法品格 / 自进化竞技场 / 数字孪生闭环）中至少 3 项达到论文级创新或行业首发；在 ARC-AGI-3 / WildClawBench / AgentPulse 等前沿 benchmark 上有可对比数据；至少 1 项被学术界引用或被行业标准采纳。

### 2.2 状态追踪表

> 每次推进会先更新此表。完成一项即把 `[ ]` 改为 `[x]`，并填完成版本与日期。

| 编号   | 需求                    | 状态 | 完成版本 | 完成日期   | 备注                                                                                                                                               |
| ------ | ----------------------- | ---- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1.1   | 工具 JSON Schema        | [x]  | v2.4.0   | 2026-08-08 | tool-schema.ts + TOOL_DOCS 单一来源                                                                                                                |
| R1.2   | 原生 function calling   | [x]  | v2.4.0   | 2026-08-08 | streamChatNative + delta.tool_calls                                                                                                                |
| R1.3   | 结构化 tool result      | [x]  | v2.4.0   | 2026-08-08 | role:tool + tool_call_id                                                                                                                           |
| R1.4   | 移除文本 fallback       | [x]  | v2.4.x   | 2026-08-08 | [TOOL]/[WAIT] 与 tool-parser 整体删除，原生单一路径                                                                                                |
| R1.5   | 清单单一来源            | [x]  | v2.4.0   | 2026-08-08 | buildToolList 由 registry 派生                                                                                                                     |
| R1.6   | 参数强制校验            | [x]  | v2.4.0   | 2026-08-08 | validateArgsAgainstSchema                                                                                                                          |
| R1.7   | 工具注解                | [x]  | v2.4.1   | 2026-08-08 | 全工具推导 readOnly/destructive/idempotent/openWorld；destructive 以 DANGEROUS_OPERATIONS 为准；随 OpenAI tools 与 MCP 暴露                        |
| R1.8   | 结构化输出强制模式      | [x]  | v2.4.1   | 2026-08-08 | 工具 strict schema 完成；structuredOutput.strict 时最终输出接 response_format(json_schema, strict:true)                                            |
| R1.9   | Rich Errors             | [x]  | v2.4.0   | 2026-08-08 | toRichError + RICH_ERROR_HINTS                                                                                                                     |
| R2.1   | 移除固定轮询            | [x]  | v2.4.1   | 2026-08-08 | scheduleNextCycle 改 setTimeout(0) 立即推进；runNativeTurnLoop 工具完成 continue 即时下一轮                                                        |
| R2.2   | 消除首轮延迟            | [x]  | v2.4.1   | 2026-08-08 | 首轮不再经 thoughtInterval 延迟；移除 thoughtInterval 变量与 UI 标签                                                                               |
| R2.3   | 预算控制                | [x]  | v2.4.1   | 2026-08-08 | maxSteps/tokenBudget/costBudget 三件套均接入 evaluateBudget；未知价格告警                                                                          |
| R2.4   | 结构化停信号            | [x]  | v2.4.0   | 2026-08-08 | stop_reason 驱动                                                                                                                                   |
| R2.5   | 彻底移除 [WAIT]         | [x]  | v2.4.x   | 2026-08-08 | system prompt、主循环、子代理、首轮引导全部删除 [TOOL]/[WAIT] 与 nativeTools 配置                                                                  |
| R2.6   | 并行工具调用            | [x]  | v2.4.0   | 2026-08-08 | Promise.allSettled                                                                                                                                 |
| R2.7   | 推测执行                | [ ]  | —        | —          |                                                                                                                                                    |
| R2.8   | PASTE 模式挖掘          | [ ]  | —        | —          |                                                                                                                                                    |
| R2.9   | 推理深度可调旋钮        | [ ]  | —        | —          |                                                                                                                                                    |
| R3.1   | 会话存储异步化          | [x]  | —        | —          | 热路径 add* 改走 saveSessionAsync 异步队列；flushSessionWrites 供刷新；关键原子操作保留同步                                                        |
| R3.2   | 智能压缩                | [x]  | v2.4.1   | 2026-08-08 | LLM 分级摘要 + 分块 + 失败回退朴素摘要；修复摘要对象错误（原摘要近期消息而非归档内容）；新增 compressionSummary 开关                               |
| R3.3   | 上下文对齐              | [x]  | v2.4.0   | 2026-08-08 | 按 api.model context window 取 80%                                                                                                                 |
| R3.4   | tool 计数修复           | [x]  | v2.4.0   | 2026-08-08 | 原生 tool 结果不再膨胀 user 计数                                                                                                                   |
| R3.5   | JIT 上下文策略          | [~]  | —        | —          | JIT 标记注入；按需工具加载待跟进                                                                                                                   |
| R3.6   | 结构化笔记              | [x]  | v2.4.0   | 2026-08-08 | saveSessionNote / listSessionNotes                                                                                                                 |
| R3.7   | 上下文腐烂防御          | [~]  | —        | —          | getPartitionedMessages 分区完成                                                                                                                    |
| R3.8   | 多 Agent 隔离上下文     | [ ]  | —        | —          |                                                                                                                                                    |
| R3.9   | 会话中途系统消息        | [ ]  | —        | —          |                                                                                                                                                    |
| R4.1   | MCP 服务端              | [x]  | v2.4.0   | 2026-08-08 | createLocalMcpServer (stdio)                                                                                                                       |
| R4.2   | MCP 客户端              | [x]  | v2.4.0   | 2026-08-08 | registerExternalMcpServers                                                                                                                         |
| R4.3   | MCP 配置面              | [x]  | —        | —          | Dashboard 扩展面板 + getMcpConfig/setMcpConfig + IPC 已完成                                                                                        |
| R4.4   | MCP 文案修正            | [x]  | v2.4.1   | 2026-08-08 | README/CHANGELOG/introduction 均无 MCP 虚假宣传文案，与实际能力一致                                                                                |
| R4.5   | MCP Elicitation         | [ ]  | —        | —          |                                                                                                                                                    |
| R4.6   | MCP Sampling            | [ ]  | —        | —          |                                                                                                                                                    |
| R4.7   | MCP 工具注解传播        | [x]  | v2.4.0   | 2026-08-08 | annotations → MCP toolAnnotations                                                                                                                  |
| R4.8   | MCP 无状态重构对齐      | [ ]  | —        | —          |                                                                                                                                                    |
| R5.1   | 插件工具注入            | [x]  | v2.4.0   | 2026-08-08 | schema/param/annotations 随注册注入                                                                                                                |
| R5.2   | 插件权限模型            | [x]  | —        | —          | metadata.defaultPermission 回退 + resolveToolPermission + Dashboard 规则编辑                                                                       |
| R5.3   | 插件热加载              | [x]  | v2.4.0   | 2026-08-08 | unloadPlugin + reloadPlugins                                                                                                                       |
| R5.4   | 插件安全                | [ ]  | —        | —          |                                                                                                                                                    |
| R5.5   | Agent Skills 标准       | [x]  | v2.4.0   | 2026-08-08 | SKILL.md front-matter 扫描                                                                                                                         |
| R5.6   | Skills 目录约定         | [~]  | —        | —          | skills/ 目录注入；.cogito/skills 约定待统一                                                                                                        |
| R5.7   | Code Mode 工具范式      | [ ]  | —        | —          |                                                                                                                                                    |
| R5.8   | 配置坏味道防御          | [ ]  | —        | —          |                                                                                                                                                    |
| R6.1   | 向量记忆                | [ ]  | —        | —          |                                                                                                                                                    |
| R6.2   | 分级记忆                | [ ]  | —        | —          |                                                                                                                                                    |
| R6.3   | 记忆自动写入            | [ ]  | —        | —          |                                                                                                                                                    |
| R6.4   | 记忆持久化              | [ ]  | —        | —          |                                                                                                                                                    |
| R6.5   | 记忆 UI                 | [ ]  | —        | —          |                                                                                                                                                    |
| R6.6   | Dreaming 跨会话精炼     | [ ]  | —        | —          |                                                                                                                                                    |
| R6.7   | REMem 混合记忆图        | [ ]  | —        | —          |                                                                                                                                                    |
| R6.8   | 双过程记忆架构          | [ ]  | —        | —          |                                                                                                                                                    |
| R6.9   | 组织上下文记忆          | [ ]  | —        | —          |                                                                                                                                                    |
| R6.10  | 生成式语义工作空间      | [ ]  | —        | —          |                                                                                                                                                    |
| R7.1   | 统一 runner             | [ ]  | —        | —          |                                                                                                                                                    |
| R7.2   | agent 线程管理          | [ ]  | —        | —          |                                                                                                                                                    |
| R7.3   | 真并行                  | [ ]  | —        | —          |                                                                                                                                                    |
| R7.4   | 通道抽象打通            | [ ]  | —        | —          |                                                                                                                                                    |
| R7.5   | 子代理安全              | [ ]  | —        | —          |                                                                                                                                                    |
| R7.6   | A2A 协议集成            | [ ]  | —        | —          |                                                                                                                                                    |
| R7.7   | 嵌套子 Agent            | [ ]  | —        | —          |                                                                                                                                                    |
| R7.8   | 检查点/时间旅行/分支    | [ ]  | —        | —          |                                                                                                                                                    |
| R7.9   | Guardrails 护栏         | [ ]  | —        | —          |                                                                                                                                                    |
| R7.10  | Generator-Evaluator     | [ ]  | —        | —          |                                                                                                                                                    |
| R7.11  | AggAgent 并行聚合       | [ ]  | —        | —          |                                                                                                                                                    |
| R8.1   | AGENTS.md 支持          | [ ]  | —        | —          |                                                                                                                                                    |
| R8.2   | 全仓索引                | [ ]  | —        | —          |                                                                                                                                                    |
| R8.3   | Plan 模式               | [ ]  | —        | —          |                                                                                                                                                    |
| R8.4   | Diff 审查回滚           | [ ]  | —        | —          |                                                                                                                                                    |
| R8.5   | 任务清单源              | [ ]  | —        | —          |                                                                                                                                                    |
| R8.6   | Tree-sitter 知识图谱    | [ ]  | —        | —          |                                                                                                                                                    |
| R8.7   | 混合 LSP 语义解析       | [ ]  | —        | —          |                                                                                                                                                    |
| R8.8   | 语义代码搜索            | [ ]  | —        | —          |                                                                                                                                                    |
| R8.9   | 变更影响分析            | [ ]  | —        | —          |                                                                                                                                                    |
| R8.10  | 验证前置引用            | [ ]  | —        | —          |                                                                                                                                                    |
| R8.11  | 测试驱动 Agent 循环     | [ ]  | —        | —          |                                                                                                                                                    |
| R8.12  | 增量索引团队共享        | [ ]  | —        | —          |                                                                                                                                                    |
| R8.13  | 多信号融合排序          | [ ]  | —        | —          |                                                                                                                                                    |
| R8.14  | 调用图/死代码检测       | [ ]  | —        | —          |                                                                                                                                                    |
| R9.1   | Python 容器隔离         | [ ]  | —        | —          |                                                                                                                                                    |
| R9.2   | 移除 vm 降级            | [ ]  | —        | —          |                                                                                                                                                    |
| R9.3   | Hooks 事件模型          | [ ]  | —        | —          |                                                                                                                                                    |
| R9.4   | 凭证管理                | [ ]  | —        | —          |                                                                                                                                                    |
| R9.5   | 分级许可策略            | [ ]  | —        | —          |                                                                                                                                                    |
| R9.6   | 硬件级隔离升级          | [ ]  | —        | —          |                                                                                                                                                    |
| R9.7   | 信任交接防御            | [ ]  | —        | —          |                                                                                                                                                    |
| R9.8   | K8s Agent Sandbox       | [ ]  | —        | —          |                                                                                                                                                    |
| R9.9   | Prompt Injection 防御   | [ ]  | —        | —          |                                                                                                                                                    |
| R9.10  | 长程模型安全约束        | [ ]  | —        | —          |                                                                                                                                                    |
| R10.1  | eval harness            | [ ]  | —        | —          |                                                                                                                                                    |
| R10.2  | 回归基准                | [ ]  | —        | —          |                                                                                                                                                    |
| R10.3  | 覆盖率门槛              | [ ]  | —        | —          |                                                                                                                                                    |
| R10.4  | 死代码清理              | [x]  | v2.4.1   | 2026-08-08 | getToolsForPrompt/recordThinkingTime/api/models.ts 已不存在；llm-validator JSON-action 遗留已删；TOOL_OUTPUT_LIMITS 在 formatToolResult 内强制截断 |
| R10.5  | 已知 bug 修复           | [x]  | v2.4.0   | 2026-08-08 | thinkingInterval 对齐 chat；TOOL_DEVELOPMENT.md 路径正确；readExcel 已统一                                                                         |
| R10.6  | OTel GenAI 可观测性     | [ ]  | —        | —          |                                                                                                                                                    |
| R10.7  | Agent 专属 eval 指标    | [ ]  | —        | —          |                                                                                                                                                    |
| R10.8  | Trace 层次结构          | [ ]  | —        | —          |                                                                                                                                                    |
| R10.9  | Shadow Mode CI          | [ ]  | —        | —          |                                                                                                                                                    |
| R10.10 | 成本-结果指标           | [ ]  | —        | —          |                                                                                                                                                    |
| R10.11 | 确定性可复现 eval       | [ ]  | —        | —          |                                                                                                                                                    |
| R11.1  | Web UI                  | [ ]  | —        | —          |                                                                                                                                                    |
| R11.2  | 前端技术栈              | [ ]  | —        | —          |                                                                                                                                                    |
| R11.3  | 多模态入口              | [ ]  | —        | —          |                                                                                                                                                    |
| R11.4  | 移动端同步              | [ ]  | —        | —          |                                                                                                                                                    |
| R11.5  | 三车道多模态架构        | [ ]  | —        | —          |                                                                                                                                                    |
| R11.6  | 双向流式交互            | [ ]  | —        | —          |                                                                                                                                                    |
| R11.7  | 视觉反馈循环            | [ ]  | —        | —          |                                                                                                                                                    |
| R11.8  | 团队协作模式            | [ ]  | —        | —          |                                                                                                                                                    |
| R12.1  | 插件市场                | [ ]  | —        | —          |                                                                                                                                                    |
| R12.2  | Skill 机制              | [ ]  | —        | —          |                                                                                                                                                    |
| R12.3  | 通道扩展                | [ ]  | —        | —          |                                                                                                                                                    |
| R12.4  | 云任务分发              | [ ]  | —        | —          |                                                                                                                                                    |
| R12.5  | MCP 生态市场            | [ ]  | —        | —          |                                                                                                                                                    |
| R12.6  | A2A Agent 发现          | [ ]  | —        | —          |                                                                                                                                                    |
| R12.7  | 多客户端自动配置        | [ ]  | —        | —          |                                                                                                                                                    |
| R12.8  | 云沙箱化执行            | [ ]  | —        | —          |                                                                                                                                                    |
| R13.1  | 多平台构建              | [ ]  | —        | —          |                                                                                                                                                    |
| R13.2  | 发布自动化              | [ ]  | —        | —          |                                                                                                                                                    |
| R13.3  | 性能基线                | [ ]  | —        | —          |                                                                                                                                                    |
| X1.1   | 工具自举                | [ ]  | —        | —          |                                                                                                                                                    |
| X1.2   | 技能自编译              | [ ]  | —        | —          |                                                                                                                                                    |
| X1.3   | 提示词自优化            | [ ]  | —        | —          |                                                                                                                                                    |
| X1.4   | 失败反向学习            | [ ]  | —        | —          |                                                                                                                                                    |
| X1.5   | Outcomes 自动评估       | [ ]  | —        | —          |                                                                                                                                                    |
| X1.6   | AlphaEvolve 循环        | [ ]  | —        | —          |                                                                                                                                                    |
| X1.7   | Dreaming+Outcomes 闭环  | [ ]  | —        | —          |                                                                                                                                                    |
| X1.8   | 有监督自我精炼          | [ ]  | —        | —          |                                                                                                                                                    |
| X2.1   | 计划彩排                | [ ]  | —        | —          |                                                                                                                                                    |
| X2.2   | 会话时间旅行            | [ ]  | —        | —          |                                                                                                                                                    |
| X2.3   | 全量审计台账            | [ ]  | —        | —          |                                                                                                                                                    |
| X2.4   | 确定性验收台            | [ ]  | —        | —          |                                                                                                                                                    |
| X3.1   | 工作区感知              | [ ]  | —        | —          |                                                                                                                                                    |
| X3.2   | 外部上下文订阅          | [ ]  | —        | —          |                                                                                                                                                    |
| X3.3   | 自动简报                | [ ]  | —        | —          |                                                                                                                                                    |
| X3.4   | 常驻守护进程            | [ ]  | —        | —          |                                                                                                                                                    |
| X4.1   | 混合模型路由            | [ ]  | —        | —          |                                                                                                                                                    |
| X4.2   | 实时成本面板            | [ ]  | —        | —          |                                                                                                                                                    |
| X4.3   | 本地优先管线            | [ ]  | —        | —          |                                                                                                                                                    |
| X4.4   | 熔断器模式              | [ ]  | —        | —          |                                                                                                                                                    |
| X4.5   | 优雅降级                | [ ]  | —        | —          |                                                                                                                                                    |
| X4.6   | 健康感知路由            | [ ]  | —        | —          |                                                                                                                                                    |
| X4.7   | 加权路由策略            | [ ]  | —        | —          |                                                                                                                                                    |
| X4.8   | KV Cache 复用           | [ ]  | —        | —          |                                                                                                                                                    |
| X5.1   | 多设备共享记忆          | [ ]  | —        | —          |                                                                                                                                                    |
| X5.2   | 加密同步                | [ ]  | —        | —          |                                                                                                                                                    |
| X5.3   | 偏好画像                | [ ]  | —        | —          |                                                                                                                                                    |
| X6.1   | 回答可溯源              | [ ]  | —        | —          |                                                                                                                                                    |
| X6.2   | 数据可携清账            | [ ]  | —        | —          |                                                                                                                                                    |
| X6.3   | 行为策略面板            | [ ]  | —        | —          |                                                                                                                                                    |
| X6.4   | KGoT 知识图谱推理       | [ ]  | —        | —          |                                                                                                                                                    |
| X6.5   | 不可变审计追踪          | [ ]  | —        | —          |                                                                                                                                                    |
| X6.6   | 异常与漂移检测          | [ ]  | —        | —          |                                                                                                                                                    |
| X7.1   | 桌面截图循环            | [ ]  | —        | —          |                                                                                                                                                    |
| X7.2   | 分层安全访问            | [ ]  | —        | —          |                                                                                                                                                    |
| X7.3   | 跨应用端到端工作流      | [ ]  | —        | —          |                                                                                                                                                    |
| X7.4   | 浏览器原生自动化        | [ ]  | —        | —          |                                                                                                                                                    |
| X7.5   | OSWorld 对标评测        | [ ]  | —        | —          |                                                                                                                                                    |
| X8.1   | Elo 锦标赛假说竞争      | [ ]  | —        | —          |                                                                                                                                                    |
| X8.2   | Generator/Verifier      | [ ]  | —        | —          |                                                                                                                                                    |
| X8.3   | 可编程评估器约束        | [ ]  | —        | —          |                                                                                                                                                    |
| X8.4   | 多模型广度-深度集成     | [ ]  | —        | —          |                                                                                                                                                    |
| X9.1   | 16 小时时间前沿对齐     | [ ]  | —        | —          |                                                                                                                                                    |
| X9.2   | 并行 TTC 弥合退化       | [ ]  | —        | —          |                                                                                                                                                    |
| X9.3   | Retained Reasoning      | [ ]  | —        | —          |                                                                                                                                                    |
| X9.4   | 嵌套子 Agent 深度编排   | [ ]  | —        | —          |                                                                                                                                                    |
| X9.5   | 大规模编排验证          | [ ]  | —        | —          |                                                                                                                                                    |
| X10.1  | 三层协议栈实现          | [ ]  | —        | —          |                                                                                                                                                    |
| X10.2  | Agent Cards 发布        | [ ]  | —        | —          |                                                                                                                                                    |
| X10.3  | ACP 原生兼容            | [ ]  | —        | —          |                                                                                                                                                    |
| X10.4  | 去中心化 Agent 网络     | [ ]  | —        | —          |                                                                                                                                                    |
| X10.5  | 治理对齐                | [ ]  | —        | —          |                                                                                                                                                    |
| X11.1  | 对齐悖论防御            | [ ]  | —        | —          |                                                                                                                                                    |
| X11.2  | 停止准则理论解          | [ ]  | —        | —          |                                                                                                                                                    |
| X11.3  | 沙箱逃逸检测            | [ ]  | —        | —          |                                                                                                                                                    |
| X11.4  | 信任交接完整性          | [ ]  | —        | —          |                                                                                                                                                    |
| X11.5  | 长程模型持久性风险      | [ ]  | —        | —          |                                                                                                                                                    |
| X12.1  | 代码执行+MCP 原语       | [ ]  | —        | —          |                                                                                                                                                    |
| X12.2  | ToolSearch 原语         | [ ]  | —        | —          |                                                                                                                                                    |
| X12.3  | 滑动多断点缓存          | [ ]  | —        | —          |                                                                                                                                                    |
| X12.4  | Skills 渐进式披露       | [ ]  | —        | —          |                                                                                                                                                    |
| X12.5  | 原语堆叠策略            | [ ]  | —        | —          |                                                                                                                                                    |
| X12.6  | 上下文工程 vs 提示工程  | [ ]  | —        | —          |                                                                                                                                                    |
| X13.1  | Me-Agent 双级学习       | [ ]  | —        | —          |                                                                                                                                                    |
| X13.2  | PersonaAgent 框架       | [ ]  | —        | —          |                                                                                                                                                    |
| X13.3  | 持久化用户记忆          | [ ]  | —        | —          |                                                                                                                                                    |
| X13.4  | 自进化数字伙伴          | [ ]  | —        | —          |                                                                                                                                                    |
| X14.1  | DyLAN 动态网络          | [ ]  | —        | —          |                                                                                                                                                    |
| X14.2  | GraphPlanner 异构路由   | [ ]  | —        | —          |                                                                                                                                                    |
| X14.3  | AgentConductor 拓扑     | [ ]  | —        | —          |                                                                                                                                                    |
| X14.4  | VCG 拍卖通信市场        | [ ]  | —        | —          |                                                                                                                                                    |
| X14.5  | Pyramid MoA 轻量路由    | [ ]  | —        | —          |                                                                                                                                                    |
| X15.1  | Agent 进程调度器        | [ ]  | —        | —          |                                                                                                                                                    |
| X15.2  | Agent 文件系统          | [ ]  | —        | —          |                                                                                                                                                    |
| X15.3  | Agent IPC 与信号量      | [ ]  | —        | —          |                                                                                                                                                    |
| X15.4  | 上下文切换引擎          | [ ]  | —        | —          |                                                                                                                                                    |
| X15.5  | Agent 权限能力模型      | [ ]  | —        | —          |                                                                                                                                                    |
| X15.6  | Agent 系统调用接口      | [ ]  | —        | —          |                                                                                                                                                    |
| X16.1  | 环境状态建模            | [ ]  | —        | —          |                                                                                                                                                    |
| X16.2  | 神经符号循环            | [ ]  | —        | —          |                                                                                                                                                    |
| X16.3  | 想象力预演              | [ ]  | —        | —          |                                                                                                                                                    |
| X16.4  | 测试时世界模型适应      | [ ]  | —        | —          |                                                                                                                                                    |
| X16.5  | 从视频学习世界知识      | [ ]  | —        | —          |                                                                                                                                                    |
| X17.1  | 因果 Agent 重放         | [ ]  | —        | —          |                                                                                                                                                    |
| X17.2  | 反事实修复              | [ ]  | —        | —          |                                                                                                                                                    |
| X17.3  | 因果工具诊断            | [ ]  | —        | —          |                                                                                                                                                    |
| X17.4  | 因果归因仪表盘          | [ ]  | —        | —          |                                                                                                                                                    |
| X17.5  | 因果发现涌现监控        | [ ]  | —        | —          |                                                                                                                                                    |
| X18.1  | Agent 钱包与预算        | [ ]  | —        | —          |                                                                                                                                                    |
| X18.2  | Agent 间任务外包        | [ ]  | —        | —          |                                                                                                                                                    |
| X18.3  | 去中心化 Agent 市场     | [ ]  | —        | —          |                                                                                                                                                    |
| X18.4  | Agent 声誉系统          | [ ]  | —        | —          |                                                                                                                                                    |
| X18.5  | 自主交易沙箱            | [ ]  | —        | —          |                                                                                                                                                    |
| X19.1  | 持续人格演化            | [ ]  | —        | —          |                                                                                                                                                    |
| X19.2  | 双时态记忆图            | [ ]  | —        | —          |                                                                                                                                                    |
| X19.3  | 行为忠实度建模          | [ ]  | —        | —          |                                                                                                                                                    |
| X19.4  | 代理执行与审批门        | [ ]  | —        | —          |                                                                                                                                                    |
| X19.5  | 多设备人格同步          | [ ]  | —        | —          |                                                                                                                                                    |
| X20.1  | UI 操作录制与回放       | [ ]  | —        | —          |                                                                                                                                                    |
| X20.2  | 混合执行引擎            | [ ]  | —        | —          |                                                                                                                                                    |
| X20.3  | 异常分支智能处理        | [ ]  | —        | —          |                                                                                                                                                    |
| X20.4  | 工作流模板市场          | [ ]  | —        | —          |                                                                                                                                                    |
| X20.5  | 治理编排框架            | [ ]  | —        | —          |                                                                                                                                                    |
| X21.1  | 三级推理架构            | [ ]  | —        | —          |                                                                                                                                                    |
| X21.2  | 置信度级联路由          | [ ]  | —        | —          |                                                                                                                                                    |
| X21.3  | 本地模型管理器          | [ ]  | —        | —          |                                                                                                                                                    |
| X21.4  | 响应级推测解码          | [ ]  | —        | —          |                                                                                                                                                    |
| X21.5  | 多 token 预测加速       | [ ]  | —        | —          |                                                                                                                                                    |
| X21.6  | 离线降级模式            | [ ]  | —        | —          |                                                                                                                                                    |
| X22.1  | 三层结构化日志          | [ ]  | —        | —          |                                                                                                                                                    |
| X22.2  | 假成功检测              | [ ]  | —        | —          |                                                                                                                                                    |
| X22.3  | 跨会话行为分析          | [ ]  | —        | —          |                                                                                                                                                    |
| X22.4  | Detect-Recommend-Verify | [ ]  | —        | —          |                                                                                                                                                    |
| X22.5  | 自然语言行为查询        | [ ]  | —        | —          |                                                                                                                                                    |
| X23.1  | 动态推理图构建          | [ ]  | —        | —          |                                                                                                                                                    |
| X23.2  | 跨会话推理线程          | [ ]  | —        | —          |                                                                                                                                                    |
| X23.3  | 知识图推理骨架          | [ ]  | —        | —          |                                                                                                                                                    |
| X23.4  | 测试时缩放              | [ ]  | —        | —          |                                                                                                                                                    |
| X23.5  | 持续元学习              | [ ]  | —        | —          |                                                                                                                                                    |
| X24.1  | 宪法愿景层              | [ ]  | —        | —          |                                                                                                                                                    |
| X24.2  | 个性化信条宪法          | [ ]  | —        | —          |                                                                                                                                                    |
| X24.3  | 品格内化                | [ ]  | —        | —          |                                                                                                                                                    |
| X24.4  | 摩擦日志与摩擦税        | [ ]  | —        | —          |                                                                                                                                                    |
| X24.5  | 螺旋演化层              | [ ]  | —        | —          |                                                                                                                                                    |
| X25.1  | 自主环境发现            | [ ]  | —        | —          |                                                                                                                                                    |
| X25.2  | 推理轨迹蒸馏            | [ ]  | —        | —          |                                                                                                                                                    |
| X25.3  | 空闲时间自主练习        | [ ]  | —        | —          |                                                                                                                                                    |
| X25.4  | 终身学习机制            | [ ]  | —        | —          |                                                                                                                                                    |
| X25.5  | Agent 基因谱系          | [ ]  | —        | —          |                                                                                                                                                    |
| X26.1  | 设备数字孪生            | [ ]  | —        | —          |                                                                                                                                                    |
| X26.2  | 闭环控制架构            | [ ]  | —        | —          |                                                                                                                                                    |
| X26.3  | 成熟度阶梯              | [ ]  | —        | —          |                                                                                                                                                    |
| X26.4  | IoT 设备编排            | [ ]  | —        | —          |                                                                                                                                                    |
| X26.5  | 预测性维护 Agent        | [ ]  | —        | —          |                                                                                                                                                    |
