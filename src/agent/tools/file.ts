import fs from 'fs/promises';
import path from 'path';
import { getBasePath } from './path.ts';

// 二进制文件扩展名
const BINARY_EXTENSIONS = new Set([
  '.pdf', '.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.mp4', '.avi', '.mkv', '.mov', '.wmv',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.exe', '.dll', '.so', '.dylib',
  '.ttf', '.otf', '.woff', '.woff2',
  '.db', '.sqlite', '.mdb'
]);

function isBinaryFile(ext: string, buffer: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(ext.toLowerCase())) return true;
  // 检查 null 字节（文本文件通常不含 null）
  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * 列出目录内容
 */
async function ls(targetPath: string): Promise<any> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(basePath, targetPath);
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      path: path.join(fullPath, entry.name)
    }));
    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 读取文件内容
 */
async function read(targetPath: string): Promise<any> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(basePath, targetPath);
  try {
    const ext = path.extname(fullPath);
    const buffer = await fs.readFile(fullPath);

    if (isBinaryFile(ext, buffer)) {
      return {
        success: true,
        data: `[这是一个二进制文件 (${(buffer.length / 1024).toFixed(1)} KB)，无法显示文本内容]`
      };
    }

    const content = buffer.toString('utf-8');
    // 限制单次读取大小，避免上下文爆炸
    const truncated = content.length > 50000
      ? content.substring(0, 50000) + `\n\n[内容过长，已截断...剩余 ${content.length - 50000} 字符]`
      : content;
    return { success: true, data: truncated };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 复制文件
 */
async function copy(src: string, dest: string): Promise<any> {
  const basePath = getBasePath();
  const fullSrc = path.isAbsolute(src) ? src : path.join(basePath, src);
  const fullDest = path.isAbsolute(dest) ? dest : path.join(basePath, dest);
  try {
    await fs.copyFile(fullSrc, fullDest);
    return { success: true, data: `已复制到: ${fullDest}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 创建文件夹
 */
async function mkdir(targetPath: string): Promise<any> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(basePath, targetPath);
  try {
    await fs.mkdir(fullPath, { recursive: true });
    return { success: true, data: `已创建目录: ${fullPath}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 创建文件
 */
async function create(targetPath: string, content: string): Promise<any> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(basePath, targetPath);
  try {
    const dir = path.dirname(fullPath);
    // 只有当目录不是根路径时才创建目录
    if (dir.length > basePath.length) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(fullPath, content, 'utf-8');
    return { success: true, data: `已创建: ${fullPath}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export { ls, read, copy, mkdir, create };
