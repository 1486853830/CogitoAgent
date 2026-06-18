import fs from 'fs/promises';
import path from 'path';

const MEMORY_FILE = path.resolve(process.cwd(), 'data', 'memory.json');

let memories = [];

/**
 * 加载记忆数据
 */
async function loadMemory() {
  try {
    if (await fs.access(MEMORY_FILE).then(() => true).catch(() => false)) {
      const data = await fs.readFile(MEMORY_FILE, 'utf-8');
      memories = JSON.parse(data);
    }
  } catch (e) {
    console.error(`[记忆] 加载失败: ${e.message}`);
    memories = [];
  }
}

/**
 * 保存记忆数据
 * @returns {Promise<boolean>} 保存是否成功
 * @throws 当保存失败时抛出错误
 */
async function saveMemory() {
  const dir = path.dirname(MEMORY_FILE);
  try {
    if (!(await fs.access(dir).then(() => true).catch(() => false))) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf-8');
    return true;
  } catch (e) {
    const error = new Error(`[记忆] 保存失败: ${e.message}`);
    error.code = 'MEMORY_SAVE_FAILED';
    console.error(error.message);
    throw error;  // 重新抛出错误，让调用者知道保存失败
  }
}

/**
 * 添加记忆
 */
async function addMemory(content, tags = [], category = 'general') {
  await loadMemory();
  
  // 参数验证和转换
  const processedTags = Array.isArray(tags) ? tags : [];
  
  const memory = {
    id: Date.now(),
    content,
    tags: processedTags.map(t => String(t).toLowerCase()),
    category: String(category).toLowerCase(),
    createdAt: new Date().toISOString(),
    accessedAt: new Date().toISOString(),
    accessCount: 0
  };
  
  memories.push(memory);
  await saveMemory();
  
  return {
    success: true,
    data: memory
  };
}

/**
 * 搜索记忆
 */
async function searchMemory(query, limit = 10) {
  await loadMemory();
  
  const queryLower = query.toLowerCase();
  
  const results = memories
    .map(memory => {
      let score = 0;
      
      if (memory.content.toLowerCase().includes(queryLower)) {
        score += 10;
      }
      
      memory.tags.forEach(tag => {
        if (tag.includes(queryLower)) {
          score += 5;
        }
      });
      
      if (memory.category.toLowerCase().includes(queryLower)) {
        score += 3;
      }
      
      return { ...memory, score };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  results.forEach(r => {
    const idx = memories.findIndex(m => m.id === r.id);
    if (idx !== -1) {
      memories[idx].accessCount++;
      memories[idx].accessedAt = new Date().toISOString();
    }
  });
  
  await saveMemory();
  
  return {
    success: true,
    data: results
  };
}

/**
 * 获取所有记忆
 */
async function getAllMemories(category = null) {
  await loadMemory();
  
  let filtered = memories;
  if (category) {
    filtered = filtered.filter(m => m.category === category.toLowerCase());
  }
  
  return {
    success: true,
    data: filtered
  };
}

/**
 * 获取记忆详情
 */
async function getMemory(id) {
  await loadMemory();
  
  const memory = memories.find(m => m.id === parseInt(id));
  if (!memory) {
    return {
      success: false,
      error: `记忆不存在: ${id}`
    };
  }
  
  memory.accessCount++;
  memory.accessedAt = new Date().toISOString();
  await saveMemory();
  
  return {
    success: true,
    data: memory
  };
}

/**
 * 更新记忆
 */
async function updateMemory(id, updates) {
  await loadMemory();
  
  const memory = memories.find(m => m.id === parseInt(id));
  if (!memory) {
    return {
      success: false,
      error: `记忆不存在: ${id}`
    };
  }
  
  if (updates.content !== undefined) memory.content = updates.content;
  if (updates.tags !== undefined) memory.tags = updates.tags.map(t => t.toLowerCase());
  if (updates.category !== undefined) memory.category = updates.category.toLowerCase();
  memory.accessedAt = new Date().toISOString();
  
  await saveMemory();
  
  return {
    success: true,
    data: memory
  };
}

/**
 * 删除记忆
 */
async function deleteMemory(id) {
  await loadMemory();
  
  const index = memories.findIndex(m => m.id === parseInt(id));
  if (index === -1) {
    return {
      success: false,
      error: `记忆不存在: ${id}`
    };
  }
  
  const memory = memories[index];
  memories.splice(index, 1);
  await saveMemory();
  
  return {
    success: true,
    data: `记忆已删除`
  };
}

/**
 * 获取记忆统计
 */
async function getMemoryStats() {
  await loadMemory();
  
  const stats = {
    total: memories.length,
    byCategory: {},
    topTags: {},
    mostAccessed: memories
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5)
  };
  
  memories.forEach(memory => {
    stats.byCategory[memory.category] = (stats.byCategory[memory.category] || 0) + 1;
    
    memory.tags.forEach(tag => {
      stats.topTags[tag] = (stats.topTags[tag] || 0) + 1;
    });
  });
  
  const sortedTags = Object.entries(stats.topTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  stats.topTags = Object.fromEntries(sortedTags);
  
  return {
    success: true,
    data: stats
  };
}

/**
 * 获取相关记忆（根据标签关联）
 */
async function getRelatedMemories(id, limit = 5) {
  await loadMemory();
  
  const memory = memories.find(m => m.id === parseInt(id));
  if (!memory) {
    return {
      success: false,
      error: `记忆不存在: ${id}`
    };
  }
  
  const related = memories
    .filter(m => m.id !== parseInt(id))
    .map(m => {
      let score = 0;
      memory.tags.forEach(tag => {
        if (m.tags.includes(tag)) {
          score++;
        }
      });
      if (m.category === memory.category) {
        score += 2;
      }
      return { ...m, score };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return {
    success: true,
    data: related
  };
}

/**
 * 清空所有记忆
 */
async function clearMemory() {
  memories = [];
  await saveMemory();
  
  return {
    success: true,
    data: '所有记忆已清空'
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
  clearMemory
};