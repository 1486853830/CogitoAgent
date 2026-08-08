/**
 * 插件系统模块
 * 支持动态加载自定义工具插件
 *
 * 插件目录结构:
 * plugins/
 *   my-plugin/
 *     index.js      # 插件入口
 *     package.json  # 插件配置（可选）
 */

import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { TOOL_REGISTRY } from './registry.ts';
import { loadConfig } from '../config.ts';
import type { JSONSchema, ToolAnnotations, RichErrorSpec, SkillInfo } from '../types/index.ts';

const PLUGINS_DIR = path.resolve(process.cwd(), 'plugins');

function getSkillsDir(): string {
  return process.env.COGITO_SKILLS_DIR || path.resolve(process.cwd(), 'skills');
}

interface ToolDef {
  name: string;
  fn: (...args: unknown[]) => unknown;
  description?: string;
  category?: string;
  /** 插件可直接声明的 JSON Schema / 参数文档 / 注解（R5.1/R5.2）。 */
  schema?: JSONSchema;
  param?: ToolParamDoc[];
  annotations?: ToolAnnotations;
  richErrors?: RichErrorSpec;
  [key: string]: unknown;
}

interface ToolParamDoc {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  description?: string;
  required?: boolean;
}

interface PluginInfo {
  name: string;
  path: string;
  tools: ToolDef[];
  metadata: Record<string, unknown>;
}

interface CustomToolInfo {
  fn: (...args: unknown[]) => unknown;
  description: string;
  category: string;
  plugin: string;
}

interface LoadResult {
  loaded: number;
  errors: Array<{ name: string; error: string }>;
}

interface PluginListInfo {
  name: string;
  path: string;
  toolCount: number;
  metadata: Record<string, unknown>;
}

// 插件管理器
class PluginManager {
  plugins: Map<string, PluginInfo>;
  customTools: Map<string, CustomToolInfo>;
  private pluginsDir: string;

  constructor(pluginsDir?: string) {
    this.plugins = new Map();
    this.customTools = new Map();
    this.pluginsDir = pluginsDir || PLUGINS_DIR;
  }

  /**
   * 加载所有插件
   */
  async loadAll(): Promise<LoadResult> {
    if (!existsSync(this.pluginsDir)) {
      return { loaded: 0, errors: [] };
    }

    const errors: Array<{ name: string; error: string }> = [];
    let loaded = 0;

    try {
      const entries = readdirSync(this.pluginsDir);

      for (const entry of entries) {
        const pluginPath = path.join(this.pluginsDir, entry);
        const stat = statSync(pluginPath);

        if (!stat.isDirectory()) continue;

        // 跳过公共辅助目录（如 shared/）：没有 index.js 的目录不是独立插件，
        // 避免把供插件复用的公共模块误当作插件加载而报错。
        const indexPath = path.join(pluginPath, 'index.js');
        if (!existsSync(indexPath)) continue;

        try {
          await this.loadPlugin(entry, pluginPath);
          loaded++;
        } catch (error: unknown) {
          errors.push({ name: entry, error: (error as Error).message });
        }
      }
    } catch (error: unknown) {
      errors.push({ name: '*', error: (error as Error).message });
    }

    return { loaded, errors };
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(name: string, pluginPath: string): Promise<void> {
    const indexPath = path.join(pluginPath, 'index.js');

    if (!existsSync(indexPath)) {
      throw new Error('Plugin must have index.js');
    }

    // 动态导入插件
    const plugin: { default?: unknown; tools?: unknown; metadata?: Record<string, unknown> } =
      await import(`file://${indexPath}`);

    // 验证插件格式
    if (!plugin.default && !plugin.tools) {
      throw new Error('Plugin must export default or tools');
    }

    // 获取工具定义
    const tools = plugin.default || plugin.tools;

    // 支持函数或对象
    let toolDefs: ToolDef[] = typeof tools === 'function' ? await tools() : tools;

    if (!Array.isArray(toolDefs)) {
      toolDefs = [toolDefs];
    }

    // 注册工具
    for (const def of toolDefs) {
      this.registerTool(def, name);
    }

    this.plugins.set(name, {
      name,
      path: pluginPath,
      tools: toolDefs,
      metadata: plugin.metadata || {},
    });

    console.log(`[Plugin] Loaded '${name}' with ${toolDefs.length} tools`);
  }

  /**
   * 注册工具
   */
  registerTool(toolDef: ToolDef, pluginName: string): void {
    const { name, fn, description, category = 'plugin' } = toolDef;

    if (!name || !fn) {
      throw new Error('Tool must have name and fn');
    }

    if (this.customTools.has(name)) {
      console.warn(`[Plugin] Tool '${name}' already exists, skipping`);
      return;
    }

    // 添加到自定义工具映射
    this.customTools.set(name, {
      fn,
      description: description || `Plugin: ${pluginName}`,
      category,
      plugin: pluginName,
    });

    // 添加到全局注册表（R5.1：schema / 参数文档 / 注解 / 富错误配置随注册附带）
    TOOL_REGISTRY[name] = {
      fn,
      argCount: fn.length || 1,
      category,
      isCustom: true,
      plugin: pluginName,
      description: description || undefined,
      ...(toolDef.schema ? { schema: toolDef.schema } : {}),
      ...(toolDef.param ? { params: toolDef.param } : {}),
      ...(toolDef.annotations ? { annotations: toolDef.annotations } : {}),
      ...(toolDef.richErrors ? { richErrors: toolDef.richErrors } : {}),
    };
  }

  /**
   * 卸载插件
   */
  unloadPlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    // 从注册表移除工具
    for (const tool of plugin.tools) {
      const toolName = tool.name;
      this.customTools.delete(toolName);
      delete TOOL_REGISTRY[toolName];
    }

    this.plugins.delete(name);
    console.log(`[Plugin] Unloaded '${name}'`);
    return true;
  }

