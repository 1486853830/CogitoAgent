import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

/**
 * 复制指定 Persona 的 persona.md 到数据目录，返回是否成功。
 * 集中处理路径解析与写入，避免在 setup/commands/session/Agent 等处重复实现。
 */
export function applyPersona(personaName: string): boolean {
  const dataDir = process.env.COGITO_USER_DATA_DIR || process.cwd();
  const personaPath = path.resolve(process.cwd(), 'personas', personaName, 'persona.md');
  const targetPath = path.resolve(dataDir, 'persona.md');

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
