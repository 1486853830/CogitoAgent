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
}

export interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
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
  | 'literature';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
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
