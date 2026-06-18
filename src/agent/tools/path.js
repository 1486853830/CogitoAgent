import os from 'os';
import { loadConfig } from '../../config.js';

/**
 * 获取工作区根路径
 */
function getBasePath() {
  const cfg = loadConfig();
  return cfg.workspace || os.homedir();
}

export { getBasePath };
