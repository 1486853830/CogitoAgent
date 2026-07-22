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

  if (!fullPath.toLowerCase().startsWith(resolvedBase.toLowerCase())) {
    return null;
  }

  return fullPath;
}

export { getBasePath, resolveInWorkspace };
