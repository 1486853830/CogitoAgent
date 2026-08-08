import {
  isValidPersonaName,
  applyPersona,
  setActivePersona,
  getActivePersonaName,
  resolvePersonaPath,
  getCurrentPersonaTitle,
} from '../../src/agent/persona.ts';
import path from 'path';

describe('persona 模块（按名直接读 personas/，不复制文件）', () => {
  beforeEach(() => {
    // 每个用例前重置活动人设为默认（Cogito）
    setActivePersona(null);
  });

  it('resolvePersonaPath: 默认人设指向 personas/cogito/persona.md', () => {
    const p = resolvePersonaPath(null);
    expect(p).toBe(path.resolve(process.cwd(), 'personas', 'cogito', 'persona.md'));
  });

  it('resolvePersonaPath: 显式 cogito 也指向默认人设文件夹', () => {
    const p = resolvePersonaPath('cogito');
    expect(p).toBe(path.resolve(process.cwd(), 'personas', 'cogito', 'persona.md'));
  });

  it('resolvePersonaPath: 命名人设指向 personas/<name>/persona.md', () => {
    const p = resolvePersonaPath('Shaanbei-Youth');
    expect(p).toBe(path.resolve(process.cwd(), 'personas', 'Shaanbei-Youth', 'persona.md'));
  });

  it('applyPersona(null): 重置为默认人设并返回 true', () => {
    setActivePersona('Shaanbei-Youth');
    expect(applyPersona(null)).toBe(true);
    expect(getActivePersonaName()).toBeNull();
  });

  it('applyPersona(有效名): 设置活动人设并返回 true', () => {
    expect(applyPersona('Shaanbei-Youth')).toBe(true);
    expect(getActivePersonaName()).toBe('Shaanbei-Youth');
  });

  it('applyPersona(不存在的人设): 返回 false 且不改变活动人设', () => {
    setActivePersona(null);
    expect(applyPersona('ThisPersonaDoesNotExist')).toBe(false);
    expect(getActivePersonaName()).toBeNull();
  });

  it('applyPersona(路径穿越): 拒绝非法名称并返回 false', () => {
    expect(isValidPersonaName('../evil')).toBe(false);
    expect(applyPersona('../evil')).toBe(false);
    expect(getActivePersonaName()).toBeNull();
  });

  it('getCurrentPersonaTitle: 默认/命名人设均直接读 personas/ 文件夹', () => {
    setActivePersona(null);
    const def = getCurrentPersonaTitle();
    expect(typeof def).toBe('string');
    expect(def.length).toBeGreaterThan(0);

    setActivePersona('Shaanbei-Youth');
    const named = getCurrentPersonaTitle();
    expect(named).toContain('陕北少年');
  });
});
