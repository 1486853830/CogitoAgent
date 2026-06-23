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
import { TOOL_REGISTRY } from './registry.js';

const PLUGINS_DIR = path.resolve(process.cwd(), 'plugins');

// 插件管理器
class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.customTools = new Map();
  }

  /**
   * 加载所有插件
   */
  async loadAll() {
    if (!existsSync(PLUGINS_DIR)) {
      return { loaded: 0, errors: [] };
    }

    const errors = [];
    let loaded = 0;

    try {
      const entries = readdirSync(PLUGINS_DIR);
      
      for (const entry of entries) {
        const pluginPath = path.join(PLUGINS_DIR, entry);
        const stat = statSync(pluginPath);
        
        if (!stat.isDirectory()) continue;
        
        try {
          await this.loadPlugin(entry, pluginPath);
          loaded++;
        } catch (error) {
          errors.push({ name: entry, error: error.message });
        }
      }
    } catch (error) {
      errors.push({ name: '*', error: error.message });
    }

    return { loaded, errors };
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(name, pluginPath) {
    const indexPath = path.join(pluginPath, 'index.js');
    
    if (!existsSync(indexPath)) {
      throw new Error('Plugin must have index.js');
    }

    // 动态导入插件
    const plugin = await import(`file://${indexPath}`);
    
    // 验证插件格式
    if (!plugin.default && !plugin.tools) {
      throw new Error('Plugin must export default or tools');
    }

    // 获取工具定义
    const tools = plugin.default || plugin.tools;
    
    // 支持函数或对象
    let toolDefs = typeof tools === 'function' ? await tools() : tools;
    
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
      metadata: plugin.metadata || {}
    });

    console.error(`[Plugin] Loaded '${name}' with ${toolDefs.length} tools`);
  }

  /**
   * 注册工具
   */
  registerTool(toolDef, pluginName) {
    const { name, fn, description, category = 'plugin' } = toolDef;
    
    if (!name || !fn) {
      throw new Error('Tool must have name and fn');
    }

    if (this.customTools.has(name)) {
      console.error(`[Plugin] Tool '${name}' already exists, skipping`);
      return;
    }

    // 添加到自定义工具映射
    this.customTools.set(name, {
      fn,
      description: description || `Plugin: ${pluginName}`,
      category,
      plugin: pluginName
    });

    // 添加到全局注册表
    TOOL_REGISTRY[name] = {
      fn,
      argCount: fn.length || 1,
      category,
      isCustom: true
    };
  }

  /**
   * 卸载插件
   */
  unloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    // 从注册表移除工具
    for (const tool of plugin.tools) {
      const toolName = tool.name;
      this.customTools.delete(toolName);
      delete TOOL_REGISTRY[toolName];
    }

    this.plugins.delete(name);
    console.error(`[Plugin] Unloaded '${name}'`);
    return true;
  }

  /**
   * 获取已加载的插件列表
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      path: p.path,
      toolCount: p.tools.length,
      metadata: p.metadata
    }));
  }

  /**
   * 获取所有自定义工具
   */
  listCustomTools() {
    return Array.from(this.customTools.entries()).map(([name, info]) => ({
      name,
      description: info.description,
      category: info.category,
      plugin: info.plugin
    }));
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name) {
    return this.customTools.has(name);
  }

  /**
   * 获取工具信息
   */
  getToolInfo(name) {
    return this.customTools.get(name);
  }
}

// 插件管理器单例
let pluginManager = null;

/**
 * 获取插件管理器
 */
function getPluginManager() {
  if (!pluginManager) {
    pluginManager = new PluginManager();
  }
  return pluginManager;
}

/**
 * 加载所有插件
 */
async function loadPlugins() {
  const pm = getPluginManager();
  return pm.loadAll();
}

/**
 * 卸载插件
 */
function unloadPlugin(name) {
  const pm = getPluginManager();
  return pm.unloadPlugin(name);
}

/**
 * 列出插件
 */
function listPlugins() {
  const pm = getPluginManager();
  return pm.listPlugins();
}

/**
 * 列出自定义工具
 */
function listCustomTools() {
  const pm = getPluginManager();
  return pm.listCustomTools();
}

/**
 * 创建插件模板
 */
function createPluginTemplate(name) {
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
`
  };
}

/**
 * 工具装饰器工厂
 */
function createTool(options) {
  return function(target, propertyKey, descriptor) {
    const originalFn = descriptor.value;
    
    descriptor.value = async function(...args) {
      const startTime = Date.now();
      
      try {
        const result = await originalFn.apply(this, args);
        const duration = Date.now() - startTime;
        
        console.error(`[Tool:${options.name}] completed in ${duration}ms`);
        
        return result;
      } catch (error) {
        console.error(`[Tool:${options.name}] failed: ${error.message}`);
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * 注册为 CogitoAgent 工具
 */
function registerTool(name, fn, options = {}) {
  const pm = getPluginManager();
  pm.registerTool({
    name,
    fn,
    description: options.description || '',
    category: options.category || 'custom'
  }, options.pluginName || 'internal');
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
  registerTool
};
