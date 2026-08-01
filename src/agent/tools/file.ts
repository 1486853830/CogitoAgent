import fs from 'fs/promises';
import path from 'path';
import { resolveInWorkspace } from './path.ts';

const BINARY_EXTENSIONS = new Set([
  '.pdf',
  '.ppt',
  '.pptx',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.mp4',
  '.avi',
  '.mkv',
  '.mov',
  '.wmv',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.db',
  '.sqlite',
  '.mdb',
]);

function isBinaryFile(ext: string, buffer: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(ext.toLowerCase())) return true;
  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

async function ls(
  targetPath: string,
): Promise<{
  success: boolean;
  data?: { name: string; type: string; path: string }[];
  error?: string;
}> {
  const fullPath = resolveInWorkspace(targetPath);
  if (!fullPath) {
    return { success: false, error: '路径超出工作区范围' };
  }
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const result = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      path: path.join(fullPath, entry.name),
    }));
    return { success: true, data: result };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

async function read(
  targetPath: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const fullPath = resolveInWorkspace(targetPath);
  if (!fullPath) {
    return { success: false, error: '路径超出工作区范围' };
  }
  try {
    const ext = path.extname(fullPath);
    const buffer = await fs.readFile(fullPath);

    if (isBinaryFile(ext, buffer)) {
      return {
        success: true,
        data: `[这是一个二进制文件 (${(buffer.length / 1024).toFixed(1)} KB)，无法显示文本内容]`,
      };
    }

    const content = buffer.toString('utf-8');
    const truncated =
      content.length > 50000
        ? content.substring(0, 50000) +
          `\n\n[内容过长，已截断...剩余 ${content.length - 50000} 字符]`
        : content;
    return { success: true, data: truncated };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

async function copy(
  src: string,
  dest: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const fullSrc = resolveInWorkspace(src);
  const fullDest = resolveInWorkspace(dest);
  if (!fullSrc || !fullDest) {
    return { success: false, error: '路径超出工作区范围' };
  }
  try {
    await fs.copyFile(fullSrc, fullDest);
    return { success: true, data: `已复制到: ${fullDest}` };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

async function mkdir(
  targetPath: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const fullPath = resolveInWorkspace(targetPath);
  if (!fullPath) {
    return { success: false, error: '路径超出工作区范围' };
  }
  try {
    await fs.mkdir(fullPath, { recursive: true });
    return { success: true, data: `已创建目录: ${fullPath}` };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

async function create(
  targetPath: string,
  content: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  const fullPath = resolveInWorkspace(targetPath);
  if (!fullPath) {
    return { success: false, error: '路径超出工作区范围' };
  }
  try {
    const dir = path.dirname(fullPath);
    if (dir.length > 0) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(fullPath, content, 'utf-8');
    return { success: true, data: `已创建: ${fullPath}` };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

export { ls, read, copy, mkdir, create };
