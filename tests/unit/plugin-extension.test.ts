import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- Mock TOOL_REGISTRY to isolate tests from real registry ---
const mockToolRegistry: Record<string, any> = {};
jest.unstable_mockModule('../../src/agent/registry.ts', () => ({
  TOOL_REGISTRY: mockToolRegistry,
}));

// 用临时用户数据目录承载 config.json，供 loadConfig 读取权限规则。
const TEMP_DIR = path.join(os.tmpdir(), `cogito-plugin-ext-${Date.now()}`);
process.env.COGITO_USER_DATA_DIR = TEMP_DIR;
fs.mkdirSync(TEMP_DIR, { recursive: true });

import { reloadConfig } from '../../src/config.ts';

const { PluginManager, registerTool, getPluginManager, loadSkills, reloadPlugins } =
  await import('../../src/agent/plugin.ts');

function writeConfig(partial: Record<string, unknown>) {
  fs.writeFileSync(path.join(TEMP_DIR, 'config.json'), JSON.stringify(partial), 'utf-8');
}

describe('plugin.ts extensions (R5)', () => {
  beforeEach(() => {
    Object.keys(mockToolRegistry).forEach((k) => delete mockToolRegistry[k]);
    const pm = getPluginManager();
    pm.customTools.clear();
    pm.plugins.clear();
  });

  describe('registerTool with schema/annotations', () => {
    it('should propagate schema, params and annotations to registry', () => {
      const pm = getPluginManager();
      pm.registerTool(
        {
          name: 'richTool',
          fn: () => 'ok',
          description: 'rich tool',
          category: 'test',
          schema: { type: 'object', properties: { x: { type: 'string' } } },
          param: [{ name: 'x', type: 'string', required: true }],
          annotations: { readOnlyHint: true, title: '富工具' },
        },
        'p1',
      );
      expect(mockToolRegistry.richTool).toBeDefined();
      expect(mockToolRegistry.richTool.schema).toEqual({
        type: 'object',
        properties: { x: { type: 'string' } },
      });
      expect(mockToolRegistry.richTool.params).toEqual([
        { name: 'x', type: 'string', required: true },
      ]);
      expect(mockToolRegistry.richTool.annotations).toEqual({
        readOnlyHint: true,
        title: '富工具',
      });
    });
  });

  describe('tool permissions (R5.2)', () => {
    it('enforceToolPermission denies configured tool, allows others', async () => {
      writeConfig({
        tools: {
          enabledCategories: ['file'],
          permissions: [{ name: 'ls', level: 'deny' }],
        },
      });
      reloadConfig();
      const { enforceToolPermission } = await import('../../src/agent/plugin.ts');
      expect(enforceToolPermission('ls')).toContain('禁用');
      expect(enforceToolPermission('read')).toBeNull();
    });

    it('allows everything when no rules configured', async () => {
      writeConfig({});
      reloadConfig();
      const { enforceToolPermission } = await import('../../src/agent/plugin.ts');
      expect(enforceToolPermission('anything')).toBeNull();
    });
  });

  describe('skills directory (R5.5/5.6)', () => {
    it('should return empty list when skills dir missing', async () => {
      const originalCwd = process.cwd();
      const emptyRoot = path.join(os.tmpdir(), `cogito-no-skills-${Date.now()}`);
      fs.mkdirSync(emptyRoot, { recursive: true });
      try {
        process.chdir(emptyRoot);
        const mod = await import('../../src/agent/plugin.ts');
        expect(mod.loadSkills()).toEqual([]);
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(emptyRoot, { recursive: true, force: true });
      }
    });

    it('should load skills with SKILL.md front matter', async () => {
      const originalCwd = process.cwd();
      const root = path.join(os.tmpdir(), `cogito-with-skills-${Date.now()}`);
      const skillDir = path.join(root, 'skills', 'demo');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: 演示技能\ndescription: 一个演示技能\ntools: ["ls", "read"]\nversion: 1.2.0\n---\n\n# 正文',
        'utf-8',
      );
      fs.mkdirSync(path.join(root, 'skills', 'no-skill-file'), { recursive: true });
      try {
        process.chdir(root);
        const mod = await import('../../src/agent/plugin.ts');
        const skills = mod.loadSkills();
        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe('演示技能');
        expect(skills[0].description).toBe('一个演示技能');
        expect(skills[0].tools).toEqual(['ls', 'read']);
        expect(skills[0].version).toBe('1.2.0');
        expect(skills[0].path).toContain('demo');
      } finally {
        process.chdir(originalCwd);
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('reloadPlugins (R5.3)', () => {
    it('should reload without throwing in clean environment', async () => {
      getPluginManager().plugins.clear();
      const result = await reloadPlugins();
      expect(typeof result.loaded).toBe('number');
    });
  });
});
