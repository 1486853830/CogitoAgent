# CogitoAgent 需求文档 / Requirements

> 本文档是 CogitoAgent 对标 OpenClaw / Codex / Trae SOLO 等主流智能体的**完整改进需求清单**。
>
> 约定：
>
> - 状态标记：`[x]` = 已完成 · `[ ]` = 未开始 · `[~]` = 进行中
> - 每条需求带唯一编号（如 `R1.1`），正文与「状态追踪表」编号一一对应
> - 推进时**先**在正文勾选，**再**更新追踪表（完成版本 / 日期 / 备注）
> - 按 P0 → P1 → P2 → P3 → P4 五阶段推进，P0 未全部完成不进入 P1

---

## 1. 背景与目标

### 1.1 现状问题（诊断摘要）

CogitoAgent 当前本质是 **"文本标记 + 正则解析"的自助式智能体**（`[TOOL]...[/TOOL]` + `[WAIT]`），而主流智能体（Codex、OpenClaw、Trae SOLO）均为 **结构化工具调用 + 事件驱动循环**。2026 年行业共识已从"模型能力决定一切"转变为 **"脚手架（Harness）即是产品"**——同一模型在不同脚手架下性能差异可达 6 倍，Anthropic 多 Agent 编排仅通过改变架构就比单 Agent 基线提升 90.2%。主要代差：

| 维度     | 现状                                          | 目标（行业顶尖）                                                                                          |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 工具调用 | 模型口述 `[TOOL]` 标记，正则解析位置参数      | 原生 function calling / JSON Schema / 流式 tool_calls / MCP + 工具注解（readOnly/destructive/idempotent） |
| 循环控制 | 固定 3s `setTimeout` 轮询 + `[WAIT]` 文本标记 | 事件驱动循环 + 预算控制 + 推测执行（PASTE）+ 并行工具调用                                                 |
| 上下文   | 10 万 token 启发式截断，丢弃而非摘要          | 可组合上下文工程栈：JIT 加载 + 压缩（Compaction）+ 结构化笔记 + 多 Agent 隔离上下文                       |
| 记忆     | JSON 文件 + 关键词 `includes` 打分            | embedding 语义检索 + 分级记忆 + Dreaming 跨会话精炼 + REMem 混合记忆图                                    |
| 沙箱     | JS `isolated-vm` + Python 仅环境变量清理      | 硬件级隔离（Firecracker/Kata/WASM），信任交接防御，Kubernetes Agent Sandbox                               |
| 多智能体 | 单进程共享注册表的重复循环实现                | 统一 runtime runner + A2A 协议 + 嵌套子 Agent（5 层深）+ 检查点/时间旅行/分支                             |
| 插件     | 动态 import 但工具对模型不可见                | Agent Skills 标准（三级渐进式披露）+ 插件 schema 注入 + 权限声明 + Code Mode                              |
| MCP      | 仅文档宣称                                    | 真实 MCP 客户端 + 服务端 + Elicitation + Sampling + 工具注解                                              |
| 协议     | 仅 WebSocket 内部通信                         | MCP（工具）+ A2A（Agent 间协调）+ 身份信任层（OAuth 2.1 / Agent Cards）三层协议栈                         |
| 编码能力 | git 工具窄，无 AGENTS.md / DiffView           | Tree-sitter 知识图谱索引 + AGENTS.md + Plan-then-Execute + 验证循环 + 变更影响分析                        |
| 评测     | 无 benchmark                                  | 自建 eval suite + SWE-bench 风格 + OpenTelemetry GenAI 可观测性 + Shadow Mode CI                          |
| 安全     | 危险操作全局开关                              | Guardrails（输入/输出护栏）+ 分级许可 + 审计台账 + 沙箱逃逸防御                                           |
| 多模态   | 仅 OCR/Vision 工具                            | 三车道架构（Vision+Tools / Realtime Audio / Video Understanding）+ Computer Use                           |
| 长程任务 | 无                                            | METR 16 小时时间前沿对齐 + 验证前置引用 + 确定性检查点恢复                                                |

