import os from 'os';
import { loadConfig } from '../../config.ts';

/**
 * 获取工作区根路径
 */
function getBasePath(): string {
  const cfg: any = loadConfig();
  return cfg.workspace || os.homedir();
}

export { getBasePath };
