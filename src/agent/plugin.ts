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

import { readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { TOOL_REGISTRY } from './registry.ts';

const PLUGINS_DIR = path.resolve(process.cwd(), 'plugins');

interface ToolDef {
  name: string;
  fn: (...args: any[]) => any;
  description?: string;
  category?: string;
  [key: string]: any;
}

interface PluginInfo {
  name: string;
  path: string;
  tools: ToolDef[];
  metadata: Record<string, any>;
}

interface CustomToolInfo {
  fn: (...args: any[]) => any;
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
  metadata: Record<string, any>;
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

        try {
          await this.loadPlugin(entry, pluginPath);
          loaded++;
        } catch (error: any) {
          errors.push({ name: entry, error: error.message });
        }
      }
    } catch (error: any) {
      errors.push({ name: '*', error: error.message });
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
    const plugin: any = await import(`file://${indexPath}`);

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

    // 添加到全局注册表
    TOOL_REGISTRY[name] = {
      fn,
      argCount: fn.length || 1,
      category,
      isCustom: true,
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
 */

export default [
  {
    name: 'myTool',
    description: 'My custom tool',
    category: 'custom',
    fn: async (arg1, arg2) => {
      // 实现逻辑
      return { success: true, result: 'Hello!' };
    }
  }
];

export const metadata = {
  name: '${name}',
  version: '1.0.0',
  author: 'Your Name',
  description: 'A custom plugin for CogitoAgent'
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
function createTool(options: { name: string; [key: string]: any }) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalFn = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      const startTime = Date.now();

      try {
        const result = await originalFn.apply(this, args);
        const duration = Date.now() - startTime;

        console.log(`[Tool:${options.name}] completed in ${duration}ms`);

        return result;
      } catch (error: any) {
        console.error(`[Tool:${options.name}] failed: ${error.message}`);
        throw error;
      }
    };

    return descriptor;
  };
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
  fn: (...args: any[]) => any,
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
};
