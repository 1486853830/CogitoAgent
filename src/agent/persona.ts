import { readFileSync, existsSync } from 'fs';
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
 * 默认人设文件夹名（Cogito）。
 * 默认人设以普通文件夹形式存在于 personas/cogito/，而非根目录的 personas/persona.md，
 * 这样"默认"与普通命名人设走同一套按名读取逻辑，不再特殊对待根目录文件。
 */
export const DEFAULT_PERSONA = 'cogito';

/**
 * 当前活动人设名称（模块级状态）。
 * null / 空字符串 表示默认人设（personas/cogito/persona.md，即 Cogito）。
 *
 * 设计说明：人设不再复制文件到数据目录，而是按名称直接读取 personas/ 文件夹。
 * 这样避免了"残留的 persona.md 永远顶着默认人设"这类问题，也消除了无意义的文件拷贝。
 */
let activePersona: string | null = null;

export function setActivePersona(personaName: string | null): void {
  activePersona = personaName && personaName.trim() ? personaName.trim() : null;
}

export function getActivePersonaName(): string | null {
  return activePersona;
}

/**
 * 解析人设文件路径：
 * - 命名人设 / 默认人设（name 为空或 'cogito'）-> personas/<name>/persona.md
 * 默认人设统一指向 DEFAULT_PERSONA 文件夹（personas/cogito/persona.md）。
 * 直接读取 personas 文件夹，不再复制文件到数据目录。
 */
export function resolvePersonaPath(personaName: string | null): string {
  const dir = personaName && personaName.trim() ? personaName.trim() : DEFAULT_PERSONA;
  return path.resolve(process.cwd(), 'personas', dir, 'persona.md');
}

/**
 * 设定并校验活动人设（不再复制文件）。返回该人设是否存在于 personas/ 文件夹。
 * 保留原 applyPersona 名称以兼容调用点（switchPersona / 会话加载）。
 *
 * @param personaName 人设名称；null / 空字符串表示重置为默认人设（Cogito）。
 */
export function applyPersona(personaName: string | null): boolean {
  if (!personaName || !personaName.trim()) {
    setActivePersona(null);
    return true;
  }
  if (!isValidPersonaName(personaName)) {
    console.warn(`[Persona] 非法的人设名称，已拒绝: ${personaName}`);
    return false;
  }
  const personaPath = resolvePersonaPath(personaName);
  if (!existsSync(personaPath)) {
    return false;
  }
  setActivePersona(personaName);
  return true;
}

/** 兼容旧调用点：返回命名人设的 personas/<name>/persona.md 绝对路径。 */
export function getPersonaPath(personaName: string): string {
  return resolvePersonaPath(personaName);
}

/** 读取当前活动 persona 的第一行标题（用于 CLI banner/状态显示）。直接读 personas/ 文件夹。 */
export function getCurrentPersonaTitle(): string {
  const personaPath = resolvePersonaPath(activePersona);
  try {
    if (existsSync(personaPath)) {
      const firstLine = readFileSync(personaPath, 'utf-8').split('\n')[0].trim();
      if (firstLine) {
        return firstLine.replace(/^#+\s*/, '');
      }
    }
  } catch {
    // 忽略读取失败，返回默认
  }
  return '默认';
}