  /**
   * 获取已加载的插件列表
   */
  listPlugins(): PluginListInfo[] {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.name,
      path: p.path,
      toolCount: p.tools.length,
      metadata: p.metadata,
    }));
  }

  /**
   * 获取所有自定义工具
   */
  listCustomTools(): Array<{
    name: string;
    description: string;
    category: string;
    plugin: string;
  }> {
    return Array.from(this.customTools.entries()).map(([name, info]) => ({
      name,
      description: info.description,
      category: info.category,
      plugin: info.plugin,
    }));
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.customTools.has(name);
  }

  /**
   * 获取工具信息
   */
  getToolInfo(name: string): CustomToolInfo | undefined {
    return this.customTools.get(name);
  }
}

// 插件管理器单例
let pluginManager: PluginManager | null = null;

/**
 * 获取插件管理器
 */
function getPluginManager(): PluginManager {
  if (!pluginManager) {
    pluginManager = new PluginManager();
  }
  return pluginManager;
}

/**
 * 加载所有插件
 */
async function loadPlugins(): Promise<LoadResult> {
  const pm = getPluginManager();
  return pm.loadAll();
}

/**
 * 卸载插件
 */
function unloadPlugin(name: string): boolean {
  const pm = getPluginManager();
  return pm.unloadPlugin(name);
}

/**
 * 列出插件
 */
function listPlugins(): PluginListInfo[] {
  const pm = getPluginManager();
  return pm.listPlugins();
}

/**
 * 列出自定义工具
 */
function listCustomTools(): Array<{
  name: string;
  description: string;
  category: string;
  plugin: string;
}> {
  const pm = getPluginManager();
  return pm.listCustomTools();
}

/**
 * 创建插件模板
 */
