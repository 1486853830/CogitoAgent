/**
 * 工具模块 - 提供文件操作能力
 */

import fs from 'fs/promises';
import path from 'path';
import { search as webSearch } from '../api/webSearch.js';
import { loadConfig } from '../config.js';

/**
 * 获取工作区根路径
 */
function getBasePath() {
  const cfg = loadConfig();
  return cfg.workspace || 'D:\\';
}

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

function isBinaryFile(ext, buffer) {
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
async function ls(targetPath) {
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
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 读取文件内容
 */
async function read(targetPath) {
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
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 复制文件
 */
async function copy(src, dest) {
  const basePath = getBasePath();
  const fullSrc = path.isAbsolute(src) ? src : path.join(basePath, src);
  const fullDest = path.isAbsolute(dest) ? dest : path.join(basePath, dest);
  try {
    await fs.copyFile(fullSrc, fullDest);
    return { success: true, data: `已复制到: ${fullDest}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 创建文件夹
 */
async function mkdir(targetPath) {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(basePath, targetPath);
  try {
    await fs.mkdir(fullPath, { recursive: true });
    return { success: true, data: `已创建目录: ${fullPath}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 创建文件
 */
async function create(targetPath, content) {
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
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 联网搜索
 * 将搜索结果格式化为可读性强的文本
 */
async function search(query) {
  const result = await webSearch(query);
  if (!result.success) {
    return result;
  }
  // 将结果格式化为纯文本以便智能体理解
  const raw = result.data;
  let summary = `搜索关键词: ${query}\n\n`;
  try {
    if (raw && typeof raw === 'object') {
      const snippets = [];
      // 尝试从常见字段提取标题/摘要
      if (raw.snippets || raw.results || raw.organic_results || raw.web) {
        const list = raw.snippets || raw.results || raw.organic_results || raw.web;
        if (Array.isArray(list)) {
          list.forEach((item, idx) => {
            const title = item.title || item.name || '无标题';
            const url = item.url || item.link || '';
            const content = item.snippet || item.content || item.description || item.text || '';
            snippets.push(`[${idx + 1}] ${title}${url ? ` (${url})` : ''}\n${content}`);
          });
        }
      } else if (raw.answer_text || raw.answer || raw.content) {
        summary += `摘要: ${raw.answer_text || raw.answer || raw.content}`;
      } else if (raw.summary) {
        summary += raw.summary;
      } else {
        // fallback：JSON
        summary += JSON.stringify(raw, null, 2).slice(0, 3000);
      }
      if (snippets.length) {
          summary += snippets.join('\n\n');
        }
      }
    } catch (e) {
      summary += `原始响应:\n` + JSON.stringify(raw, null, 2).slice(0, 3000);
    }
  return { success: true, data: summary };
}

export { ls, read, copy, mkdir, create, search, getBasePath };
