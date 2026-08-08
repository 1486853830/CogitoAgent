import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
const MEMORY_FILE = path.resolve(DATA_DIR, 'data', 'memory.json');

interface Memory {
  id: number;
  content: string;
  tags: string[];
  category: string;
  createdAt: string;
  accessedAt: string;
  accessCount: number;
}

interface MemorySearchResult extends Memory {
  score: number;
}

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// 单条记忆内容长度上限
const MAX_CONTENT_LENGTH = 20000;
// 记忆总条数上限，超出时淘汰最久未访问的
const MAX_MEMORIES = 2000;
// 单次最多返回的记忆条数
const MAX_RESULTS = 200;

/**
 * 规范化标签参数为字符串数组。
 * 兼容数组、JSON 数组字符串（如 '["a","b"]'）、逗号分隔字符串（如 "a, b"）等 AI 常见传参。
 */
function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof tags === 'string' && tags.trim()) {
    const trimmed = tags.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((t) => String(t).trim()).filter(Boolean);
        }
      } catch {
        // JSON 解析失败则按逗号分隔处理
      }
    }
    return trimmed
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

let memories: Memory[] = [];

/**
 * 记忆条数超限时，淘汰最久未访问的记忆，防止 memory.json 无限膨胀
 */
function limitMemoryCount(): void {
  if (memories.length <= MAX_MEMORIES) return;
  memories.sort((a, b) => {
    const ta = new Date(a.accessedAt).getTime();
    const tb = new Date(b.accessedAt).getTime();
    return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
  });
  memories = memories.slice(-MAX_MEMORIES);
}

/**
 * 安全解析 ID，返回数字或 null（无效时）
 */
function safeParseId(id: unknown): number | null {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return typeof numId === 'number' && !isNaN(numId) ? numId : null;
}

/**
 * 加载记忆数据
 */
async function loadMemory(): Promise<void> {
  try {
    if (
      await fs
        .access(MEMORY_FILE)
        .then(() => true)
        .catch(() => false)
    ) {
      const data = await fs.readFile(MEMORY_FILE, 'utf-8');
      const parsed: unknown = JSON.parse(data);
      memories = Array.isArray(parsed) ? (parsed as Memory[]) : [];
    }
  } catch (e: unknown) {
    console.error(`[记忆] 加载失败: ${e instanceof Error ? e.message : String(e)}`);
    memories = [];
  }
}

/**
 * 保存记忆数据
 * @returns {Promise<boolean>} 保存是否成功
 * @throws 当保存失败时抛出错误
 */
