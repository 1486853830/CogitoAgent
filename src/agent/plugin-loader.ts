/**
 * AI for Science 插件加载器
 * 自动发现 plugins/ 目录下的科学插件，动态加载并注册到工具系统
 */

import { readdirSync, existsSync, statSync, readFileSync } from 'fs';
import path from 'path';

interface PluginMetadata {
  name: string;
  version: string;
  author: string;
  description: string;
  dependencies: string[];
  config: {
    scientificMode: boolean;
  };
}

interface PluginTool {
  name: string;
  description: string;
  category: string;
  fn: (...args: any[]) => Promise<any>;
}

interface PluginModule {
  default: PluginTool[];
  metadata: PluginMetadata;
}

const PLUGINS_DIR = path.resolve(import.meta.dirname || __dirname, '../../plugins');

/**
 * 扫描 plugins 目录，返回所有可用插件的基础信息
 */
function scanPlugins(): Array<{ name: string; path: string; metadata: PluginMetadata | null }> {
  const results: Array<{ name: string; path: string; metadata: PluginMetadata | null }> = [];

  if (!existsSync(PLUGINS_DIR)) {
    return results;
  }

  const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pluginPath = path.join(PLUGINS_DIR, entry.name);
      const indexFile = path.join(pluginPath, 'index.js');
      const packageFile = path.join(pluginPath, 'package.json');

      if (existsSync(indexFile)) {
        let metadata: PluginMetadata | null = null;
        if (existsSync(packageFile)) {
          try {
            const pkg = JSON.parse(readFileSync(packageFile, 'utf-8'));
            metadata = {
              name: pkg.name || entry.name,
              version: pkg.version || '0.0.0',
              author: pkg.author || '',
              description: pkg.description || '',
              dependencies: pkg.keywords || [],
              config: { scientificMode: false },
            };
          } catch {}
        }

        results.push({
          name: entry.name,
          path: pluginPath,
          metadata,
        });
      }
    }
  }

  return results;
}

/**
 * 动态加载插件，返回所有工具函数
 */
async function loadPlugin(pluginName: string): Promise<PluginTool[]> {
  const pluginPath = path.join(PLUGINS_DIR, pluginName, 'index.js');

  if (!existsSync(pluginPath)) {
    console.warn(`[插件加载器] 插件未找到: ${pluginName}`);
    return [];
  }

  try {
    const module: PluginModule = await import(pluginPath);
    const tools = module.default || [];

    console.log(
      `[插件加载器] 已加载插件: ${module.metadata?.name || pluginName} (${tools.length} 个工具)`,
    );
    return tools;
  } catch (error) {
    console.error(`[插件加载器] 加载插件失败: ${pluginName}`, error);
    return [];
  }
}

/**
 * 加载所有已发现插件的工具
 */
async function loadAllPlugins(): Promise<PluginTool[]> {
  const plugins = scanPlugins();
  const allTools: PluginTool[] = [];

  for (const plugin of plugins) {
    const tools = await loadPlugin(plugin.name);
    allTools.push(...tools);
  }

  console.log(`[插件加载器] 共加载 ${allTools.length} 个科学工具，来自 ${plugins.length} 个插件`);
  return allTools;
}

/**
 * 获取插件系统的提示信息，供 LLM 了解可用插件
 */
function getPluginPrompt(): string {
  const plugins = scanPlugins();

  if (plugins.length === 0) {
    return '';
  }

  let prompt = '\n## 已安装的科学插件\n\n';

  for (const plugin of plugins) {
    const meta = plugin.metadata;
    if (meta) {
      prompt += `### ${meta.name} v${meta.version}\n`;
      prompt += `- ${meta.description}\n`;
      prompt += `- 依赖: ${meta.dependencies.length > 0 ? meta.dependencies.join(', ') : '无'}\n`;
      if (meta.config.scientificMode) {
        prompt += '- 需要启用科学模式 (COGITO_CODE_SCIENTIFIC_MODE=true)\n';
      }
      prompt += '\n';
    } else {
      prompt += `### ${plugin.name}\n`;
      prompt += '- 状态: 已安装，无元数据\n\n';
    }
  }

  return prompt;
}

export { scanPlugins, loadPlugin, loadAllPlugins, getPluginPrompt };
export type { PluginTool, PluginMetadata };
