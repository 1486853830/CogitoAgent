import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Set COGITO_USER_DATA_DIR to a temp directory before importing the storage module,
// so tests use isolated storage rather than the real data directory.
const TMP_DIR = path.join(
  os.tmpdir(),
  `cogito-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
process.env.COGITO_USER_DATA_DIR = TMP_DIR;

import { StorageError, FileStorage, createStorage } from '../../src/agent/tools/storage.ts';

describe('storage tools', () => {
  let storagePath: string;

  beforeEach(() => {
    storagePath = path.join(
      TMP_DIR,
      `storage-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
  });

  afterAll(async () => {
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe('StorageError', () => {
    it('should create an error with message and default code', () => {
      const err = new StorageError('something went wrong');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('something went wrong');
      expect(err.name).toBe('StorageError');
      expect(err.code).toBe('STORAGE_ERROR');
    });

    it('should accept a custom code', () => {
      const err = new StorageError('custom failure', 'CUSTOM_CODE');
      expect(err.code).toBe('CUSTOM_CODE');
    });
  });

  describe('FileStorage', () => {
    describe('constructor', () => {
      it('should set filePath, entityName and default options', () => {
        const s = new FileStorage(storagePath, 'entity');
        expect(s.filePath).toBe(storagePath);
        expect(s.entityName).toBe('entity');
        expect(s.data).toBeNull();
        expect(s.autoSave).toBe(true);
      });

      it('should use default entityName and respect options', () => {
        const s = new FileStorage(storagePath, '', {
          defaultData: { foo: 'bar' },
          autoSave: false,
        });
        expect(s.entityName).toBe('');
        expect(s.data).toEqual({ foo: 'bar' });
        expect(s.autoSave).toBe(false);
      });
    });

    describe('exists', () => {
      it('should return false when file does not exist', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const result = await s.exists();
        expect(result).toBe(false);
      });

      it('should return true after saving', async () => {
        const s = new FileStorage(storagePath, 'entity');
        await s.save({ a: 1 });
        const result = await s.exists();
        expect(result).toBe(true);
      });
    });

    describe('ensureDir', () => {
      it('should create parent directories recursively', async () => {
        const deepPath = path.join(TMP_DIR, `deep-${Date.now()}`, 'nested', 'dir', 'file.json');
        const s = new FileStorage(deepPath, 'entity');
        await s.ensureDir();
        const stat = await fs.stat(path.dirname(deepPath));
        expect(stat.isDirectory()).toBe(true);
      });
    });

    describe('save / load', () => {
      it('should save data and load it back', async () => {
        const s = new FileStorage(storagePath, 'entity');
        await s.save({ hello: 'world' });
        const s2 = new FileStorage(storagePath, 'entity');
        const data = await s2.load();
        expect(data).toEqual({ hello: 'world' });
      });

      it('save should throw StorageError on failure', async () => {
        // 指向一个无法写入的路径（以无效字符触发写入失败）
        const invalidPath = path.join(TMP_DIR, '\x00invalid', 'file.json');
        const s = new FileStorage(invalidPath, 'entity');
        await expect(s.save({ a: 1 })).rejects.toThrow(StorageError);
      });

      it('load should return default data when file does not exist', async () => {
        const s = new FileStorage(storagePath, 'entity', {
          defaultData: { default: true },
        });
        const data = await s.load();
        expect(data).toEqual({ default: true });
      });

      it('load should throw StorageError when content is invalid JSON', async () => {
        await fs.mkdir(path.dirname(storagePath), { recursive: true });
        await fs.writeFile(storagePath, 'not-json', 'utf-8');
        const s = new FileStorage(storagePath, 'entity');
        await expect(s.load()).rejects.toThrow(StorageError);
      });
    });

    describe('getData / setData', () => {
      it('getData should load from disk when data is null', async () => {
        await fs.mkdir(path.dirname(storagePath), { recursive: true });
        await fs.writeFile(storagePath, JSON.stringify({ loaded: true }), 'utf-8');
        const s = new FileStorage(storagePath, 'entity');
        const data = await s.getData();
        expect(data).toEqual({ loaded: true });
      });

      it('getData should return in-memory data when already set', async () => {
        const s = new FileStorage(storagePath, 'entity', {
          defaultData: { cached: 1 },
        });
        const data = await s.getData();
        expect(data).toEqual({ cached: 1 });
      });

      it('setData should save and return the data', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const result = await s.setData({ set: true });
        expect(result).toEqual({ set: true });
        expect(s.data).toEqual({ set: true });

        const s2 = new FileStorage(storagePath, 'entity');
        const loaded = await s2.load();
        expect(loaded).toEqual({ set: true });
      });
    });

    describe('create', () => {
      it('should create an item with auto-generated id', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const item = await s.create({ name: 'item1' });
        expect(item.id).toBeDefined();
        expect(item.name).toBe('item1');

        const list = await s.getData();
        expect(list).toHaveLength(1);
      });

      it('should respect provided id', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const item = await s.create({ id: 100, name: 'item1' });
        expect(item.id).toBe(100);
      });

      it('should append to existing list', async () => {
        const s = new FileStorage(storagePath, 'entity');
        await s.create({ name: 'a' });
        await s.create({ name: 'b' });
        const list = await s.getData();
        expect(list).toHaveLength(2);
      });

      it('should accept a custom idField', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const item = await s.create({ name: 'x' }, 'key');
        expect(item.key).toBeDefined();
      });
    });

    describe('getById', () => {
      it('should return item by numeric id', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const created = await s.create({ name: 'find me' });
        const found = await s.getById(created.id);
        expect(found).not.toBeNull();
        expect(found?.name).toBe('find me');
      });

      it('should return item by string id (parsed)', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const created = await s.create({ name: 'str id' });
        const found = await s.getById(String(created.id));
        expect(found).not.toBeNull();
        expect(found?.name).toBe('str id');
      });

      it('should return null for non-existent id', async () => {
        const s = new FileStorage(storagePath, 'entity');
        await s.create({ name: 'a' });
        const found = await s.getById(99999);
        expect(found).toBeNull();
      });

      it('should return null when data is not an array', async () => {
        const s = new FileStorage(storagePath, 'entity', {
          defaultData: { not: 'array' },
        });
        const found = await s.getById(1);
        expect(found).toBeNull();
      });
    });

    describe('update', () => {
      it('should update an existing item', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const created = await s.create({ name: 'orig', status: 'pending' });
        const updated = await s.update(created.id, { status: 'done' });
        expect(updated).not.toBeNull();
        expect(updated?.name).toBe('orig');
        expect(updated?.status).toBe('done');
      });

      it('should return null for non-existent id', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const result = await s.update(99999, { name: 'x' });
        expect(result).toBeNull();
      });

      it('should accept string id', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const created = await s.create({ name: 'orig' });
        const updated = await s.update(String(created.id), { name: 'new' });
        expect(updated).not.toBeNull();
        expect(updated?.name).toBe('new');
      });
    });

    describe('delete', () => {
      it('should delete an existing item', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const created = await s.create({ name: 'to delete' });
        const result = await s.delete(created.id);
        expect(result).toBe(true);

        const found = await s.getById(created.id);
        expect(found).toBeNull();
      });

      it('should return false for non-existent id', async () => {
        const s = new FileStorage(storagePath, 'entity');
        const result = await s.delete(99999);
        expect(result).toBe(false);
      });
    });

    describe('filter', () => {
      it('should filter items by predicate', async () => {
        const s = new FileStorage(storagePath, 'entity');
        await s.create({ name: 'a', value: 1 });
        await s.create({ name: 'b', value: 2 });
        await s.create({ name: 'c', value: 1 });
        const result = await s.filter((item: any) => item.value === 1);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('a');
        expect(result[1].name).toBe('c');
      });

      it('should return empty array when no items match', async () => {
        const s = new FileStorage(storagePath, 'entity');
        await s.create({ name: 'a' });
        const result = await s.filter((item: any) => item.name === 'zzz');
        expect(result).toEqual([]);
      });

      it('should return empty array when data is not an array', async () => {
        const s = new FileStorage(storagePath, 'entity', {
          defaultData: { not: 'array' },
        });
        const result = await s.filter(() => true);
        expect(result).toEqual([]);
      });
    });

    describe('clear', () => {
      it('should clear all data and save empty array', async () => {
        const s = new FileStorage(storagePath, 'entity');
        await s.create({ name: 'a' });
        await s.create({ name: 'b' });
        await s.clear();
        const list = await s.getData();
        expect(list).toEqual([]);
      });
    });
  });

  describe('createStorage', () => {
    it('should return a FileStorage instance with given path and entityName', () => {
      const s = createStorage(storagePath, 'widget');
      expect(s).toBeInstanceOf(FileStorage);
      expect(s.filePath).toBe(storagePath);
      expect(s.entityName).toBe('widget');
    });

    it('returned instance should be usable for create/getById flow', async () => {
      const s = createStorage(storagePath, 'widget');
      const created = await s.create({ name: 'widget1' });
      const found = await s.getById(created.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('widget1');
    });
  });
});
