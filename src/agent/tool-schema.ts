/**
 * 工具 Schema 层（R1.1 / R1.6 / R1.7 / R1.9）。
 *
 * - JSON Schema 生成：TOOL_DOCS（单一来源）→ JSONSchema；未登记工具按 argCount 退化生成。
 * - 参数校验：native 函数调用到达后在执行前校验（R1.6）。
 * - 注解：把 ToolAnnotations 映射成可对外暴露的注解（MCP / 前端 / 提示词用）（R1.7）。
 * - 富错误：工具失败时附加稳定错误码 + 用户可读文案（R1.9）。
 */

import { getToolRegistry, DANGEROUS_OPERATIONS } from './registry.ts';
import { TOOL_DOCS } from './tool-docs.ts';
import type { JSONSchema, ToolAnnotations, ToolParamDoc } from '../types/index.ts';

/** 未在 TOOL_DOCS 登记的工具：按注册表 argCount 生成通用参数名。 */
function genericParamDocs(name: string): ToolParamDoc[] {
  const entry = getToolRegistry(name);
  const count = Math.max(entry?.argCount ?? 0, 0);
  const docs: ToolParamDoc[] = [];
  for (let i = 0; i < count; i++) {
    docs.push({
      name: `arg${i}`,
      type: 'string',
      description: `第 ${i + 1} 个参数`,
      required: true,
    });
  }
  return docs;
}

export function getToolParamDocs(name: string): ToolParamDoc[] {
  const entryParams = getToolRegistry(name)?.params;
  if (entryParams && entryParams.length > 0) return entryParams;
  const curated = TOOL_DOCS[name]?.params;
  if (curated && curated.length > 0) return curated;
  return genericParamDocs(name);
}

export function getToolDescription(name: string): string {
  return getToolRegistry(name)?.description || TOOL_DOCS[name]?.description || `执行工具 ${name}`;
}

/**
 * 行为注解推导（R1.7）：为「每个工具」声明 readOnly / destructive / idempotent / openWorld。
 * - 优先采用 TOOL_DOCS / registry 中的显式注解（override）；
 * - 未显式声明时从权威信号推导：
 *   - destructiveHint：以 registry.DANGEROUS_OPERATIONS 为准（自动批准/确认的唯一事实来源）；
 *   - readOnlyHint：读取 / 查询类工具（显式名单或前缀匹配）；
 *   - openWorldHint：依赖外部世界（网络 / 时间）的工具（web/vision/ocr/email/wechat/cluster 类）；
 *   - idempotentHint：只读工具天然可安全重试，其余默认 false。
 * 推导结果经由 toPlainAnnotations 随 OpenAI tools 暴露，并经 mcp.ts 以 toolAnnotations 传播。
 */
const READ_ONLY_NAMES = new Set([
  'browse',
  'getPageContent',
  'viewChanges',
  'monitorSystem',
  'csvToJSON',
  'jsonToCSV',
  'gitStatus',
  'gitLog',
  'gitBranchList',
  'gitDiff',
]);
const READ_ONLY_PREFIXES = [
  'get',
  'list',
  'ls',
  'read',
  'fetch',
  'search',
  'query',
  'find',
  'status',
  'stat',
  'check',
  'analyze',
  'sort',
];
const OPEN_WORLD_CATEGORIES = new Set(['web', 'vision', 'ocr', 'email', 'wechat', 'cluster']);

function deriveToolAnnotations(name: string): ToolAnnotations {
  const entry = getToolRegistry(name);
  const category = entry?.category;
  const explicit = TOOL_DOCS[name]?.annotations || entry?.annotations || {};

  const destructiveHint = explicit.destructiveHint ?? DANGEROUS_OPERATIONS.has(name);
  const readOnlyHint =
    explicit.readOnlyHint ??
    (READ_ONLY_NAMES.has(name) || READ_ONLY_PREFIXES.some((p) => name.startsWith(p)));
  const openWorldHint =
    explicit.openWorldHint ?? (category ? OPEN_WORLD_CATEGORIES.has(category) : false);
  const idempotentHint = explicit.idempotentHint ?? readOnlyHint;

  const result: ToolAnnotations = {
    readOnlyHint,
    destructiveHint,
    idempotentHint,
    openWorldHint,
  };
  if (explicit.title !== undefined) result.title = explicit.title;
  return result;
}

export function getToolAnnotations(name: string): ToolAnnotations {
  // 未知工具：保持返回 {}（向后兼容，对应测试断言）。
  if (!getToolRegistry(name) && !TOOL_DOCS[name]) return {};
  return deriveToolAnnotations(name);
}

function typeToSchemaType(type: ToolParamDoc['type']): JSONSchema['type'] {
  switch (type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    default:
      return 'string';
  }
}