function createPluginTemplate(name: string): Record<string, string> {
  return {
    'index.js': `/**
 * ${name} 插件
 * 插件工具可声明 schema / param / annotations / richErrors（见 types）。
 */

export default [
  {
    name: 'myTool',
    description: 'My custom tool',
    category: 'custom',
    fn: async (arg1, arg2) => {
      // 实现逻辑
      return { success: true, result: 'Hello!' };
    },
    // 可选：直接声明 JSON Schema，未声明时由系统按参数索引自动生成
    schema: {
      type: 'object',
      properties: {
        arg1: { type: 'string', description: 'First argument' },
        arg2: { type: 'number', description: 'Second argument' }
      },
      required: ['arg1']
    },
    // 可选：参数文档（供 system prompt / validation / 原生工具执行命名参数解析）
    param: [
      { name: 'arg1', type: 'string', description: 'First argument', required: true },
      { name: 'arg2', type: 'number', description: 'Second argument' }
    ],
    // 可选：工具注解（readOnlyHint 等，供 UI/权限层使用）
    annotations: {
      title: 'My Tool',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    // 可选：富错误消息规范（tool_calls 失败时系统按该规范生成可执行修正指令）
    richErrors: {
      enabled: true,
      hints: {
        'INVALID_ARGS': '请检查参数格式，确保 arg1 为字符串、arg2 为数字',
        'TOOL_ERROR': '工具执行失败，可尝试换一种参数组合'
      },
      retries: 2
    }
  }
];

export const metadata = {
  name: '${name}',
  version: '1.0.0',
  author: 'Your Name',
  description: 'A custom plugin for CogitoAgent',
  // 权限模型（R5.2）：声明本插件工具的默认权限级别。
  // 用户未显式配置 tools.permissions 规则时，按此默认值生效。
  // 可选值：'allow' | 'ask' | 'deny'。建议敏感工具（写文件/联网/执行）声明 'ask'。
  defaultPermission: 'ask'
};
`,
    'package.json': `{
  "name": "cogito-plugin-${name}",
  "version": "1.0.0",
  "description": "A CogitoAgent plugin",
  "main": "index.js",
  "type": "module"
}
`,
  };
}

/**
 * 工具装饰器工厂
 */
function createTool(options: { name: string; [key: string]: unknown }) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalFn = descriptor.value;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const startTime = Date.now();

      try {
        const result = await originalFn.apply(this, args);
        const duration = Date.now() - startTime;

        console.log(`[Tool:${options.name}] completed in ${duration}ms`);

        return result;
      } catch (error: unknown) {
        console.error(`[Tool:${options.name}] failed: ${(error as Error).message}`);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 解析工具权限级别（R5.2，纯函数，便于单测）。
 * 优先级：全局显式规则 (globalLevel) > 插件声明的 defaultPermission > allow。
 * globalLevel 来自配置 tools.permissions 中该工具名命中的规则；
 * pluginDefault 来自插件 manifest 的 metadata.defaultPermission。
 */
export function resolveToolPermission(
  globalLevel: 'allow' | 'deny' | 'ask' | null,
  pluginDefault?: 'allow' | 'deny' | 'ask',
): 'allow' | 'deny' | 'ask' {
  if (globalLevel === 'allow' || globalLevel === 'deny' || globalLevel === 'ask') {
    return globalLevel;
  }
  if (pluginDefault === 'allow' || pluginDefault === 'deny' || pluginDefault === 'ask') {
    return pluginDefault;
  }
  return 'allow';
}

/**
 * 权限策略查询（R5.2）。
 * 优先级：配置 tools.permissions 的 name 级规则 > 插件 manifest 声明的 defaultPermission > allow。
 * 未配置规则且插件未声明默认权限时返回 'allow'（由工具自身或 Agent 的危险操作确认兜底）。
 *
 * @param pluginDefaultProvider 测试/外部注入的「按工具名查插件默认权限」实现；
 *   省略时从本进程插件管理器查询（插件在 Agent 进程加载）。
 */
function getToolPermission(
  name: string,
  pluginDefaultProvider?: (toolName: string) => 'allow' | 'deny' | 'ask' | undefined,
): 'allow' | 'deny' | 'ask' {
  const cfg = loadConfig();
  const rules = cfg.tools?.permissions;
  let globalLevel: 'allow' | 'deny' | 'ask' | null = null;
  if (Array.isArray(rules)) {
    const rule = rules.find((r) => r.name === name);
    if (rule) globalLevel = rule.level;
  }

  let pluginDefault: 'allow' | 'deny' | 'ask' | undefined;
  if (pluginDefaultProvider) {
    pluginDefault = pluginDefaultProvider(name);
  } else {
    const pm = getPluginManager();
    const info = pm.getToolInfo(name);
    if (info?.plugin) {
      const meta = pm.plugins.get(info.plugin)?.metadata;
      if (
        meta &&
        (meta.defaultPermission === 'allow' ||
          meta.defaultPermission === 'deny' ||
          meta.defaultPermission === 'ask')
      ) {
        pluginDefault = meta.defaultPermission as 'allow' | 'deny' | 'ask';
      }
    }
  }

  return resolveToolPermission(globalLevel, pluginDefault);
}

/**
 * 权限门禁：返回 null 表示放行，否则返回拒绝原因（R5.2）。
 * 供协议层在工具执行前调用。
 */
function enforceToolPermission(name: string): string | null {
  const level = getToolPermission(name);
  if (level === 'deny') return `工具 ${name} 已被权限策略禁用`;
  return null;
}

/**
 * 技能目录加载（R5.5 / R5.6）。
 * 约定：skills/<skill>/SKILL.md 为一个技能本体，文件内 front-matter 为标准元数据；
 * tools 字段声明该技能启用的工具名。目录结构：
 *   skills/
 *     my-skill/
 *       SKILL.md
 */
function loadSkills(): SkillInfo[] {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) return [];
  const skills: SkillInfo[] = [];
  try {
    for (const entry of readdirSync(skillsDir)) {
      const skillPath = path.join(skillsDir, entry);
      try {
        const stat = statSync(skillPath);
        if (!stat.isDirectory()) continue;
        const skillFile = path.join(skillPath, 'SKILL.md');
        if (!existsSync(skillFile)) continue;

        const content = readFileSync(skillFile, 'utf-8');
        const meta = parseSkillMetadata(content);
        // front-matter 缺失时用文件名兜底
        const name = String(meta.name ?? entry);
        const description = String(meta.description ?? '');
        const tools = Array.isArray(meta.tools) ? meta.tools.map(String) : [];

        skills.push({
          id: entry,
          name,
          description,
          path: skillPath,
          version: typeof meta.version === 'string' ? meta.version : undefined,
          author: typeof meta.author === 'string' ? meta.author : undefined,
          tools,
        });
      } catch {
        // 单个技能解析失败不阻塞其他技能
      }
    }
  } catch {
    // skills 目录不存在时忽略
  }
  return skills;
}

