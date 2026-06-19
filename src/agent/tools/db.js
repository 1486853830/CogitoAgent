import initSqlJs from 'sql.js';
import { loadConfig } from '../../config.js';
import fs from 'fs/promises';
import path from 'path';

let db = null;
let SQL = null;

/**
 * 初始化 SQL.js
 */
async function initSQL() {
  if (SQL) return SQL;
  try {
    const { pathname: modulePath } = new URL(import.meta.url);
    const sqlJsDir = path.dirname(modulePath).replace(/\\/g, '/');
    SQL = await initSqlJs({
      locateFile: file => `file://${sqlJsDir}/../../../node_modules/sql.js/dist/${file}`
    });
  } catch {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * 获取数据库连接
 */
async function getDB() {
  if (db) return db;
  
  const cfg = loadConfig();
  const dbPath = cfg.database?.path || './data/store/example.db';
  
  try {
    await initSQL();
    
    const dbDir = path.dirname(dbPath);
    await fs.mkdir(dbDir, { recursive: true });
    
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(dbPath);
    } catch {
      fileBuffer = null;
    }
    
    if (fileBuffer) {
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
    
    if (process.env.NODE_ENV !== 'test') {
      console.log('[数据库] 连接成功');
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[数据库] 连接失败: ${err.message}`);
    }
    throw err;
  }
  
  return db;
}

/**
 * 保存数据库到文件
 */
async function saveDB() {
  if (!db) return;
  
  const cfg = loadConfig();
  const dbPath = cfg.database?.path || './data/store/example.db';
  
  try {
    const data = db.export();
    await fs.writeFile(dbPath, Buffer.from(data));
  } catch (err) {
    console.error(`[数据库] 保存失败: ${err.message}`);
  }
}

/**
 * 执行 SQL 查询
 */
async function executeSQL(sql, params = []) {
  try {
    const database = await getDB();
    
    const stmt = database.prepare(sql);
    
    if (params.length > 0) {
      stmt.bind(params);
    }
    
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    
    const changes = database.getRowsModified();
    
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return {
        success: true,
        data: results
      };
    } else {
      await saveDB();
      return {
        success: true,
        data: {
          changes: changes,
          lastID: database.lastInsertRowid ? database.lastInsertRowid() : null
        }
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`
    };
  }
}

/**
 * 验证标识符（表名、列名）是否合法
 */
function validateIdentifier(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * 查询数据
 */
async function query(table, conditions = {}, options = {}) {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名'
    };
  }
  
  let sql = `SELECT * FROM \`${table}\``;
  const params = [];
  
  if (Object.keys(conditions).length > 0) {
    const whereClauses = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (!validateIdentifier(key)) {
        return {
          success: false,
          error: '无效的列名'
        };
      }
      if (Array.isArray(value)) {
        whereClauses.push(`\`${key}\` IN (${value.map(() => '?').join(',')})`);
        params.push(...value);
      } else {
        whereClauses.push(`\`${key}\` = ?`);
        params.push(value);
      }
    }
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }
  
  if (options.limit) {
    const limit = parseInt(options.limit);
    if (isNaN(limit) || limit < 0) {
      return {
        success: false,
        error: '无效的 limit 值'
      };
    }
    sql += ` LIMIT ${limit}`;
  }
  
  if (options.offset) {
    const offset = parseInt(options.offset);
    if (isNaN(offset) || offset < 0) {
      return {
        success: false,
        error: '无效的 offset 值'
      };
    }
    sql += ` OFFSET ${offset}`;
  }
  
  if (options.orderBy) {
    const orderParts = options.orderBy.split(',').map(p => p.trim());
    const validParts = [];
    for (const part of orderParts) {
      const [col, dir] = part.split(/\s+/);
      if (!validateIdentifier(col)) {
        return {
          success: false,
          error: '无效的 ORDER BY 列名'
        };
      }
      if (dir && !['ASC', 'DESC'].includes(dir.toUpperCase())) {
        return {
          success: false,
          error: '无效的排序方向'
        };
      }
      validParts.push(dir ? `\`${col}\` ${dir.toUpperCase()}` : `\`${col}\``);
    }
    sql += ' ORDER BY ' + validParts.join(', ');
  }
  
  return await executeSQL(sql, params);
}

