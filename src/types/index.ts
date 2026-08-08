export interface ApiConfig {
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface ChatConfig {
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  thinkingInterval: number;
  language?: string;
  /** 结构化输出（response_format.json_schema），原生工具协议下可用。 */
  structuredOutput?: {
    /** 工具结果注入使用的目标 JSON Schema（可选，默认将结果包成对象字段 result）。 */
    schema?: Record<string, unknown>;
    /** 是否开启严格模式（strict: true）。 */
    strict?: boolean;
  };
  /** 本轮思考预算：超限后强制停下等用户输入。 */
  budget?: {
    /** 单轮最大工具调用步数（含重试）。 */
    maxSteps?: number;
    /** 单轮最大输出 token 数。 */
    maxTokens?: number;
    /** 单轮预估花费上限（美元），按路由表价格换算；达到即强制收敛并通知用户。0 或不设表示不限制。 */
    costBudget?: number;
  };
  /** 每个助手回合的推理强度（o 系列模型 reasoning_effort）。'none' 表示关闭。 */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'none';
  /** 输出冗长度（OpenAI verbosity：low/medium/high），与推理深度解耦（R2.9）。 */
  verbosity?: 'low' | 'medium' | 'high';
  /**
   * 思考模式（R2.9）：adaptive 自适应思考替代固定 token 预算；
   * enabled 可配预算 token；disabled 关闭思考。对齐三大实验室收敛趋势。
   */
  thinking?:
    { type: 'adaptive' } | { type: 'enabled'; budgetTokens?: number } | { type: 'disabled' };
  /**
   * 推测执行（R2.7 / R2.8）：草稿模型并行预测下一步工具调用，对只读/幂等工具预执行；
   * 预测未命中时无损回退到标准顺序路径。
   */
  speculative?: {
    /** 显式启用推测执行（忽略命中率门槛）。 */
    enabled?: boolean;
    /** 草稿模型名（轻量/廉价）；缺省复用主模型。 */
    draftModel?: string;
    /** 自动模式：命中率达标后由 PASTE 模式挖掘（R2.8）驱动启用。 */
    auto?: boolean;
    /** 自动启用所需最低命中率（默认 0.8）。 */
    confidenceThreshold?: number;
    /** 自动启用所需最少样本数（默认 5）。 */
    minSamples?: number;
  };
  /** 是否启用 LLM 分级摘要压缩历史（R3.2）。默认开启；关闭则回退朴素摘要（离线/省成本）。 */
  compressionSummary?: boolean;
}

export interface SearchConfig {
  enabled: boolean;
  baseURL: string;
  recencyFilter: string;
  siteFilter: string;
}

export interface OcrConfig {
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface VisionConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface DatabaseConfig {
  path: string;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  user: string;
  password: string;
  from: string;
}

export interface ModelProviderConfig {
  apiKey: string;
  baseURL?: string;
}

export interface ModelsConfig {
  [key: string]: ModelProviderConfig | undefined;
  openai?: ModelProviderConfig;
  moark?: ModelProviderConfig;
  anthropic?: ModelProviderConfig;
  google?: ModelProviderConfig;
}

export interface CodeConfig {
  maxExecutionTime: number;
  maxOutputSize: number;
  scientificMode?: boolean;
  scientificLibraries?: string[];
}

export interface SecurityConfig {
  confirmDangerous: boolean;
  sandboxMode: boolean;
}

export interface SchedulerConfig {
  enabled: boolean;
}

export interface ToolsConfig {
  enabledCategories?: string[];
}

export interface Config {
  api: ApiConfig;
  chat: ChatConfig;
  search: SearchConfig;
  ocr: OcrConfig;
  vision: VisionConfig;
  workspace: string;
  database: DatabaseConfig;
  email: EmailConfig;
  models: ModelsConfig;
  code: CodeConfig;
  scheduler: SchedulerConfig;
  mode?: string;
  security?: SecurityConfig;
  persona?: string;
  tools?: ToolsConfig;
  mcp?: McpConfig;
}

export interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
}

/**
 * JSON Schema（draft-07 子集）。递归结构。
 */
export interface JSONSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  description?: string;
  title?: string;
  enum?: unknown[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

/** 工具参数元数据：描述「参数名 → 类型/说明」，是 schema 与系统提示词的单一来源。 */
export interface ToolParamDoc {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
}

/** 工具注解（R1.7）：决定工具在协议层如何暴露与渲染。 */
export interface ToolAnnotations {
  /** readOnlyHint：结果只读，不会改变系统状态。 */
  readOnlyHint?: boolean;
  /** destructiveHint：破坏性操作（覆盖/删除），模型应谨慎。 */
  destructiveHint?: boolean;
  /** idempotentHint：重复执行结果一致，可安全重试。 */
  idempotentHint?: boolean;
  /** openWorldHint：结果依赖外部世界（网络/时间）。 */
  openWorldHint?: boolean;
  /** title 中文显示名。 */
  title?: string;
}

/** 富错误规范（R1.9）：给工具错误附加稳定错误码与用户可读消息。 */
export interface RichErrorSpec {
  /** 是否开启富错误（默认 true）。 */
  enabled?: boolean;
  /** 错误码 → 中文用户提示模板（{message} 为原始错误信息占位）。 */
  hints?: Record<string, string>;
}

export interface ToolRegistryEntry {
  // 工具函数签名各异（参数个数、返回类型不定），用宽泛函数类型表达；
  // 调用处统一走 executeTool/registry 的预处理与结果归一化。
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  fn: Function;
  argCount: number;
  customArgs?: boolean;
  parseJson?: boolean | boolean[];
  category: string;
  jsonParams?: string[];
  isCustom?: boolean;
  plugin?: string;
  description?: string;
  /** 该工具的 JSON Schema（缺省时由 tool-schema 依据 argCount 自动生成）。 */
  schema?: JSONSchema;
  /** 工具注解（R1.7）。 */
  annotations?: ToolAnnotations;
  /** 参数元数据，用于从 schema 对象参数反推位置参数并做严格校验。 */
  params?: ToolParamDoc[];
  /** 富错误规范（R1.9）。 */
  richErrors?: RichErrorSpec;
}

export type ToolCategory =
  | 'file'
  | 'web'
  | 'system'
  | 'browser'
  | 'code'
  | 'git'
  | 'task'
  | 'memory'
  | 'data'
  | 'db'
  | 'email'
  | 'monitor'
  | 'scheduler'
  | 'ocr'
  | 'vision'
  | 'office'
  | 'cluster'
  | 'wechat'
  // bioinformatics/chemistry/literature 为插件工具分类
  // （见 plugins/biopython-bio、plugins/rdkit-chem 等），不可删除。
  | 'chemistry'
  | 'bioinformatics'
  | 'literature'
  // 外部 MCP server 接入的工具分类（见 src/agent/mcp.ts）。
  // 必须同时登记在 registry.ts 的 TOOL_CATEGORIES 中，否则
  // getEnabledToolNames() 会把这些工具过滤掉，导致注册后永不可见。
  | 'mcp';

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  /** 原生函数调用：该 assistant 消息发起的所有工具调用。 */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  /** tool role 消息对应的工具调用 id（原生协议）。 */
  tool_call_id?: string;
}

/** 原生协议解析出的工具调用（已把 JSON arguments 转为可执行参数）。 */
export interface NativeToolInvocation {
  id: string;
  name: string;
  /** 原始 arguments JSON 字符串。 */
  argsJson: string;
  /** 解析后的参数对象（{ param: value }），positional 由 schema 反推。 */
  args: Record<string, unknown>;
}

export interface SessionMeta {
  sessions: SessionInfo[];
  activeId: string | null;
}

export interface SessionInfo {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastActiveAt?: string;
  [key: string]: string | number | undefined;
}

export interface ThoughtTraceStep {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  params?: Record<string, unknown>;
  result?: string;
}

export interface AgentState {
  mode: 'thinking' | 'awaiting_input' | 'awaiting_confirmation' | 'idle';
  pendingConfirmation?: {
    toolName: string;
    args: unknown[];
    resolve: (confirmed: boolean) => void;
  };
}

export interface ToolCall {
  toolName: string;
  args: unknown[];
}

export interface StatsData {
  toolCalls: number;
  successRate: number;
  usageByCategory: Record<string, number>;
  topTools: Array<{ name: string; count: number }>;
}

/** MCP 服务端配置（R4）：本地 stdio MCP Server + 外部 MCP Client 注册。 */
export interface McpConfig {
  enabled?: boolean;
  /** 本地 MCP server 的 serverName，供外部客户端 connect。 */
  serverName?: string;
  /** 外部 MCP server 的注册表：{ name: { command, args, env } }。 */
  servers?: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
  /** MCP server 暴露的工具分类前缀。 */
  prefix?: string;
}

/** 工具权限策略（R5.2）：allow/deny/ask 三级。 */
export interface ToolPermissionRule {
  name: string;
  level: 'allow' | 'deny' | 'ask';
}

export interface ToolsConfig {
  enabledCategories?: string[];
  /** 权限规则：作用于协议层与协议调用前。 */
  permissions?: ToolPermissionRule[];
}

/** 技能（Skill）标准：每个技能目录是一个本体技能（R5.5）。 */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  version?: string;
  author?: string;
  tools: string[];
}

/** 笔记（R3.6）：会话内结构化长期笔记。 */
export interface SessionNote {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
