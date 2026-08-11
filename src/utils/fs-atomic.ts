/**
 * 原子文件写入工具：先写同目录临时文件并 fsync，再 rename 覆盖目标。
 *
 * rename 在同一文件系统内是原子操作，因此进程在任意时刻崩溃，
 * 目标文件要么是旧内容、要么是新内容，绝不会是写了一半的坏数据。
 * 直接 writeFileSync 覆盖会在中断时留下截断文件，导致下次加载解析失败。
 */

import {
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname } from 'path';
import { randomBytes } from 'crypto';

/**
 * 原子写入文件。
 * @param filePath 目标文件路径
 * @param content  要写入的内容
 * @throws 写入失败时抛出原始异常，清理临时文件后传播
 */
export function writeFileAtomic(filePath: string, content: string): void {
  // 将临时文件放在目标文件同目录下，确保 rename 在同一文件系统内（原子性）
  const dir = dirname(filePath);
  const tmpPath = `${dir}/.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(tmpPath, 'w', 0o600);
    writeSync(fd, content, null, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    // 同目录 rename 保证原子性（同一文件系统内）
    renameSync(tmpPath, filePath);
  } catch (e) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* 关闭失败不掩盖原始错误 */
      }
    }
    // rename 失败（如跨文件系统 EXDEV），回退到读+写+删除临时文件。
    // S9: 仅在临时文件完整时回退，避免把写了一半的坏数据覆盖到目标；
    // 若临时文件已损坏（字节数不符）则清理后直接抛出原始错误。
    if (existsSync(tmpPath)) {
      try {
        const data = readFileSync(tmpPath);
        if (data.length === Buffer.byteLength(content)) {
          writeFileSync(filePath, data, 'utf-8');
          unlinkSync(tmpPath);
          return;
        }
      } catch {
        // 回退读取失败，落到下方清理 + 抛出原始错误
      }
    }
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      /* 临时文件清理失败不影响错误传播 */
    }
    throw e;
  }
}