/**
 * 插入数据
 */
async function insert(table, data) {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名'
    };
  }
  
  const keys = Object.keys(data);
  for (const key of keys) {
    if (!validateIdentifier(key)) {
      return {
        success: false,
        error: '无效的列名'
      };
    }
  }
  
  const values = keys.map(key => data[key]);
  const placeholders = keys.map(() => '?').join(',');
  
  const sql = `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(',')}) VALUES (${placeholders})`;
  
  return await executeSQL(sql, values);
}

/**
 * 更新数据
 */
async function update(table, data, conditions) {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名'
    };
  }
  
  const setClauses = [];
  const values = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (!validateIdentifier(key)) {
      return {
        success: false,
        error: '无效的列名'
      };
    }
    setClauses.push(`\`${key}\` = ?`);
    values.push(value);
  }
  
  const whereClauses = [];
  for (const [key, value] of Object.entries(conditions)) {
    if (!validateIdentifier(key)) {
      return {
        success: false,
        error: '无效的列名'
      };
    }
    whereClauses.push(`\`${key}\` = ?`);
    values.push(value);
  }
  
  const sql = `UPDATE \`${table}\` SET ${setClauses.join(',')} WHERE ${whereClauses.join(' AND ')}`;
  
  return await executeSQL(sql, values);
}

/**
 * 删除数据
 */
async function deleteData(table, conditions) {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名'
    };
  }
  
  const whereClauses = [];
  const params = [];
  
  for (const [key, value] of Object.entries(conditions)) {
    if (!validateIdentifier(key)) {
      return {
        success: false,
        error: '无效的列名'
      };
    }
    whereClauses.push(`\`${key}\` = ?`);
    params.push(value);
  }
  
  const sql = `DELETE FROM \`${table}\` WHERE ${whereClauses.join(' AND ')}`;
  
  return await executeSQL(sql, params);
}

/**
 * 创建表
 */
async function createTable(name, columns) {
  if (!validateIdentifier(name)) {
    return {
      success: false,
      error: '无效的表名'
    };
  }
  
  const columnDefinitions = columns.map(col => {
    if (!validateIdentifier(col.name)) {
      throw new Error('无效的列名');
    }
    let def = `\`${col.name}\` ${col.type}`;
    if (col.primaryKey) def += ' PRIMARY KEY';
    if (col.autoIncrement) def += ' AUTOINCREMENT';
    if (col.notNull) def += ' NOT NULL';
    if (col.unique) def += ' UNIQUE';
    if (col.default !== undefined) def += ` DEFAULT ${col.default}`;
    return def;
  }).join(',');
  
  const sql = `CREATE TABLE IF NOT EXISTS \`${name}\` (${columnDefinitions})`;
  
  return await executeSQL(sql);
}

/**
 * 删除表
 */
async function dropTable(name) {
  if (!validateIdentifier(name)) {
    return {
      success: false,
      error: '无效的表名'
    };
  }
  
  const sql = `DROP TABLE IF EXISTS \`${name}\``;
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
  if (!validateIdentifier(tableName)) {
    return {
      success: false,
      error: '无效的表名'
    };
  }
  
  const sql = `PRAGMA table_info(\`${tableName}\`)`;
  return await executeSQL(sql);
}

/**
 * 执行事务
 */
async function executeTransaction(sqlStatements) {
  try {
    const database = await getDB();
    
    database.run('BEGIN TRANSACTION');
    
    for (const sql of sqlStatements) {
      database.run(sql);
    }
    
    database.run('COMMIT');
    await saveDB();
    
    return {
      success: true,
      data: '事务执行成功'
    };
  } catch (err) {
    try {
      if (db) {
        db.run('ROLLBACK');
      }
    } catch {
      // 忽略回滚错误
    }
    return {
      success: false,
      error: `事务失败: ${err.message}`
    };
  }
}

/**
 * 关闭数据库连接
 */
async function closeDB() {
  if (db) {
    try {
      await saveDB();
      db.close();
      if (process.env.NODE_ENV !== 'test') {
        console.log('[数据库] 已关闭');
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`[数据库] 关闭失败: ${err.message}`);
      }
    }
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