/** 把 params 元数据转成 JSON Schema object。 */
export function paramsToSchema(params: ToolParamDoc[]): JSONSchema {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];
  for (const param of params) {
    const isAny = param.type === 'any';
    const type = isAny ? undefined : typeToSchemaType(param.type);
    properties[param.name] = {
      ...(type ? { type } : {}),
      description: param.description,
    };
    if (param.required !== false && !isAny) {
      required.push(param.name);
    }
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

/** 生成单个工具完整 JSON Schema。 */
export function getToolSchema(name: string): JSONSchema {
  const extension = getToolRegistry(name)?.schema;
  if (extension) return extension;
  return paramsToSchema(getToolParamDocs(name));
}

/** 依据 Schema 校验对象参数，返回校验错误列表（空数组 = 通过）。R1.6 */
export function validateArgsAgainstSchema(
  schema: JSONSchema,
  args: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const properties = schema.properties || {};
  const required = schema.required || [];

  for (const key of required) {
    if (args[key] === undefined || args[key] === null) {
      errors.push(`缺少必填参数 "${key}"`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    if (!(key in properties)) {
      errors.push(`未知参数 "${key}"`);
      continue;
    }
    const propSchema = properties[key];
    const expectedType = propSchema.type;
    if (expectedType && expectedType !== undefined) {
      const actual = Array.isArray(value) ? 'array' : typeof value;
      if (
        expectedType === 'number' &&
        typeof value === 'string' &&
        value.trim() !== '' &&
        !Number.isNaN(Number(value))
      ) {
        continue; // 允许数字字符串传入 number 参数
      }
      if (actual !== expectedType) {
        errors.push(`参数 "${key}" 类型不匹配：期望 ${expectedType}，实际 ${actual}`);
      }
    }
  }
  return errors;
}

export function validateToolArgs(name: string, args: Record<string, unknown>): string[] {
  return validateArgsAgainstSchema(getToolSchema(name), args);
}

/** 校验工具名是否存在（供 native 调用到达时先用，避免未知工具被当成参数错误）。 */
export function isKnownTool(name: string): boolean {
  return getToolRegistry(name) !== null;
}

/**
 * 将原生函数调用的对象参数（{ param: value }）按参数顺序转回位置参数数组，
 * 供工具函数（期望位置参数）执行。未知参数会被忽略。
 */
export function objectArgsToPositional(name: string, args: Record<string, unknown>): unknown[] {
  const params = getToolParamDocs(name);
  return params.map((param) => args[param.name]);
}

/** JSON Schema 作为对象参数传递时带索引签名的形态。 */
type ToolSchemaWithIndex = JSONSchema & { [key: string]: unknown };

/** OpenAI 函数调用定义格式。 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolSchemaWithIndex;
    strict?: boolean;
    annotations?: {
      title?: string;
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
  };
}

/**
 * 生成本地注册表中全部工具的 OpenAI function 数组（R1.2）。
 * strict 时要求所有参数必填 + additionalProperties=false（OpenAI strict 约束）。
 */
export function buildOpenAITools(
  names: string[],
  options: { strict?: boolean; annotate?: boolean } = {},
): OpenAITool[] {
  const { strict = false, annotate = true } = options;
  const result: OpenAITool[] = [];
  for (const name of names) {
    const entry = getToolRegistry(name);
    if (!entry) continue;
    const schema = getToolSchema(name);
    const parameters: ToolSchemaWithIndex = {
      ...schema,
      required: strict ? Object.keys(schema.properties || {}) : schema.required || [],
    };
    const tool: OpenAITool = {
      type: 'function',
      function: {
        name,
        description: `${getToolDescription(name)}${entry.category ? ` [${entry.category}]` : ''}`,
        parameters,
        ...(strict ? { strict: true } : {}),
        ...(annotate ? { annotations: toPlainAnnotations(getToolAnnotations(name)) } : {}),
      },
    };
    result.push(tool);
  }
  return result;
}

function toPlainAnnotations(annotations: ToolAnnotations): OpenAITool['function']['annotations'] {
  if (Object.keys(annotations).length === 0) return undefined;
  return {
    title: annotations.title,
    readOnlyHint: annotations.readOnlyHint,
    destructiveHint: annotations.destructiveHint,
    idempotentHint: annotations.idempotentHint,
    openWorldHint: annotations.openWorldHint,
  };
}

/** 富错误码 → 默认提示文案（R1.9）。 */
export const RICH_ERROR_HINTS: Record<string, string> = {
  ETIMEOUT: '操作超时未完成，请稍后重试。',
  ENOTFOUND: '找不到目标文件/路径，请检查后重试。',
  EDENIED: '权限不足，无法完成该操作。',
  EINVALID: '操作基本参数不匹配，请调整后再试。',
  ENETWORK: '网络连接失败，请检查网络后重试。',
  EEXEC: '命令/脚本执行失败（{message}）。',
  EUNKNOWN: '操作失败：{message}',
};

/**
 * 把工具错误归一化为「稳定错误码 + 用户可读文案」的富错误（R1.9）。
 * errorCode 未命中时根据 message 启发式归类。
 */
export function toRichError(errorCode: string, message: string): { code: string; message: string } {
  let code = errorCode;
  if (!code) {
    const msg = (message || '').toLowerCase();
    code = /timeout|timed out|aborted/.test(msg)
      ? 'ETIMEOUT'
      : /not found|no such|不存在|无法找到/.test(msg)
        ? 'ENOTFOUND'
        : /permission|denied|eacces|拒绝/.test(msg)
          ? 'EDENIED'
          : /network|econn|etimedout|enotfound|fetch failed/.test(msg)
            ? 'ENETWORK'
            : /invalid|illegal|非法|不合法/.test(msg)
              ? 'EINVALID'
              : 'EEXEC';
  }
  const hint = RICH_ERROR_HINTS[code] || RICH_ERROR_HINTS.EUNKNOWN;
  return { code, message: hint.replace('{message}', message.slice(0, 300)) };
}

export { RICH_ERROR_HINTS as TOOL_RICH_ERROR_HINTS };
