import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Set COGITO_USER_DATA_DIR to a temp directory before importing the memory module,
// so tests use isolated storage rather than the real data directory.
const TMP_DIR = path.join(os.tmpdir(), `cogito-memory-test-${Date.now()}`);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;

import {
  addMemory,
  searchMemory,
  getAllMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  getMemoryStats,
  clearMemory,
} from '../../src/agent/tools/memory.ts';

describe('memory tools', () => {
  beforeEach(async () => {
    await clearMemory();
  });

  afterAll(async () => {
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('addMemory', () => {
    it('should add a memory with success:true, return memory with id, content, tags, category', async () => {
      const result = await addMemory('Hello world', ['test', 'demo'], 'general');
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(typeof result.data.id).toBe('number');
      expect(result.data.content).toBe('Hello world');
      expect(result.data.tags).toEqual(['test', 'demo']);
      expect(result.data.category).toBe('general');
      expect(result.data.createdAt).toBeDefined();
      expect(result.data.accessedAt).toBeDefined();
      expect(result.data.accessCount).toBe(0);
    });

    it('should parse string tags as comma-separated list', async () => {
      const result = await addMemory('test content', 'not-an-array' as any, 'general');
      expect(result.success).toBe(true);
      expect(result.data.tags).toEqual(['not-an-array']);
    });

    it('should handle empty tags gracefully', async () => {
      const result = await addMemory('test content', '', 'general');
      expect(result.success).toBe(true);
      expect(result.data.tags).toEqual([]);
    });

    it('should lowercase tags and category', async () => {
      const result = await addMemory('Test Content', ['TagOne', 'TagTwo'], 'Category');
      expect(result.data.tags).toEqual(['tagone', 'tagtwo']);
      expect(result.data.category).toBe('category');
    });
  });

  describe('searchMemory', () => {
    it('should find memories by content', async () => {
      await addMemory('The quick brown fox', ['animal'], 'nature');
      const result = await searchMemory('quick');
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].content).toBe('The quick brown fox');
      expect(result.data[0].score).toBeGreaterThanOrEqual(10);
    });

    it('should return empty for no matches', async () => {
      await addMemory('Hello world', ['greeting'], 'general');
      const result = await searchMemory('nonexistent');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await addMemory('common keyword item ' + i, ['tag'], 'general');
      }
      const result = await searchMemory('common', 2);
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });
  });

  describe('getAllMemories', () => {
    it('should return all memories', async () => {
      await addMemory('Memory 1', [], 'general');
      await addMemory('Memory 2', [], 'work');
      const result = await getAllMemories();
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('should filter by category', async () => {
      await addMemory('Memory 1', [], 'general');
      await addMemory('Memory 2', [], 'work');
      await addMemory('Memory 3', [], 'general');
      const result = await getAllMemories('general');
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.data.every((m: any) => m.category === 'general')).toBe(true);
    });
  });

  describe('getMemory', () => {
    it('should return memory by id', async () => {
      const added = await addMemory('Test memory', ['tag'], 'general');
      const result = await getMemory(added.data.id);
      expect(result.success).toBe(true);
      expect(result.data.content).toBe('Test memory');
      expect(result.data.accessCount).toBe(1);
    });

    it('should return error for invalid id', async () => {
      const result = await getMemory('not-a-number');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for non-existent id', async () => {
      const result = await getMemory(999999999);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('updateMemory', () => {
    it('should update memory content', async () => {
      const added = await addMemory('Original content', ['tag'], 'general');
      const result = await updateMemory(added.data.id, { content: 'Updated content' });
      expect(result.success).toBe(true);
      expect(result.data.content).toBe('Updated content');
    });

    it('should return error for non-existent id', async () => {
      const result = await updateMemory(999999999, { content: 'Updated' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('deleteMemory', () => {
    it('should delete memory', async () => {
      const added = await addMemory('To be deleted', [], 'general');
      const result = await deleteMemory(added.data.id);
      expect(result.success).toBe(true);
      const check = await getMemory(added.data.id);
      expect(check.success).toBe(false);
    });

    it('should return error for non-existent id', async () => {
      const result = await deleteMemory(999999999);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getMemoryStats', () => {
    it('should return stats with total, byCategory, topTags', async () => {
      await addMemory('Memory 1', ['tag1', 'tag2'], 'general');
      await addMemory('Memory 2', ['tag1'], 'work');
      const result = await getMemoryStats();
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(2);
      expect(result.data.byCategory).toHaveProperty('general', 1);
      expect(result.data.byCategory).toHaveProperty('work', 1);
      expect(result.data.topTags).toHaveProperty('tag1', 2);
      expect(result.data.topTags).toHaveProperty('tag2', 1);
    });
  });

  describe('clearMemory', () => {
    it('should clear all memories', async () => {
      await addMemory('Memory 1', [], 'general');
      await addMemory('Memory 2', [], 'work');
      const result = await clearMemory();
      expect(result.success).toBe(true);
      const all = await getAllMemories();
      expect(all.data.length).toBe(0);
    });
  });
});
