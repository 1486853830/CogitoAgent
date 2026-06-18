/**
 * 数据库模块测试
 */

import { jest } from '@jest/globals';

describe('数据库模块', () => {
  let dbModule;

  beforeEach(async () => {
    jest.resetModules();
    dbModule = await import('../src/agent/tools/db.js');
  });

  afterEach(async () => {
    if (dbModule.closeDB) {
      try {
        await dbModule.closeDB();
      } catch (e) {
        // 忽略关闭错误
      }
    }
  });

  describe('executeSQL', () => {
    it('应该执行有效的 SQL 语句', async () => {
      // 创建测试表
      const createResult = await dbModule.executeSQL(`
        CREATE TABLE IF NOT EXISTS test_items (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          value INTEGER
        )
      `, []);
      expect(createResult.success).toBe(true);

      // 插入数据
      const insertResult = await dbModule.executeSQL(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['测试项', 42]
      );
      expect(insertResult.success).toBe(true);

      // 查询数据
      const selectResult = await dbModule.executeSQL(
        'SELECT * FROM test_items WHERE name = ?',
        ['测试项']
      );
      expect(selectResult.success).toBe(true);
      expect(Array.isArray(selectResult.data)).toBe(true);
    });

    it('应该处理无效 SQL', async () => {
      const result = await dbModule.executeSQL(
        'SELECT * FROM nonexistent_table_xyz',
        []
      );
      expect(result.success).toBe(false);
    });

    it('应该处理 UPDATE 操作', async () => {
      // 先插入
      await dbModule.executeSQL(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['更新项', 10]
      );

      // 再更新
      const result = await dbModule.executeSQL(
        'UPDATE test_items SET value = ? WHERE name = ?',
        [20, '更新项']
      );
      expect(result.success).toBe(true);
    });

    it('应该处理 DELETE 操作', async () => {
      // 先插入
      await dbModule.executeSQL(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        ['删除项', 30]
      );

      // 再删除
      const result = await dbModule.executeSQL(
        'DELETE FROM test_items WHERE name = ?',
        ['删除项']
      );
      expect(result.success).toBe(true);
    });
  });

  describe('getTables', () => {
    it('应该返回表列表', async () => {
      const result = await dbModule.getTables();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toContain('test_items');
    });
  });

  describe('createTable', () => {
    it('应该创建新表', async () => {
      const result = await dbModule.createTable('test_new_table', [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'name', type: 'TEXT', notNull: true }
      ]);
      expect(result.success).toBe(true);

      // 验证表已创建
      const tables = await dbModule.getTables();
      expect(tables.data).toContain('test_new_table');
    });

    it('应该拒绝无效表名', async () => {
      const result = await dbModule.createTable('123invalid', [
        { name: 'id', type: 'INTEGER' }
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe('dropTable', () => {
    it('应该删除表', async () => {
      // 先创建表
      await dbModule.createTable('test_temp_drop', [
        { name: 'id', type: 'INTEGER', primaryKey: true }
      ]);

      // 再删除
      const result = await dbModule.dropTable('test_temp_drop');
      expect(result.success).toBe(true);
    });
  });
});