### 1.2 目标

把 CogitoAgent 从"演示级"提升为可日常使用、可扩展、可评测的**生产级自主智能体**，并在差异化维度达到行业顶尖：

1. **引擎层**：结构化工具调用、事件驱动循环、预算控制、可组合上下文工程栈、推测执行
2. **能力层**：语义记忆 + Dreaming、多智能体编排（A2A + 嵌套子 Agent）、知识图谱编码工作流、硬件级隔离、OpenTelemetry 可观测性
3. **产品层**：Web / 桌面 / CLI 全端、MCP + A2A 双协议生态、Agent Skills 市场、评测闭环、多平台打包
4. **突破层**：Computer Use、科学发现 Agent、16 小时长程任务、可组合上下文工程、多 Agent 对齐安全

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
- [x] **R1.4 兼容 fallback**：保留 `[TOOL]` 文本解析作为不支持原生协议模型的纯文本降级层
- [x] **R1.5 清单单一来源**：`system-prompt.ts` 的工具目录改由 registry/schema 自动生成，删除手写 `buildToolList()` 散文（消除与 registry 的漂移）
- [x] **R1.6 参数强制校验**：工具执行前按 Schema 校验实参，失败返回结构化错误而非静默跳过；`argCount` 由装饰性元数据变为强制校验
- [~] **R1.7 工具注解（Tool Annotations）**：为每个工具声明行为注解——`readOnly`（不修改外部状态）、`destructive`（修改/删除数据）、`idempotent`（重复调用效果相同）、`openWorld`（在 Agent 环境外产生可见效果）；注解已声明并随 OpenAI tools / MCP 暴露，自动批准/确认仍以 registry `DANGEROUS_OPERATIONS` 为准
- [~] **R1.8 结构化输出强制模式**：工具侧 strict JSON Schema 已实现（必填 + additionalProperties=false），Agent 最终输出 strict 合规模式待接
- [x] **R1.9 Rich Errors**：工具错误返回结构化对象（如 `{error: "file_not_found", path: "/foo/bar.ts", suggestion: "Did you mean /foo/baz.ts?"}`），让 Agent 能推理如何修复而非仅看到错误码

**验收**：模型无需记忆目录文案即可正确调用任意已注册工具；工具结果走 `tool` role；系统提示中不再出现散文工具清单。

### R2. 事件驱动循环

- [~] **R2.1 移除固定 3s 轮询**：循环改为事件驱动，工具执行完成 / 用户消息 / 定时任务到达时立即推进，而非 `setTimeout(3000)` 等待（原生协议路径；文本 fallback 路径仍保留 polling 兜底）
- [~] **R2.2 消除首轮延迟**：首轮回复不再被 3s 定时器拖慢（原生路径已恢复，fallback 路径待统一）
- [~] **R2.3 预算控制**：引入 `sessionBudget`（每任务最大往返次数）、`tokenBudget`、`costBudget`（按路由表换算费用），达到即强制收敛并通知用户（`maxSteps` / `maxTokens` 已实现，`costBudget` 待实现）
- [x] **R2.4 结构化停信号**：模型"说完"改为结构化 `stop` 泛化（原生输出 / 内容为最终 / 预算耗尽），不再依赖模型记得写 `[WAIT]`
- [~] **R2.5 移除 `[WAIT]` 依赖**：`[WAIT]` 仅作纯文本兼容提示保留，原生路径不再以 `[WAIT]` 决定状态转移（fallback 路径仍依赖）
- [x] **R2.6 并行工具调用**：当模型返回多个独立工具调用时，使用 `Promise.allSettled` 并行执行而非顺序执行；独立操作从串行 N×延迟 降至 max(延迟)，加速最高 3.7 倍
- [ ] **R2.7 推测执行（Speculative Execution）**：借鉴 CPU 架构推测执行思路，在主模型仍在思考时用轻量"草稿"模型预测下一步工具调用并预先执行；预测错误时无损回退到标准顺序路径；加速最高 30%
- [ ] **R2.8 PASTE 模式挖掘**：从 Agent 执行轨迹中挖掘"模式元组"（上下文 → 预测工具 + 参数推导函数 + 经验成功率），预测命中率达标后自动启用推测执行；策略系统将工具分类为完全可推测 / dry-run 可行 / 禁止推测
- [ ] **R2.9 推理深度可调旋钮**：对齐三大实验室收敛趋势——支持 `reasoning_effort`（low/medium/high/xhigh）与 `verbosity` 解耦；自适应思考模式（`thinking: {type: 'adaptive'}`）替代固定 token 预算

