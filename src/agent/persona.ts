import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

/**
 * 校验人设名称是否安全：仅允许字母/数字/中划线/下划线/点（无路径分隔符与 .. 段），
 * 防止 persona 参数被用于路径穿越读取任意目录下的 persona.md。
 */
export function isValidPersonaName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

/**
 * 复制指定 Persona 的 persona.md 到数据目录，返回是否成功。
 * 集中处理路径解析与写入，避免在 setup/commands/session/Agent 等处重复实现。
 */
export function applyPersona(personaName: string): boolean {
  const dataDir = process.env.COGITO_USER_DATA_DIR || process.cwd();
  const personaPath = path.resolve(process.cwd(), 'personas', personaName, 'persona.md');
  const targetPath = path.resolve(dataDir, 'persona.md');

  if (!isValidPersonaName(personaName)) {
    console.warn(`[Persona] 非法的人设名称，已拒绝: ${personaName}`);
    return false;
  }

  try {
    if (!existsSync(personaPath)) {
      return false;
    }
    const content = readFileSync(personaPath, 'utf-8');
    const dir = path.dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(targetPath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** 同步当前 Persona 到 .env 的 COGITO_PERSONA（由上层决定是否调用）。 */
export function getPersonaPath(personaName: string): string {
  return path.resolve(process.cwd(), 'personas', personaName, 'persona.md');
}

/** 读取当前活动 persona.md 的第一行标题（用于 CLI banner/状态显示）。 */
export function getCurrentPersonaTitle(): string {
  const dataDir = process.env.COGITO_USER_DATA_DIR || process.cwd();
  const targetPath = path.resolve(dataDir, 'persona.md');
  try {
    if (existsSync(targetPath)) {
      const firstLine = readFileSync(targetPath, 'utf-8').split('\n')[0].trim();
      if (firstLine) {
        return firstLine.replace(/^#+\s*/, '');
      }
    }
    // 用户数据目录无 persona.md 时，回退读取人设根目录的默认人设标题
    const defaultPath = path.resolve(process.cwd(), 'personas', 'persona.md');
    if (existsSync(defaultPath)) {
      const firstLine = readFileSync(defaultPath, 'utf-8').split('\n')[0].trim();
      if (firstLine) {
        return firstLine.replace(/^#+\s*/, '');
      }
    }
  } catch {
    // 忽略读取失败，返回默认
  }
  return '默认';
}
