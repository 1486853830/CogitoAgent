import initSqlJs from 'sql.js';
import { loadConfig } from '../../config.ts';
import fs from 'fs/promises';
import path from 'path';

let db: any = null;
let SQL: any = null;

const DANGEROUS_STATEMENTS = [
  'DROP TABLE',
  'DROP INDEX',
  'DROP VIEW',
  'ALTER TABLE',
  'TRUNCATE TABLE',
  'ATTACH DATABASE',
  'DETACH DATABASE',
  'VACUUM',
];

function isDangerousSQL(sql: string): boolean {
  const upperSql = sql.trim().toUpperCase();
  return DANGEROUS_STATEMENTS.some((stmt) => upperSql.startsWith(stmt));
}

/**
 * 校验单条 SQL 是否包含危险语句。
 * 注意：sql.js 的 Database.run 底层基于 sqlite3_exec，支持分号分隔的多语句执行，
 * 因此不能只看整段字符串开头（'SELECT 1; DROP TABLE users' 会以 SELECT 开头绕过）。
 * 这里按分号拆分后对每条非空语句分别校验。
 */
function containsDangerousStatement(sql: string): boolean {
  const statements = sql.split(';');
  for (const raw of statements) {
    const s = raw.trim();
    if (!s) continue;
    if (isDangerousSQL(s)) return true;
  }
  return false;
}

/**
 * 列类型白名单校验。
 * SQLite 是动态类型，但列定义中的类型字符串若直接拼接进 DDL 会构成 SQL 注入
 * （如 type:"INTEGER); DROP TABLE users; --"）。此处只允许已知类型名 + 可选长度。
 */
const COLUMN_TYPE_PATTERN =
  /^(INTEGER|INT|REAL|TEXT|BLOB|NUMERIC|BOOLEAN|DATETIME|DATE|TIME|VARCHAR|CHAR|FLOAT|DOUBLE|DECIMAL)(\(\d+\))?$/i;

function validateColumnType(type: any): boolean {
  if (typeof type !== 'string') return false;
  return COLUMN_TYPE_PATTERN.test(type.trim());
}

/**
 * 列默认值校验。默认值会直接拼接进 DDL（DEFAULT <value>），必须严格限定：
 *  - 数字字面量
 *  - 布尔（转 0/1）
 *  - SQL 常量（NULL/TRUE/FALSE/CURRENT_TIMESTAMP 等）
 *  - 单引号字符串字面量（内部仅允许 '' 转义引号，禁止 ) ; 等破坏结构）
 * 返回可直接拼接的安全字符串，不合法返回 null。
 */
function validateColumnDefault(val: any): string | null {
  if (typeof val === 'number') {
    return isFinite(val) ? String(val) : null;
  }
  if (typeof val === 'boolean') {
    return val ? '1' : '0';
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '') return null;
    if (/^(NULL|TRUE|FALSE|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)$/i.test(s)) {
      return s.toUpperCase();
    }
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      return s;
    }
    // 单引号字符串字面量：内部仅允许 '' 作为转义引号，禁止其他可能破坏 DDL 的字符
    if (/^'([^']|'')*'$/i.test(s) && !/[;)]/.test(s)) {
      return s;
    }
    return null;
  }
  return null;
}

async function initSQL(): Promise<any> {
  if (SQL) return SQL;
  try {
    const modulePath = path.join(process.cwd(), 'src', 'agent', 'tools', 'db.ts');
    const sqlJsDir = path.dirname(modulePath).replace(/\\/g, '/');
    SQL = await initSqlJs({
      locateFile: (file: string) => `file://${sqlJsDir}/../../../node_modules/sql.js/dist/${file}`,
    });
  } catch {
    SQL = await initSqlJs();
  }
  return SQL;
}

async function getDB(): Promise<any> {
  if (db) return db;

  const cfg: any = loadConfig();
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
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[数据库] 连接失败: ${err.message}`);
    }
    throw err;
  }

  return db;
}

async function saveDB(): Promise<void> {
  if (!db) return;

  const cfg: any = loadConfig();
  const dbPath = cfg.database?.path || './data/store/example.db';

  try {
    const data = db.export();
    await fs.writeFile(dbPath, Buffer.from(data));
  } catch (err: any) {
    console.error(`[数据库] 保存失败: ${err.message}`);
  }
}

async function executeSQL(sql: string, params: any[] = []): Promise<any> {
  // 与 executeTransaction 保持一致：用 containsDangerousStatement 而非 isDangerousSQL，
  // 防止 'SELECT 1; DROP TABLE users' 这类多语句绕过（sql.js 底层 sqlite3_exec 支持分号多语句）。
  if (containsDangerousStatement(sql)) {
    return {
      success: false,
      error:
        '不允许执行危险的 SQL 语句，请使用专用方法（query/insert/update/delete/createTable/dropTable）',
    };
  }

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
        data: results,
      };
    } else {
      await saveDB();
      return {
        success: true,
        data: {
          changes: changes,
          lastID: database.lastInsertRowid ? database.lastInsertRowid() : null,
        },
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`,
    };
  }
}

