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

/**
 * 为二进制文件生成可操作的处理指引：指明该用什么专用工具解析，
 * 而不是只给"无法显示文本"而无处下手。
 */
function buildBinaryHint(ext: string, fullPath: string, size: number): string {
  const base = `[这是一个二进制文件 (${(size / 1024).toFixed(1)} KB)，无法以文本方式读取] `;
  switch (ext.toLowerCase()) {
    case '.xlsx':
    case '.xls':
      return base + `请使用 read_excel("${fullPath}") 读取，返回各工作表（sheet）的二维数组数据。`;
    case '.docx':
    case '.doc':
      return base + `请使用 readWord("${fullPath}") 读取，返回标题、段落和表格。`;
    case '.pptx':
    case '.ppt':
      return base + `请使用 readPpt("${fullPath}") 读取，返回每页幻灯片的段落文本。`;
    case '.pdf':
      return base + `请使用 Python 代码解析（如 PyPDF2/pdfplumber）。`;
    default:
      return (
        base +
        `该扩展名（${ext}）无法被 read 直接解析；若需读取结构（如图片 OCR、PDF/Office 内容），请使用对应专用工具（如 vision/ocr）或 Python 代码解析。`
      );
  }
}

async function ls(targetPath: string): Promise<{
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
    const result = entries.slice(0, 500).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      path: path.join(fullPath, entry.name),
    }));
    if (entries.length > 500) {
      result.push({
        name: `... 其余 ${entries.length - 500} 项省略`,
        type: 'file',
        path: '',
      });
    }
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
        data: buildBinaryHint(ext, fullPath, buffer.length),
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