/** 解析 SKILL.md 的 YAML-ish front matter（--- 包裹的 key: value / 列表）。 */
function parseSkillMetadata(content: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  const block = match ? match[1] : content.split('\n').slice(0, 8).join('\n');
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    const eqIdx = line.indexOf(':');
    if (eqIdx === -1 || line.startsWith('#')) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!key) continue;
    if (/^\[.*\]$/.test(value)) {
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) =>
          v
            .trim()
            .replace(/^"(.*)"$/, '$1')
            .replace(/^'(.*)'$/, '$1'),
        )
        .filter(Boolean);
    } else {
      meta[key] = value === '' ? undefined : value;
    }
  }
  return meta;
}

/**
 * 热重载插件（R5.3）：卸载全部插件后重新扫描加载。
 */
async function reloadPlugins(): Promise<LoadResult> {
  const pm = getPluginManager();
  const loaded = Array.from(pm.plugins.keys());
  for (const name of loaded) {
    pm.unloadPlugin(name);
  }
  return pm.loadAll();
}

interface RegisterToolOptions {
  description?: string;
  category?: string;
  pluginName?: string;
}

/**
 * 注册为 CogitoAgent 工具
 */
function registerTool(
  name: string,
  fn: (...args: unknown[]) => unknown,
  options: RegisterToolOptions = {},
): void {
  const pm = getPluginManager();
  pm.registerTool(
    {
      name,
      fn,
      description: options.description || '',
      category: options.category || 'custom',
    },
    options.pluginName || 'internal',
  );
}

export {
  PluginManager,
  getPluginManager,
  loadPlugins,
  unloadPlugin,
  listPlugins,
  listCustomTools,
  createPluginTemplate,
  createTool,
  registerTool,
  getToolPermission,
  enforceToolPermission,
  loadSkills,
  reloadPlugins,
};
