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

  afterEach(() => {
    // 清理数据库连接
    if (dbModule.closeDB) {
      dbModule.closeDB();
    }
  });

  describe('executeSQL', () => {
    it('应该正确执行简单的 SELECT 语句', async () => {
      // 初始化测试数据库
      await dbModule.executeSQL(`
        CREATE TABLE IF NOT EXISTS test_users (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT
        )
      `, []);

      // 插入测试数据
      await dbModule.executeSQL(
        'INSERT INTO test_users (name, email) VALUES (?, ?)',
        ['张三', 'zhangsan@example.com']
      );

      // 查询数据
      const result = await dbModule.executeSQL(
        'SELECT * FROM test_users WHERE name = ?',
        ['张三']
      );

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].name).toBe('张三');
    });

    it('应该正确处理 INSERT 操作', async () => {
      const result = await dbModule.executeSQL(
        'INSERT INTO test_users (name, email) VALUES (?, ?)',
        ['李四', 'lisi@example.com']
      );

      expect(result.success).toBe(true);
    });

    it('应该正确处理 UPDATE 操作', async () => {
      // 先插入
      await dbModule.executeSQL(
        'INSERT INTO test_users (name, email) VALUES (?, ?)',
        ['王五', 'wangwu@example.com']
      );

      // 再更新
      const result = await dbModule.executeSQL(
        'UPDATE test_users SET email = ? WHERE name = ?',
        ['new@example.com', '王五']
      );

      expect(result.success).toBe(true);
    });

    it('应该正确处理 DELETE 操作', async () => {
      // 先插入
      await dbModule.executeSQL(
        'INSERT INTO test_users (name, email) VALUES (?, ?)',
        ['赵六', 'zhaoliu@example.com']
      );

      // 再删除
      const result = await dbModule.executeSQL(
        'DELETE FROM test_users WHERE name = ?',
        ['赵六']
      );

      expect(result.success).toBe(true);
    });

    it('应该处理 SQL 错误', async () => {
      const result = await dbModule.executeSQL(
        'SELECT * FROM nonexistent_table',
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('query', () => {
    it('应该正确使用高级查询接口', async () => {
      const result = await dbModule.query(
        'test_users',
        { name: '张三' },
        { limit: 10 }
      );

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('insert', () => {
    it('应该正确使用高级插入接口', async () => {
      const result = await dbModule.insert(
        'test_users',
        { name: '孙七', email: 'sunqi@example.com' }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('update', () => {
    it('应该正确使用高级更新接口', async () => {
      const result = await dbModule.update(
        'test_users',
        { email: 'updated@example.com' },
        { name: '孙七' }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('createTable', () => {
    it('应该正确创建新表', async () => {
      const result = await dbModule.createTable(
        'test_products',
        {
          id: 'INTEGER PRIMARY KEY',
          name: 'TEXT NOT NULL',
          price: 'REAL'
        }
      );

      expect(result.success).toBe(true);

      // 验证表已创建
      const tables = await dbModule.getTables();
      expect(tables.data).toContain('test_products');
    });
  });

  describe('getTables', () => {
    it('应该返回所有表列表', async () => {
      const result = await dbModule.getTables();

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toContain('test_users');
    });
  });

  describe('getTableSchema', () => {
    it('应该返回表的结构信息', async () => {
      const result = await dbModule.getTableSchema('test_users');

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('dropTable', () => {
    it('应该正确删除表', async () => {
      // 先创建表
      await dbModule.createTable(
        'test_temp',
        { id: 'INTEGER PRIMARY KEY' }
      );

      // 再删除
      const result = await dbModule.dropTable('test_temp');

      expect(result.success).toBe(true);
    });
  });

  describe('事务处理', () => {
    it('应该正确执行事务', async () => {
      const result = await dbModule.executeTransaction([
        {
          sql: 'INSERT INTO test_users (name, email) VALUES (?, ?)',
          params: ['周八', 'zhouba@example.com']
        },
        {
          sql: 'INSERT INTO test_users (name, email) VALUES (?, ?)',
          params: ['吴九', 'wujiu@example.com']
        }
      ]);

      expect(result.success).toBe(true);
    });

    it('事务失败应该回滚', async () => {
      const result = await dbModule.executeTransaction([
        {
          sql: 'INSERT INTO test_users (name, email) VALUES (?, ?)',
          params: ['郑十', 'zhengshi@example.com']
        },
        {
          sql: 'INVALID SQL',
          params: []
        }
      ]);

      expect(result.success).toBe(false);
    });
  });
});
