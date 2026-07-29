import os from 'os';
import path from 'path';
import { loadConfig } from '../../config.ts';

function getBasePath(): string {
  const cfg: any = loadConfig();
  return cfg.workspace || os.homedir();
}

function resolveInWorkspace(targetPath: string): string | null {
  const basePath = getBasePath();
  const resolvedBase = path.resolve(basePath);

  const fullPath = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(resolvedBase, targetPath);

  // 必须使用路径分隔符边界校验，避免兄弟目录前缀绕过：
  // 若仅用 startsWith，resolvedBase=/proj 会放行 /proj-evil。
  // 此处要求 fullPath 等于 resolvedBase，或以 resolvedBase+sep 开头。
  const baseLower = resolvedBase.toLowerCase();
  const fullLower = fullPath.toLowerCase();
  if (fullLower !== baseLower && !fullLower.startsWith(baseLower + path.sep.toLowerCase())) {
    return null;
  }

  return fullPath;
}

export { getBasePath, resolveInWorkspace };
