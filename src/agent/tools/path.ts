import os from 'os';
import path from 'path';
import fs from 'fs';
import { loadConfig } from '../../config.ts';

function getBasePath(): string {
  const cfg = loadConfig();
  return cfg.workspace || path.join(os.homedir(), 'cogito-workspace');
}

/**
 * 将目标路径解析到工作区或项目目录内的绝对路径。
 * 使用 fs.realpath 做真实路径（非字符串前缀）校验，防止符号链接逃逸。
 * 合法根目录：配置的 workspace，以及项目根目录（工具本就在项目内运行，
 * 例如 git/文件类工具以 process.cwd() 为基准）。两处均不命中则返回 null（拒绝）。
 */
function resolveInWorkspace(targetPath: string): string | null {
  const basePath = getBasePath();
  const projectRoot = process.cwd();
  const candidates = [
    { base: path.resolve(basePath), real: realPathOrNull(path.resolve(basePath)) },
    { base: path.resolve(projectRoot), real: realPathOrNull(path.resolve(projectRoot)) },
  ];

  const fullPath = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(candidates[0].base, targetPath);

  for (const cand of candidates) {
    if (isWithin(fullPath, cand.base)) {
      // 目标（或其已存在的最深祖先）的 realpath 必须落在同一候选根内，
      // 防止符号链接把文件引到根之外。
      const realFull = realPathClosest(fullPath);
      const realBase = cand.real;
      if (realBase && isWithin(realFull, realBase)) {
        return fullPath;
      }
      // 该根下前缀合法但 realpath 逃逸（符号链接指向外部），继续尝试下一候选根；
      // 若已无候选根则最终返回 null。
    }
  }

  return null;
}

/** 字符串前缀校验（含分隔符边界，避免 /proj-evil 绕过 /proj） */
function isWithin(p: string, base: string): boolean {
  const pLower = p.toLowerCase();
  const baseLower = base.toLowerCase();
  return pLower === baseLower || pLower.startsWith(baseLower + path.sep.toLowerCase());
}

/** realpath 目标根目录；失败（如目录不存在）返回 null */
function realPathOrNull(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * 返回目标路径（或其已存在的最深祖先）的 realpath。
 * 若路径尚不存在，逐级向上找已存在目录做 realpath，避免 TOCTOU 与新建文件场景误拒。
 */
function realPathClosest(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p;
    const realParent = realPathClosest(parent);
    return path.join(realParent, path.basename(p));
  }
}

export { getBasePath, resolveInWorkspace, realPathClosest };