function validateIdentifier(name: any): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

async function query(table: string, conditions: any = {}, options: any = {}): Promise<any> {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名',
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
          error: '无效的列名',
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
    const limit = parseInt(options.limit, 10);
    if (isNaN(limit) || limit < 0) {
      return {
        success: false,
        error: '无效的 limit 值',
      };
    }
    sql += ` LIMIT ${limit}`;
  }

  if (options.offset) {
    const offset = parseInt(options.offset, 10);
    if (isNaN(offset) || offset < 0) {
      return {
        success: false,
        error: '无效的 offset 值',
      };
    }
    sql += ` OFFSET ${offset}`;
  }

  if (options.orderBy) {
    const orderParts = options.orderBy.split(',').map((p: string) => p.trim());
    const validParts = [];
    for (const part of orderParts) {
      const [col, dir] = part.split(/\s+/);
      if (!validateIdentifier(col)) {
        return {
          success: false,
          error: '无效的 ORDER BY 列名',
        };
      }
      if (dir && !['ASC', 'DESC'].includes(dir.toUpperCase())) {
        return {
          success: false,
          error: '无效的排序方向',
        };
      }
      validParts.push(dir ? `\`${col}\` ${dir.toUpperCase()}` : `\`${col}\``);
    }
    sql += ' ORDER BY ' + validParts.join(', ');
  }

  return await executeSQL(sql, params);
}

