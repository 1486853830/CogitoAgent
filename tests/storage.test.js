/**
 * FileStorage 模块测试
 */

import { FileStorage } from '../src/agent/tools/storage.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), 'cogito-test');

describe('FileStorage', () => {
  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('基本操作', () => {
    test('应该正确创建存储实例', () => {
      const filePath = path.join(tmpDir, 'test-data.json');
      const storage = new FileStorage(filePath, 'test');
      expect(storage.filePath).toBe(filePath);
      expect(storage.entityName).toBe('test');
    });

    test('应该正确保存和加载数据', async () => {
      const filePath = path.join(tmpDir, 'save-load.json');
      const storage = new FileStorage(filePath, 'test');
      
      const data = { name: 'test', value: 123 };
      await storage.save(data);
      
      const loaded = await storage.load();
      expect(loaded).toEqual(data);
    });

    test('应该正确处理不存在文件', async () => {
      const filePath = path.join(tmpDir, 'non-existent.json');
      const storage = new FileStorage(filePath, 'test', { defaultData: [] });
      
      const data = await storage.getData();
      expect(data).toEqual([]);
    });
  });

  describe('实体操作', () => {
    test('应该正确创建实体', async () => {
      const filePath = path.join(tmpDir, 'entities.json');
      const storage = new FileStorage(filePath, 'entity', { defaultData: [] });
      
      const item = { name: 'item1' };
      const created = await storage.create(item);
      
      expect(created.id).toBeDefined();
      expect(created.name).toBe('item1');
    });

    test('应该正确获取实体', async () => {
      const filePath = path.join(tmpDir, 'get-entity.json');
      const storage = new FileStorage(filePath, 'entity', { defaultData: [] });
      
      const item = { name: 'item2' };
      const created = await storage.create(item);
      
      const found = await storage.getById(created.id);
      expect(found).toEqual(created);
    });

    test('应该正确更新实体', async () => {
      const filePath = path.join(tmpDir, 'update-entity.json');
      const storage = new FileStorage(filePath, 'entity', { defaultData: [] });
      
      const item = { name: 'item3' };
      const created = await storage.create(item);
      
      const updated = await storage.update(created.id, { name: 'updated' });
      expect(updated.name).toBe('updated');
    });

    test('应该正确删除实体', async () => {
      const filePath = path.join(tmpDir, 'delete-entity.json');
      const storage = new FileStorage(filePath, 'entity', { defaultData: [] });
      
      const item = { name: 'item4' };
      const created = await storage.create(item);
      
      const deleted = await storage.delete(created.id);
      expect(deleted).toBe(true);
      
      const found = await storage.getById(created.id);
      expect(found).toBeNull();
    });

    test('应该正确清空数据', async () => {
      const filePath = path.join(tmpDir, 'clear-entity.json');
      const storage = new FileStorage(filePath, 'entity', { defaultData: [] });
      
      await storage.create({ name: 'item5' });
      await storage.create({ name: 'item6' });
      
      await storage.clear();
      
      const data = await storage.getData();
      expect(data).toEqual([]);
    });
  });
});