### R3. 会话与上下文

- [~] **R3.1 会话存储异步化**：去掉热路径 `writeFileSync`（`session.ts` 每次增消息同步落盘），改异步 + 批量/节流 + 原子写（新增 `saveSessionAsync` 异步写路径，`addUserMessage`/`addAssistantMessage` 同步写暂保留）
- [ ] **R3.2 智能压缩**：`compressHistory()` 从"丢弃 + 枚举工具名"升级为 LLM 分级摘要（保留关键数据、代码片段、目标状态），触发阈值按模型动态设置
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
- [~] **R4.3 MCP 配置面**：Dashboard / 配置文件中管理接入的 MCP server（启停、鉴权、别名）（config 新增 `mcp` 段支持 `servers`，Dashboard 待做）
- [ ] **R4.4 MCP 文案修正**：README / CHANGELOG 中"已支持 MCP"的文案与实际能力一致，去掉虚假宣传
- [ ] **R4.5 MCP Elicitation**：MCP 服务端可通过客户端向用户请求结构化输入，实现更丰富的人机交互（如运行时确认参数、收集缺失信息）
- [ ] **R4.6 MCP Sampling**：MCP 服务端可从客户端请求 LLM 补全（含工具调用），使服务端从被动工具提供者升级为可编排多步推理流的协调者
- [x] **R4.7 MCP 工具注解传播**：将 R1.7 的工具注解通过 MCP `toolAnnotations` 字段传播给外部客户端，实现跨客户端的统一策略执行
- [ ] **R4.8 MCP 无状态重构对齐**：对齐 2026-07 MCP 重大重构——取消协议层 Session，改为每次请求携带完整处理信息，支持 MCP Server 在 Kubernetes 上水平扩缩容

### R5. 插件体系

- [x] **R5.1 插件工具注入**：`plugin.ts` 动态注册的工具自动生成 JSON Schema 并注入系统提示 / 原生 tools，解决"插件工具模型不可见"
- [~] **R5.2 插件权限模型**：插件以 `plugin.yaml` 声明权限（`file:read`、`network:off`、`dir:workspace` 等），运行时强制校验（config `tools.permissions` 规则 + `enforceToolPermission` 门禁已实现，plugin.yaml 声明待接）
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
- [ ] **R10.4 死代码清理**：删除 `llm-validator.ts` JSON-action 遗留、未引用的 `registry.getToolsForPrompt`、未生效的 `tool-utils.TOOL_OUTPUT_LIMITS`（先转为强制执行）、`stats.recordThinkingTime`、`api/models.ts`（DEPRECATED）
- [ ] **R10.5 已知 bug 修复**：setup 中 `thinkingInterval` 与 `Config.chat.thinkingInterval` 对齐；`TOOL_DEVELOPMENT.md` 过时路径修正；file.ts `read_excel` → `readExcel`
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

## 2. 验收与追踪

### 2.1 全局验收标准

