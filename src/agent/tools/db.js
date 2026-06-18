import sqlite3 from 'sqlite3';
import { loadConfig } from '../../config.js';

let db = null;

/**
 * 获取数据库连接
 */
function getDB() {
  if (db) return db;
  
  const cfg = loadConfig();
  const dbPath = cfg.database?.path || './data/example.db';
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error(`[数据库] 连接失败: ${err.message}`);
    } else {
      console.error('[数据库] 连接成功');
    }
  });
  
  return db;
}

/**
 * 执行 SQL 查询
 */
async function executeSQL(sql, params = []) {
  return new Promise((resolve) => {
    const database = getDB();
    
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      database.all(sql, params, (err, rows) => {
        if (err) {
          resolve({
            success: false,
            error: `SQL 执行失败: ${err.message}`
          });
        } else {
          resolve({
            success: true,
            data: rows
          });
        }
      });
    } else {
      database.run(sql, params, function(err) {
        if (err) {
          resolve({
            success: false,
            error: `SQL 执行失败: ${err.message}`
          });
        } else {
          resolve({
            success: true,
            data: {
              changes: this.changes,
              lastID: this.lastID
            }
          });
        }
      });
    }
  });
}

/**
 * 查询数据
 */
async function query(table, conditions = {}, options = {}) {
  let sql = `SELECT * FROM ${table}`;
  const params = [];
  
  if (Object.keys(conditions).length > 0) {
    const whereClauses = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (Array.isArray(value)) {
        whereClauses.push(`${key} IN (${value.map(() => '?').join(',')})`);
        params.push(...value);
      } else {
        whereClauses.push(`${key} = ?`);
        params.push(value);
      }
    }
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }
  
  if (options.limit) {
    sql += ` LIMIT ${options.limit}`;
  }
  
  if (options.offset) {
    sql += ` OFFSET ${options.offset}`;
  }
  
  if (options.orderBy) {
    sql += ` ORDER BY ${options.orderBy}`;
  }
  
  return await executeSQL(sql, params);
}

/**
 * 插入数据
 */
async function insert(table, data) {
  const keys = Object.keys(data);
  const values = keys.map(key => data[key]);
  const placeholders = keys.map(() => '?').join(',');
  
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
  
  return await executeSQL(sql, values);
}

/**
 * 更新数据
 */
async function update(table, data, conditions) {
  const setClauses = Object.keys(data).map(key => `${key} = ?`);
  const values = Object.values(data);
  
  const whereClauses = [];
  for (const [key, value] of Object.entries(conditions)) {
    whereClauses.push(`${key} = ?`);
    values.push(value);
  }
  
  const sql = `UPDATE ${table} SET ${setClauses.join(',')} WHERE ${whereClauses.join(' AND ')}`;
  
  return await executeSQL(sql, values);
}

/**
 * 删除数据
 */
async function deleteData(table, conditions) {
  const whereClauses = [];
  const params = [];
  
  for (const [key, value] of Object.entries(conditions)) {
    whereClauses.push(`${key} = ?`);
    params.push(value);
  }
  
  const sql = `DELETE FROM ${table} WHERE ${whereClauses.join(' AND ')}`;
  
  return await executeSQL(sql, params);
}

/**
 * 创建表
 */
async function createTable(name, columns) {
  const columnDefinitions = columns.map(col => {
    let def = `${col.name} ${col.type}`;
    if (col.primaryKey) def += ' PRIMARY KEY';
    if (col.autoIncrement) def += ' AUTOINCREMENT';
    if (col.notNull) def += ' NOT NULL';
    if (col.unique) def += ' UNIQUE';
    if (col.default !== undefined) def += ` DEFAULT ${col.default}`;
    return def;
  }).join(',');
  
  const sql = `CREATE TABLE IF NOT EXISTS ${name} (${columnDefinitions})`;
  
  return await executeSQL(sql);
}

/**
 * 删除表
 */
async function dropTable(name) {
  const sql = `DROP TABLE IF EXISTS ${name}`;
  return await executeSQL(sql);
}

/**
 * 获取表列表
 */
async function getTables() {
  const sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
  const result = await executeSQL(sql);
  
  if (result.success) {
    result.data = result.data.map(row => row.name);
  }
  
  return result;
}

/**
 * 获取表结构
 */
async function getTableSchema(tableName) {
  const sql = `PRAGMA table_info(${tableName})`;
  return await executeSQL(sql);
}

/**
 * 执行事务
 */
async function executeTransaction(sqlStatements) {
  return new Promise((resolve) => {
    const database = getDB();
    
    database.serialize(() => {
      database.run('BEGIN TRANSACTION');
      
      let error = null;
      let completed = 0;
      
      for (const sql of sqlStatements) {
        database.run(sql, (err) => {
          if (err && !error) {
            error = err;
            database.run('ROLLBACK');
            resolve({
              success: false,
              error: `事务失败: ${err.message}`
            });
          }
          
          completed++;
          if (completed === sqlStatements.length && !error) {
            database.run('COMMIT', () => {
              resolve({
                success: true,
                data: '事务执行成功'
              });
            });
          }
        });
      }
    });
  });
}

/**
 * 关闭数据库连接
 */
function closeDB() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error(`[数据库] 关闭失败: ${err.message}`);
      } else {
        console.error('[数据库] 已关闭');
      }
    });
    db = null;
  }
}

export {
  executeSQL,
  query,
  insert,
  update,
  deleteData,
  createTable,
  dropTable,
  getTables,
  getTableSchema,
  executeTransaction,
  closeDB
};