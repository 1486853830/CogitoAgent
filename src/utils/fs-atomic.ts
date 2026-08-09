/**
 * 原子文件写入工具：先写同目录临时文件并 fsync，再 rename 覆盖目标。
 *
 * rename 在同一文件系统内是原子操作，因此进程在任意时刻崩溃，
 * 目标文件要么是旧内容、要么是新内容，绝不会是写了一半的坏数据。
 * 直接 writeFileSync 覆盖会在中断时留下截断文件，导致下次加载解析失败。
 */

import { openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

/**
 * 原子写入文件。
 * @param filePath 目标文件路径
 * @param content  要写入的内容
 * @throws 写入失败时抛出原始异常，清理临时文件后传播
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(tmpPath, 'w', 0o600);
    writeSync(fd, content, null, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmpPath, filePath);
  } catch (e) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // 关闭失败不掩盖原始错误
      }
    }
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // 临时文件清理失败不影响错误传播
    }
    throw e;
  }
}