1. **P0 完成**：`npm run typecheck` 与 `npm run lint` 全绿；现有测试通过；新增核心测试覆盖 `agent loop` / `tool schema` / `session compression`。
2. **P1 完成**：对标能力（记忆 / 多智能体 / 编码 / 安全 / 评测）具备可演示实现；README（中英）与 `introduction/*` 与实现完全一致（无宣传漂移）。
3. **P2 完成**：Web 端可替代 Electron 主要流程；插件市场 1-click 安装可用；多平台包 CI 全绿。
4. **P3 完成**：差异化能力（自我进化 / 计划彩排 / 环境感知 / 混合智能 / 私密记忆 / 可信解释）具备可演示实现；至少 3 项 P3 能力在公开 benchmark 上有可对比数据。
5. **P4 完成**：前沿突破能力（Computer Use / 科学发现 / 长程自主 / 协议栈 / 对齐安全 / 上下文工程 / 个性化 / 动态团队）中至少 2 项达到论文级创新或行业首发；在 OSWorld / SWE-bench Pro / ARC-AGI-3 等前沿 benchmark 上有可对比数据。

### 2.2 状态追踪表

> 每次推进会先更新此表。完成一项即把 `[ ]` 改为 `[x]`，并填完成版本与日期。

| 编号   | 需求                   | 状态 | 完成版本 | 完成日期   | 备注                                                |
| ------ | ---------------------- | ---- | -------- | ---------- | --------------------------------------------------- |
| R1.1   | 工具 JSON Schema       | [x]  | v2.4.0   | 2026-08-08 | tool-schema.ts + TOOL_DOCS 单一来源                 |
| R1.2   | 原生 function calling  | [x]  | v2.4.0   | 2026-08-08 | streamChatNative + delta.tool_calls                 |
| R1.3   | 结构化 tool result     | [x]  | v2.4.0   | 2026-08-08 | role:tool + tool_call_id                            |
| R1.4   | 兼容 fallback          | [x]  | v2.4.0   | 2026-08-08 | [TOOL] 文本解析保留                                 |
| R1.5   | 清单单一来源           | [x]  | v2.4.0   | 2026-08-08 | buildToolList 由 registry 派生                      |
| R1.6   | 参数强制校验           | [x]  | v2.4.0   | 2026-08-08 | validateArgsAgainstSchema                           |
| R1.7   | 工具注解               | [~]  | —        | —          | 注解已声明并暴露；自动批准仍走 DANGEROUS_OPERATIONS |
| R1.8   | 结构化输出强制模式     | [~]  | —        | —          | 工具 strict schema 完成；输出模式待接               |
| R1.9   | Rich Errors            | [x]  | v2.4.0   | 2026-08-08 | toRichError + RICH_ERROR_HINTS                      |
| R2.1   | 移除固定轮询           | [~]  | —        | —          | 原生路径事件驱动；fallback 保留轮询                 |
| R2.2   | 消除首轮延迟           | [~]  | —        | —          | 原生路径已恢复                                      |
| R2.3   | 预算控制               | [~]  | —        | —          | maxSteps/maxTokens；costBudget 待做                 |
| R2.4   | 结构化停信号           | [x]  | v2.4.0   | 2026-08-08 | stop_reason 驱动                                    |
| R2.5   | 移除 [WAIT] 依赖       | [~]  | —        | —          | 原生路径已去依赖，fallback 保留                     |
| R2.6   | 并行工具调用           | [x]  | v2.4.0   | 2026-08-08 | Promise.allSettled                                  |
| R2.7   | 推测执行               | [ ]  | —        | —          |                                                     |
| R2.8   | PASTE 模式挖掘         | [ ]  | —        | —          |                                                     |
| R2.9   | 推理深度可调旋钮       | [ ]  | —        | —          |                                                     |
| R3.1   | 会话存储异步化         | [~]  | —        | —          | saveSessionAsync；热路径暂保留同步                  |
| R3.2   | 智能压缩               | [ ]  | —        | —          |                                                     |
| R3.3   | 上下文对齐             | [x]  | v2.4.0   | 2026-08-08 | 按 api.model context window 取 80%                  |
| R3.4   | tool 计数修复          | [x]  | v2.4.0   | 2026-08-08 | 原生 tool 结果不再膨胀 user 计数                    |
| R3.5   | JIT 上下文策略         | [~]  | —        | —          | JIT 标记注入；按需工具加载待跟进                    |
| R3.6   | 结构化笔记             | [x]  | v2.4.0   | 2026-08-08 | saveSessionNote / listSessionNotes                  |
| R3.7   | 上下文腐烂防御         | [~]  | —        | —          | getPartitionedMessages 分区完成                     |
| R3.8   | 多 Agent 隔离上下文    | [ ]  | —        | —          |                                                     |
| R3.9   | 会话中途系统消息       | [ ]  | —        | —          |                                                     |
| R4.1   | MCP 服务端             | [x]  | v2.4.0   | 2026-08-08 | createLocalMcpServer (stdio)                        |
| R4.2   | MCP 客户端             | [x]  | v2.4.0   | 2026-08-08 | registerExternalMcpServers                          |
| R4.3   | MCP 配置面             | [~]  | —        | —          | config.mcp.servers 已支持；Dashboard 待做           |
| R4.4   | MCP 文案修正           | [ ]  | —        | —          |                                                     |
| R4.5   | MCP Elicitation        | [ ]  | —        | —          |                                                     |
| R4.6   | MCP Sampling           | [ ]  | —        | —          |                                                     |
| R4.7   | MCP 工具注解传播       | [x]  | v2.4.0   | 2026-08-08 | annotations → MCP toolAnnotations                   |
| R4.8   | MCP 无状态重构对齐     | [ ]  | —        | —          |                                                     |
| R5.1   | 插件工具注入           | [x]  | v2.4.0   | 2026-08-08 | schema/param/annotations 随注册注入                 |
| R5.2   | 插件权限模型           | [~]  | —        | —          | config permissions + 门禁；plugin.yaml 待接         |
| R5.3   | 插件热加载             | [x]  | v2.4.0   | 2026-08-08 | unloadPlugin + reloadPlugins                        |
| R5.4   | 插件安全               | [ ]  | —        | —          |                                                     |
| R5.5   | Agent Skills 标准      | [x]  | v2.4.0   | 2026-08-08 | SKILL.md front-matter 扫描                          |
| R5.6   | Skills 目录约定        | [~]  | —        | —          | skills/ 目录注入；.cogito/skills 约定待统一         |
| R5.7   | Code Mode 工具范式     | [ ]  | —        | —          |                                                     |
| R5.8   | 配置坏味道防御         | [ ]  | —        | —          |                                                     |
| R6.1   | 向量记忆               | [ ]  | —        | —          |                                                     |
| R6.2   | 分级记忆               | [ ]  | —        | —          |                                                     |
| R6.3   | 记忆自动写入           | [ ]  | —        | —          |                                                     |
| R6.4   | 记忆持久化             | [ ]  | —        | —          |                                                     |
| R6.5   | 记忆 UI                | [ ]  | —        | —          |                                                     |
| R6.6   | Dreaming 跨会话精炼    | [ ]  | —        | —          |                                                     |
| R6.7   | REMem 混合记忆图       | [ ]  | —        | —          |                                                     |
| R6.8   | 双过程记忆架构         | [ ]  | —        | —          |                                                     |
| R6.9   | 组织上下文记忆         | [ ]  | —        | —          |                                                     |
| R6.10  | 生成式语义工作空间     | [ ]  | —        | —          |                                                     |
| R7.1   | 统一 runner            | [ ]  | —        | —          |                                                     |
| R7.2   | agent 线程管理         | [ ]  | —        | —          |                                                     |
| R7.3   | 真并行                 | [ ]  | —        | —          |                                                     |
| R7.4   | 通道抽象打通           | [ ]  | —        | —          |                                                     |
| R7.5   | 子代理安全             | [ ]  | —        | —          |                                                     |
| R7.6   | A2A 协议集成           | [ ]  | —        | —          |                                                     |
| R7.7   | 嵌套子 Agent           | [ ]  | —        | —          |                                                     |
| R7.8   | 检查点/时间旅行/分支   | [ ]  | —        | —          |                                                     |
| R7.9   | Guardrails 护栏        | [ ]  | —        | —          |                                                     |
| R7.10  | Generator-Evaluator    | [ ]  | —        | —          |                                                     |
| R7.11  | AggAgent 并行聚合      | [ ]  | —        | —          |                                                     |
| R8.1   | AGENTS.md 支持         | [ ]  | —        | —          |                                                     |
| R8.2   | 全仓索引               | [ ]  | —        | —          |                                                     |
| R8.3   | Plan 模式              | [ ]  | —        | —          |                                                     |
| R8.4   | Diff 审查回滚          | [ ]  | —        | —          |                                                     |
| R8.5   | 任务清单源             | [ ]  | —        | —          |                                                     |
| R8.6   | Tree-sitter 知识图谱   | [ ]  | —        | —          |                                                     |
| R8.7   | 混合 LSP 语义解析      | [ ]  | —        | —          |                                                     |
| R8.8   | 语义代码搜索           | [ ]  | —        | —          |                                                     |
| R8.9   | 变更影响分析           | [ ]  | —        | —          |                                                     |
| R8.10  | 验证前置引用           | [ ]  | —        | —          |                                                     |
| R8.11  | 测试驱动 Agent 循环    | [ ]  | —        | —          |                                                     |
| R8.12  | 增量索引团队共享       | [ ]  | —        | —          |                                                     |
| R8.13  | 多信号融合排序         | [ ]  | —        | —          |                                                     |
| R8.14  | 调用图/死代码检测      | [ ]  | —        | —          |                                                     |
| R9.1   | Python 容器隔离        | [ ]  | —        | —          |                                                     |
| R9.2   | 移除 vm 降级           | [ ]  | —        | —          |                                                     |
| R9.3   | Hooks 事件模型         | [ ]  | —        | —          |                                                     |
| R9.4   | 凭证管理               | [ ]  | —        | —          |                                                     |
| R9.5   | 分级许可策略           | [ ]  | —        | —          |                                                     |
| R9.6   | 硬件级隔离升级         | [ ]  | —        | —          |                                                     |
| R9.7   | 信任交接防御           | [ ]  | —        | —          |                                                     |
| R9.8   | K8s Agent Sandbox      | [ ]  | —        | —          |                                                     |
| R9.9   | Prompt Injection 防御  | [ ]  | —        | —          |                                                     |
| R9.10  | 长程模型安全约束       | [ ]  | —        | —          |                                                     |
| R10.1  | eval harness           | [ ]  | —        | —          |                                                     |
| R10.2  | 回归基准               | [ ]  | —        | —          |                                                     |
| R10.3  | 覆盖率门槛             | [ ]  | —        | —          |                                                     |
| R10.4  | 死代码清理             | [ ]  | —        | —          |                                                     |
| R10.5  | 已知 bug 修复          | [ ]  | —        | —          |                                                     |
| R10.6  | OTel GenAI 可观测性    | [ ]  | —        | —          |                                                     |
| R10.7  | Agent 专属 eval 指标   | [ ]  | —        | —          |                                                     |
| R10.8  | Trace 层次结构         | [ ]  | —        | —          |                                                     |
| R10.9  | Shadow Mode CI         | [ ]  | —        | —          |                                                     |
| R10.10 | 成本-结果指标          | [ ]  | —        | —          |                                                     |
| R10.11 | 确定性可复现 eval      | [ ]  | —        | —          |                                                     |
| R11.1  | Web UI                 | [ ]  | —        | —          |                                                     |
| R11.2  | 前端技术栈             | [ ]  | —        | —          |                                                     |
| R11.3  | 多模态入口             | [ ]  | —        | —          |                                                     |
| R11.4  | 移动端同步             | [ ]  | —        | —          |                                                     |
| R11.5  | 三车道多模态架构       | [ ]  | —        | —          |                                                     |
| R11.6  | 双向流式交互           | [ ]  | —        | —          |                                                     |
| R11.7  | 视觉反馈循环           | [ ]  | —        | —          |                                                     |
| R11.8  | 团队协作模式           | [ ]  | —        | —          |                                                     |
| R12.1  | 插件市场               | [ ]  | —        | —          |                                                     |
| R12.2  | Skill 机制             | [ ]  | —        | —          |                                                     |
| R12.3  | 通道扩展               | [ ]  | —        | —          |                                                     |
| R12.4  | 云任务分发             | [ ]  | —        | —          |                                                     |
| R12.5  | MCP 生态市场           | [ ]  | —        | —          |                                                     |
| R12.6  | A2A Agent 发现         | [ ]  | —        | —          |                                                     |
| R12.7  | 多客户端自动配置       | [ ]  | —        | —          |                                                     |
| R12.8  | 云沙箱化执行           | [ ]  | —        | —          |                                                     |
| R13.1  | 多平台构建             | [ ]  | —        | —          |                                                     |
| R13.2  | 发布自动化             | [ ]  | —        | —          |                                                     |
| R13.3  | 性能基线               | [ ]  | —        | —          |                                                     |
| X1.1   | 工具自举               | [ ]  | —        | —          |                                                     |
| X1.2   | 技能自编译             | [ ]  | —        | —          |                                                     |
| X1.3   | 提示词自优化           | [ ]  | —        | —          |                                                     |
| X1.4   | 失败反向学习           | [ ]  | —        | —          |                                                     |
| X1.5   | Outcomes 自动评估      | [ ]  | —        | —          |                                                     |
| X1.6   | AlphaEvolve 循环       | [ ]  | —        | —          |                                                     |
| X1.7   | Dreaming+Outcomes 闭环 | [ ]  | —        | —          |                                                     |
| X1.8   | 有监督自我精炼         | [ ]  | —        | —          |                                                     |
| X2.1   | 计划彩排               | [ ]  | —        | —          |                                                     |
| X2.2   | 会话时间旅行           | [ ]  | —        | —          |                                                     |
| X2.3   | 全量审计台账           | [ ]  | —        | —          |                                                     |
| X2.4   | 确定性验收台           | [ ]  | —        | —          |                                                     |
| X3.1   | 工作区感知             | [ ]  | —        | —          |                                                     |
| X3.2   | 外部上下文订阅         | [ ]  | —        | —          |                                                     |
| X3.3   | 自动简报               | [ ]  | —        | —          |                                                     |
| X3.4   | 常驻守护进程           | [ ]  | —        | —          |                                                     |
| X4.1   | 混合模型路由           | [ ]  | —        | —          |                                                     |
| X4.2   | 实时成本面板           | [ ]  | —        | —          |                                                     |
| X4.3   | 本地优先管线           | [ ]  | —        | —          |                                                     |
| X4.4   | 熔断器模式             | [ ]  | —        | —          |                                                     |
| X4.5   | 优雅降级               | [ ]  | —        | —          |                                                     |
| X4.6   | 健康感知路由           | [ ]  | —        | —          |                                                     |
| X4.7   | 加权路由策略           | [ ]  | —        | —          |                                                     |
| X4.8   | KV Cache 复用          | [ ]  | —        | —          |                                                     |
| X5.1   | 多设备共享记忆         | [ ]  | —        | —          |                                                     |
| X5.2   | 加密同步               | [ ]  | —        | —          |                                                     |
| X5.3   | 偏好画像               | [ ]  | —        | —          |                                                     |
| X6.1   | 回答可溯源             | [ ]  | —        | —          |                                                     |
| X6.2   | 数据可携清账           | [ ]  | —        | —          |                                                     |
| X6.3   | 行为策略面板           | [ ]  | —        | —          |                                                     |
| X6.4   | KGoT 知识图谱推理      | [ ]  | —        | —          |                                                     |
| X6.5   | 不可变审计追踪         | [ ]  | —        | —          |                                                     |
| X6.6   | 异常与漂移检测         | [ ]  | —        | —          |                                                     |
| X7.1   | 桌面截图循环           | [ ]  | —        | —          |                                                     |
| X7.2   | 分层安全访问           | [ ]  | —        | —          |                                                     |
| X7.3   | 跨应用端到端工作流     | [ ]  | —        | —          |                                                     |
| X7.4   | 浏览器原生自动化       | [ ]  | —        | —          |                                                     |
| X7.5   | OSWorld 对标评测       | [ ]  | —        | —          |                                                     |
| X8.1   | Elo 锦标赛假说竞争     | [ ]  | —        | —          |                                                     |
| X8.2   | Generator/Verifier     | [ ]  | —        | —          |                                                     |
| X8.3   | 可编程评估器约束       | [ ]  | —        | —          |                                                     |
| X8.4   | 多模型广度-深度集成    | [ ]  | —        | —          |                                                     |
| X9.1   | 16 小时时间前沿对齐    | [ ]  | —        | —          |                                                     |
| X9.2   | 并行 TTC 弥合退化      | [ ]  | —        | —          |                                                     |
| X9.3   | Retained Reasoning     | [ ]  | —        | —          |                                                     |
| X9.4   | 嵌套子 Agent 深度编排  | [ ]  | —        | —          |                                                     |
| X9.5   | 大规模编排验证         | [ ]  | —        | —          |                                                     |
| X10.1  | 三层协议栈实现         | [ ]  | —        | —          |                                                     |
| X10.2  | Agent Cards 发布       | [ ]  | —        | —          |                                                     |
| X10.3  | ACP 原生兼容           | [ ]  | —        | —          |                                                     |
| X10.4  | 去中心化 Agent 网络    | [ ]  | —        | —          |                                                     |
| X10.5  | 治理对齐               | [ ]  | —        | —          |                                                     |
| X11.1  | 对齐悖论防御           | [ ]  | —        | —          |                                                     |
| X11.2  | 停止准则理论解         | [ ]  | —        | —          |                                                     |
| X11.3  | 沙箱逃逸检测           | [ ]  | —        | —          |                                                     |
| X11.4  | 信任交接完整性         | [ ]  | —        | —          |                                                     |
| X11.5  | 长程模型持久性风险     | [ ]  | —        | —          |                                                     |
| X12.1  | 代码执行+MCP 原语      | [ ]  | —        | —          |                                                     |
| X12.2  | ToolSearch 原语        | [ ]  | —        | —          |                                                     |
| X12.3  | 滑动多断点缓存         | [ ]  | —        | —          |                                                     |
| X12.4  | Skills 渐进式披露      | [ ]  | —        | —          |                                                     |
| X12.5  | 原语堆叠策略           | [ ]  | —        | —          |                                                     |
| X12.6  | 上下文工程 vs 提示工程 | [ ]  | —        | —          |                                                     |
| X13.1  | Me-Agent 双级学习      | [ ]  | —        | —          |                                                     |
| X13.2  | PersonaAgent 框架      | [ ]  | —        | —          |                                                     |
| X13.3  | 持久化用户记忆         | [ ]  | —        | —          |                                                     |
| X13.4  | 自进化数字伙伴         | [ ]  | —        | —          |                                                     |
| X14.1  | DyLAN 动态网络         | [ ]  | —        | —          |                                                     |
| X14.2  | GraphPlanner 异构路由  | [ ]  | —        | —          |                                                     |
| X14.3  | AgentConductor 拓扑    | [ ]  | —        | —          |                                                     |
| X14.4  | VCG 拍卖通信市场       | [ ]  | —        | —          |                                                     |
| X14.5  | Pyramid MoA 轻量路由   | [ ]  | —        | —          |                                                     |