async function insert(table: string, data: any): Promise<any> {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名',
    };
  }

  const keys = Object.keys(data);
  for (const key of keys) {
    if (!validateIdentifier(key)) {
      return {
        success: false,
        error: '无效的列名',
      };
    }
  }

  const values = keys.map((key) => data[key]);
  const placeholders = keys.map(() => '?').join(',');

  const sql = `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${placeholders})`;

  try {
    const database = await getDB();
    const stmt = database.prepare(sql);
    stmt.bind(values);
    while (stmt.step()) {}
    stmt.free();
    const changes = database.getRowsModified();
    await saveDB();
    return {
      success: true,
      data: {
        changes: changes,
        lastID: database.lastInsertRowid ? database.lastInsertRowid() : null,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`,
    };
  }
}

async function update(table: string, data: any, conditions: any): Promise<any> {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名',
    };
  }

  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    if (!validateIdentifier(key)) {
      return {
        success: false,
        error: '无效的列名',
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
        error: '无效的列名',
      };
    }
    whereClauses.push(`\`${key}\` = ?`);
    values.push(value);
  }

  const sql = `UPDATE \`${table}\` SET ${setClauses.join(',')} WHERE ${whereClauses.join(' AND ')}`;

  try {
    const database = await getDB();
    const stmt = database.prepare(sql);
    stmt.bind(values);
    while (stmt.step()) {}
    stmt.free();
    const changes = database.getRowsModified();
    await saveDB();
    return {
      success: true,
      data: {
        changes: changes,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`,
    };
  }
}

async function deleteData(table: string, conditions: any): Promise<any> {
  if (!validateIdentifier(table)) {
    return {
      success: false,
      error: '无效的表名',
    };
  }

  const whereClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(conditions)) {
    if (!validateIdentifier(key)) {
      return {
        success: false,
        error: '无效的列名',
      };
    }
    whereClauses.push(`\`${key}\` = ?`);
    params.push(value);
  }

  const sql = `DELETE FROM \`${table}\` WHERE ${whereClauses.join(' AND ')}`;

  try {
    const database = await getDB();
    const stmt = database.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {}
    stmt.free();
    const changes = database.getRowsModified();
    await saveDB();
    return {
      success: true,
      data: {
        changes: changes,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`,
    };
  }
}

async function createTable(name: string, columns: any[]): Promise<any> {
  if (!validateIdentifier(name)) {
    return {
      success: false,
      error: '无效的表名',
    };
  }

  const columnDefinitions = columns
    .map((col) => {
      if (!validateIdentifier(col.name)) {
        throw new Error('无效的列名');
      }
      // 列类型必须命中白名单，禁止直接拼接任意字符串（防 SQL 注入）
      if (!validateColumnType(col.type)) {
        throw new Error(`无效的列类型: ${col.type}`);
      }
      let def = `\`${col.name}\` ${col.type}`;
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.autoIncrement) def += ' AUTOINCREMENT';
      if (col.notNull) def += ' NOT NULL';
      if (col.unique) def += ' UNIQUE';
      if (col.default !== undefined) {
        // 默认值必须通过校验后才可拼接，避免 DEFAULT 子句注入
        const safeDefault = validateColumnDefault(col.default);
        if (safeDefault === null) {
          throw new Error(`无效的列默认值: ${col.default}`);
        }
        def += ` DEFAULT ${safeDefault}`;
      }
      return def;
    })
    .join(',');

  const sql = `CREATE TABLE IF NOT EXISTS \`${name}\` (${columnDefinitions})`;

  try {
    const database = await getDB();
    database.run(sql);
    await saveDB();
    return { success: true, data: `表 ${name} 创建成功` };
  } catch (err: any) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`,
    };
  }
}

async function dropTable(name: string): Promise<any> {
  if (!validateIdentifier(name)) {
    return {
      success: false,
      error: '无效的表名',
    };
  }

  const sql = `DROP TABLE IF EXISTS \`${name}\``;

  try {
    const database = await getDB();
    database.run(sql);
    await saveDB();
    return { success: true, data: `表 ${name} 删除成功` };
  } catch (err: any) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`,
    };
  }
}

async function getTables(): Promise<any> {
  const sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
  const result = await executeSQL(sql);

  if (result.success) {
    result.data = result.data.map((row: any) => row.name);
  }

  return result;
}

async function getTableSchema(tableName: string): Promise<any> {
  if (!validateIdentifier(tableName)) {
    return {
      success: false,
      error: '无效的表名',
    };
  }

  const sql = `PRAGMA table_info(\`${tableName}\`)`;
  try {
    const database = await getDB();
    const results = [];
    const stmt = database.prepare(sql);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return { success: true, data: results };
  } catch (err: any) {
    return {
      success: false,
      error: `SQL 执行失败: ${err.message}`,
    };
  }
}

/**
 * 事务语句类型。
 * - string：纯 SQL，无参数绑定（保留旧调用方式，向后兼容）
 * - { sql, params? }：推荐形式，params 通过 prepare+bind 参数化绑定，
 *   避免将值拼接进 SQL 字符串造成注入（与 executeSQL/insert/update 等保持一致）。
 */
type TransactionStatement = string | { sql: string; params?: any[] };

function normalizeStatement(stmt: TransactionStatement): { sql: string; params: any[] } {
  if (typeof stmt === 'string') {
    return { sql: stmt, params: [] };
  }
  return { sql: stmt.sql, params: Array.isArray(stmt.params) ? stmt.params : [] };
}

async function executeTransaction(sqlStatements: TransactionStatement[]): Promise<any> {
  const normalized = sqlStatements.map(normalizeStatement);

  for (const { sql } of normalized) {
    // 用 containsDangerousStatement 按分号拆分逐条校验，防止
    // 'SELECT 1; DROP TABLE users' 这类多语句绕过（原 isDangerousSQL
    // 只看整段开头，SELECT 开头即放行）。
    if (containsDangerousStatement(sql)) {
      return {
        success: false,
        error: '事务中不允许执行危险的 SQL 语句',
      };
    }
  }

  try {
    const database = await getDB();

    database.run('BEGIN TRANSACTION');

    for (const { sql, params } of normalized) {
      // 有参数时使用 prepare+bind 参数化执行，避免 SQL 注入；
      // 无参数时沿用 database.run，保持原行为。
      if (params.length > 0) {
        const prepared = database.prepare(sql);
        try {
          prepared.bind(params);
          while (prepared.step()) {}
        } finally {
          prepared.free();
        }
      } else {
        database.run(sql);
      }
    }

    database.run('COMMIT');
    await saveDB();

    return {
      success: true,
      data: '事务执行成功',
    };
  } catch (err: any) {
    try {
      if (db) {
        db.run('ROLLBACK');
      }
    } catch {}
    return {
      success: false,
      error: `事务失败: ${err.message}`,
    };
  }
}

async function closeDB(): Promise<void> {
  if (db) {
    try {
      await saveDB();
      db.close();
      if (process.env.NODE_ENV !== 'test') {
        console.log('[数据库] 已关闭');
      }
    } catch (err: any) {
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
  closeDB,
};
