/**
 * 代码执行共享工具
 *
 * 此前 sandbox.ts 与 code.ts 各自维护了一份近乎逐行重复的实现
 * （getCodeLimits / generateSecureTmpPath / writeSecureTmpFile / cleanupTmpFile），
 * 且签名已开始分化（writeSecureTmpFile 返回类型不一致），维护分叉。
 * 统一抽取到此模块，两端共用同一份实现。
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { loadConfig } from '../../config.ts';

interface CodeLimits {
  maxExecutionTime: number;
  maxOutputSize: number;
}

/**
 * 从配置读取代码执行限制（按需调用，避免缓存过期配置）。
 * 支持 .env 中 COGITO_CODE_TIMEOUT / COGITO_CODE_MAX_OUTPUT 配置。
 */
function getCodeLimits(): CodeLimits {
  const cfg: any = loadConfig();
  return {
    maxExecutionTime: cfg.code?.maxExecutionTime ?? 30000,
    maxOutputSize: cfg.code?.maxOutputSize ?? 100000,
  };
}

/**
 * 生成安全的临时文件路径（随机名 + 时间戳，避免碰撞与预测）
 */
function generateSecureTmpPath(ext: string): string {
  const tmpDir = os.tmpdir();
  const randomName = `cogito_${crypto.randomUUID()}_${Date.now()}`;
  return path.join(tmpDir, `${randomName}.${ext}`);
}

/**
 * 安全写入临时文件：使用 O_EXCL（'wx'）创建，避免覆盖已有文件。
 * 若目标已存在（EEXIST），回退到一个新的随机路径写入。
 * @returns true 表示写入原路径成功；string 表示因碰撞回退到的新路径
 */
async function writeSecureTmpFile(filePath: string, content: string): Promise<boolean | string> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const fd = await fs.open(filePath, 'wx');
    try {
      await fd.writeFile(content, 'utf8');
    } finally {
      await fd.close();
    }
    return true;
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      const newPath = generateSecureTmpPath(path.extname(filePath).slice(1) || 'tmp');
      await fs.writeFile(newPath, content, 'utf8');
      return newPath;
    }
    throw error;
  }
}

/**
 * 清理临时文件（忽略不存在等错误）
 */
async function cleanupTmpFile(tmpPath: string | null): Promise<void> {
  if (tmpPath) {
    try {
      await fs.unlink(tmpPath);
    } catch {}
  }
}

export { getCodeLimits, generateSecureTmpPath, writeSecureTmpFile, cleanupTmpFile };