async function saveMemory(): Promise<boolean> {
  const dir = path.dirname(MEMORY_FILE);
  try {
    if (
      !(await fs
        .access(dir)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf-8');
    return true;
  } catch (e: unknown) {
    const error = new Error(`[记忆] 保存失败: ${e instanceof Error ? e.message : String(e)}`);
    (error as Error & { code?: string }).code = 'MEMORY_SAVE_FAILED';
    console.error(error.message);
    throw error; // 重新抛出错误，让调用者知道保存失败
  }
}

/**
 * 添加记忆
 */
async function addMemory(
  content: string,
  tags: unknown[] = [],
  category: string = 'general',
): Promise<ActionResult<Memory>> {
  await loadMemory();

  // 参数验证和转换：兼容数组、JSON 数组字符串、逗号分隔字符串等 AI 常见传参格式
  const processedTags = normalizeTags(tags).slice(0, 50);
  const contentStr = String(content);
  if (contentStr.length > MAX_CONTENT_LENGTH) {
    return {
      success: false,
      error: `记忆内容过长（最多 ${MAX_CONTENT_LENGTH} 字符）`,
    };
  }

  const memory: Memory = {
    id: Date.now(),
    content: contentStr,
    tags: processedTags.map((t) => t.toLowerCase()).map((t) => t.slice(0, 100)),
    category: String(category).toLowerCase(),
    createdAt: new Date().toISOString(),
    accessedAt: new Date().toISOString(),
    accessCount: 0,
  };

  memories.push(memory);
  limitMemoryCount();
  await saveMemory();

  return {
    success: true,
    data: memory,
  };
}

/**
 * 搜索记忆
 */
async function searchMemory(
  query: string,
  limit: number = 10,
): Promise<ActionResult<MemorySearchResult[]>> {
  await loadMemory();

  const queryLower = query.toLowerCase();

  const results: MemorySearchResult[] = memories
    .map((memory) => {
      let score = 0;

      if (memory.content.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      memory.tags.forEach((tag) => {
        if (tag.includes(queryLower)) {
          score += 5;
        }
      });

      if (memory.category.toLowerCase().includes(queryLower)) {
        score += 3;
      }

      return { ...memory, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(limit, 1), MAX_RESULTS));

  results.forEach((r) => {
    const idx = memories.findIndex((m) => m.id === r.id);
    if (idx !== -1) {
      memories[idx].accessCount++;
      memories[idx].accessedAt = new Date().toISOString();
    }
  });

  await saveMemory();

  return {
    success: true,
    data: results,
  };
}

/**
 * 获取所有记忆
 */
async function getAllMemories(category: unknown = null): Promise<ActionResult<Memory[]>> {
  await loadMemory();

  let filtered = memories;
  // 仅当 category 为有效字符串时按分类过滤（AI 可能传数字/对象等异常类型）
  if (typeof category === 'string' && category.trim()) {
    filtered = filtered.filter((m) => m.category === category.trim().toLowerCase());
  }

  return {
    success: true,
    data: filtered.slice(0, MAX_RESULTS),
  };
}

/**
 * 获取记忆详情
 */
async function getMemory(id: unknown): Promise<ActionResult<Memory>> {
  await loadMemory();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const memory = memories.find((m) => m.id === numId);
  if (!memory) {
    return {
      success: false,
      error: `记忆不存在: ${id}`,
    };
  }

  memory.accessCount++;
  memory.accessedAt = new Date().toISOString();
  await saveMemory();

  return {
    success: true,
    data: memory,
  };
}

/**
 * 更新记忆
 */
async function updateMemory(id: unknown, updates: unknown): Promise<ActionResult<Memory>> {
  await loadMemory();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const memory = memories.find((m) => m.id === numId);
  if (!memory) {
    return {
      success: false,
      error: `记忆不存在: ${id}`,
    };
  }

  const patch = (updates && typeof updates === 'object' ? updates : {}) as Record<string, unknown>;

  if (patch.content !== undefined) {
    const contentStr = String(patch.content);
    if (contentStr.length > MAX_CONTENT_LENGTH) {
      return {
        success: false,
        error: `记忆内容过长（最多 ${MAX_CONTENT_LENGTH} 字符）`,
      };
    }
    memory.content = contentStr;
  }
  if (patch.tags !== undefined) {
    const normalized = normalizeTags(patch.tags).slice(0, 50);
    if (normalized.length > 0 || patch.tags === '' || Array.isArray(patch.tags)) {
      memory.tags = normalized.map((t) => t.toLowerCase()).map((t) => t.slice(0, 100));
    }
  }
  if (patch.category !== undefined) memory.category = String(patch.category).toLowerCase();
  memory.accessedAt = new Date().toISOString();

  await saveMemory();

  return {
    success: true,
    data: memory,
  };
}

/**
 * 删除记忆
 */
async function deleteMemory(id: unknown): Promise<ActionResult<string>> {
  await loadMemory();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const index = memories.findIndex((m) => m.id === numId);
  if (index === -1) {
    return {
      success: false,
      error: `记忆不存在: ${id}`,
    };
  }

  memories.splice(index, 1);
  await saveMemory();

  return {
    success: true,
    data: `记忆已删除`,
  };
}

interface MemoryStats {
  total: number;
  byCategory: Record<string, number>;
  topTags: Record<string, number>;
  mostAccessed: Memory[];
}

/**
 * 获取记忆统计
 */
async function getMemoryStats(): Promise<ActionResult<MemoryStats>> {
  await loadMemory();

  const stats: MemoryStats = {
    total: memories.length,
    byCategory: {},
    topTags: {},
    mostAccessed: [...memories].sort((a, b) => b.accessCount - a.accessCount).slice(0, 5),
  };

  memories.forEach((memory) => {
    stats.byCategory[memory.category] = (stats.byCategory[memory.category] || 0) + 1;

    memory.tags.forEach((tag) => {
      stats.topTags[tag] = (stats.topTags[tag] || 0) + 1;
    });
  });

  const sortedTags = Object.entries(stats.topTags)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10);
  stats.topTags = Object.fromEntries(sortedTags);

  return {
    success: true,
    data: stats,
  };
}

/**
 * 获取相关记忆（根据标签关联）
 */
async function getRelatedMemories(
  id: unknown,
  limit: number = 5,
): Promise<ActionResult<MemorySearchResult[]>> {
  await loadMemory();

  const numId = safeParseId(id);
  if (numId === null) {
    return {
      success: false,
      error: `无效的 ID: ${id}`,
    };
  }

  const memory = memories.find((m) => m.id === numId);
  if (!memory) {
    return {
      success: false,
      error: `记忆不存在: ${id}`,
    };
  }

  const related: MemorySearchResult[] = memories
    .filter((m) => m.id !== numId)
    .map((m) => {
      let score = 0;
      memory.tags.forEach((tag) => {
        if (m.tags.includes(tag)) {
          score++;
        }
      });
      if (m.category === memory.category) {
        score += 2;
      }
      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(limit, 1), MAX_RESULTS));

  return {
    success: true,
    data: related,
  };
}

/**
 * 清空所有记忆
 */
async function clearMemory(): Promise<ActionResult<string>> {
  memories = [];
  await saveMemory();

  return {
    success: true,
    data: '所有记忆已清空',
  };
}

export {
  addMemory,
  searchMemory,
  getAllMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  getMemoryStats,
  getRelatedMemories,
  clearMemory,
};
