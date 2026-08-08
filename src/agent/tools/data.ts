import fs from 'fs/promises';
import path from 'path';
import { resolveInWorkspace } from './path.ts';

/**
 * 数据文件读取上限（16MB）。
 * CSV/JSON 会被整体解析成对象数组，内存占用是原文件的数倍；
 * 无上限时一个大导出文件足以 OOM 掉 Agent 进程。
 */
const MAX_DATA_FILE_BYTES = 16 * 1024 * 1024;
/** 解析后保留的最大行数，避免几百万行 CSV 撑爆内存与后续 JSON 序列化。 */
const MAX_CSV_ROWS = 100000;

/**
 * 校验待读取的数据文件大小，超限时返回错误信息。
 */
async function checkFileSize(resolvedPath: string, label: string): Promise<string | null> {
  const stat = await fs.stat(resolvedPath);
  if (stat.isDirectory()) return `${label} 目标是目录，不是文件`;
  if (stat.size > MAX_DATA_FILE_BYTES) {
    return `${label} 文件过大（${stat.size} 字节），超过 ${MAX_DATA_FILE_BYTES} 字节上限，请先拆分或使用数据库工具`;
  }
  return null;
}

/**
 * 读取 CSV 文件
 */
async function readCSV(filePath: string): Promise<{
  success: boolean;
  data?: { headers: string[]; rows: Record<string, string>[] };
  error?: string;
}> {
  try {
    const resolvedPath = resolveInWorkspace(filePath);
    if (!resolvedPath) {
      return { success: false, error: `路径不在工作区内: ${filePath}` };
    }
    const sizeError = await checkFileSize(resolvedPath, '读取 CSV 失败:');
    if (sizeError) return { success: false, error: sizeError };

    const content = await fs.readFile(resolvedPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length === 0) {
      return {
        success: true,
        data: { headers: [], rows: [] },
      };
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const dataLines = lines.slice(1);
    const truncated = dataLines.length > MAX_CSV_ROWS;
    const rows = (truncated ? dataLines.slice(0, MAX_CSV_ROWS) : dataLines).map((line) => {
      const values = parseCSVLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      return row;
    });

    if (truncated) {
      console.warn(
        `[data] CSV 行数 ${dataLines.length} 超过 ${MAX_CSV_ROWS} 上限，仅返回前 ${MAX_CSV_ROWS} 行`,
      );
    }

    return {
      success: true,
      data: { headers, rows },
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: `读取 CSV 失败: ${(e as Error).message}`,
    };
  }
}

/**
 * 解析 CSV 行（处理引号和逗号）
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"' && inQuotes) {
      inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * 写入 CSV 文件
 */
async function writeCSV(
  filePath: string,
  headers: string[],
  rows: Record<string, string>[],
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const resolvedPath = resolveInWorkspace(filePath);
    if (!resolvedPath) {
      return { success: false, error: `路径不在工作区内: ${filePath}` };
    }
    const dir = path.dirname(resolvedPath);
    if (
      !(await fs
        .access(dir)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs.mkdir(dir, { recursive: true });
    }

    const lines = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map((header) => {
        const value = String(row[header] || '');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      lines.push(values.join(','));
    }

    await fs.writeFile(resolvedPath, lines.join('\n'), 'utf-8');

    return {
      success: true,
      data: `CSV 文件已写入: ${resolvedPath}`,
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: `写入 CSV 失败: ${(e as Error).message}`,
    };
  }
}

/**
 * 读取 JSON 文件
 */
async function readJSON(
  filePath: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const resolvedPath = resolveInWorkspace(filePath);
    if (!resolvedPath) {
      return { success: false, error: `路径不在工作区内: ${filePath}` };
    }
    const sizeError = await checkFileSize(resolvedPath, '读取 JSON 失败:');
    if (sizeError) return { success: false, error: sizeError };

    const content = await fs.readFile(resolvedPath, 'utf-8');
    const data = JSON.parse(content);

    return {
      success: true,
      data,
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: `读取 JSON 失败: ${(e as Error).message}`,
    };
  }
}

/**
 * 写入 JSON 文件
 */
async function writeJSON(
  filePath: string,
  data: unknown,
  pretty: boolean = true,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const resolvedPath = resolveInWorkspace(filePath);
    if (!resolvedPath) {
      return { success: false, error: `路径不在工作区内: ${filePath}` };
    }
    const dir = path.dirname(resolvedPath);
    if (
      !(await fs
        .access(dir)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs.mkdir(dir, { recursive: true });
    }

    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

    await fs.writeFile(resolvedPath, content, 'utf-8');

    return {
      success: true,
      data: `JSON 文件已写入: ${resolvedPath}`,
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: `写入 JSON 失败: ${(e as Error).message}`,
    };
  }
}

/**
 * 转换 CSV 到 JSON
 */
async function csvToJSON(
  csvPath: string,
  jsonPath: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const csvResult = await readCSV(csvPath);
  if (!csvResult.success) {
    return csvResult;
  }

  const { headers, rows } = csvResult.data!;
  return await writeJSON(jsonPath, { headers, rows });
}

/**
 * 转换 JSON 到 CSV
 */
async function jsonToCSV(
  jsonPath: string,
  csvPath: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const jsonResult = await readJSON(jsonPath);
  if (!jsonResult.success) {
    return jsonResult;
  }

  const data = jsonResult.data as Record<string, unknown> | Record<string, string>[];
  let headers: string[], rows: Record<string, string>[];

  if (data && typeof data === 'object' && 'headers' in data && 'rows' in data) {
    headers = (data as Record<string, string[]>).headers;
    rows = (data as Record<string, Record<string, string>[]>).rows;
  } else if (Array.isArray(data)) {
    if (data.length === 0) {
      return {
        success: false,
        error: 'JSON 数组为空',
      };
    }
    headers = Object.keys(data[0] as Record<string, string>);
    rows = data as Record<string, string>[];
  } else {
    return {
      success: false,
      error: '不支持的 JSON 格式',
    };
  }

  return await writeCSV(csvPath, headers, rows);
}

/**
 * 查询数据
 */
async function queryData(
  filePath: string,
  query: Record<string, string>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ext = path.extname(filePath).toLowerCase();

  let data: Record<string, string>[];
  if (ext === '.csv') {
    const result = await readCSV(filePath);
    if (!result.success) return result as { success: false; error: string };
    data = result.data!.rows;
  } else if (ext === '.json') {
    const result = await readJSON(filePath);
    if (!result.success) return result as { success: false; error: string };
    const jsonData = result.data as Record<string, unknown> | Record<string, string>[];
    data =
      (jsonData as Record<string, Record<string, string>[]>).rows ||
      (jsonData as Record<string, string>[]);
  } else {
    return {
      success: false,
      error: `不支持的文件格式: ${ext}`,
    };
  }

  try {
    const filtered = data.filter((row: Record<string, string>) => {
      for (const [key, value] of Object.entries(query)) {
        const rowValue = row[key];
        if (rowValue === undefined) return false;

        const rowStr = String(rowValue).toLowerCase();
        const queryStr = String(value).toLowerCase();

        if (!rowStr.includes(queryStr)) {
          return false;
        }
      }
      return true;
    });

    return {
      success: true,
      data: filtered,
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: `查询失败: ${(e as Error).message}`,
    };
  }
}

/**
 * 统计数据
 */
async function analyzeData(
  filePath: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const ext = path.extname(filePath).toLowerCase();

  let data: { headers: string[]; rows: Record<string, string>[] };
  if (ext === '.csv') {
    const result = await readCSV(filePath);
    if (!result.success) return result;
    data = result.data!;
  } else if (ext === '.json') {
    const result = await readJSON(filePath);
    if (!result.success) return result as { success: false; error: string };
    const jsonData = result.data as Record<string, unknown> | Record<string, string>[];
    data = {
      headers:
        (jsonData as Record<string, string[]>).headers ||
        (Array.isArray(jsonData) && jsonData.length > 0
          ? Object.keys(jsonData[0] as Record<string, string>)
          : []),
      rows:
        (jsonData as Record<string, Record<string, string>[]>).rows ||
        (jsonData as Record<string, string>[]),
    };
  } else {
    return {
      success: false,
      error: `不支持的文件格式: ${ext}`,
    };
  }

  const stats: Record<string, unknown> = {
    totalRows: data.rows.length,
    columns: data.headers.length,
    columnNames: data.headers,
    columnTypes: {},
    summary: {},
  };

  for (const header of data.headers) {
    const values = data.rows.map((row: Record<string, string>) => row[header]);

    const columnType = detectType(values);
    (stats.columnTypes as Record<string, string>)[header] = columnType;

    if (columnType === 'number') {
      const nums = values
        .filter((v: string) => !isNaN(parseFloat(v)))
        .map((v: string) => parseFloat(v));
      // 检查数组是否为空，避免 Math.min/max 返回 Infinity
      if (nums.length > 0) {
        // 用循环求 min/max，避免 Math.min(...大数组) 超过调用栈上限
        let min = nums[0];
        let max = nums[0];
        for (let i = 1; i < nums.length; i++) {
          if (nums[i] < min) min = nums[i];
          if (nums[i] > max) max = nums[i];
        }
        (stats.summary as Record<string, unknown>)[header] = {
          min,
          max,
          avg: nums.reduce((a: number, b: number) => a + b, 0) / nums.length,
          count: nums.length,
        };
      } else {
        (stats.summary as Record<string, unknown>)[header] = {
          min: null,
          max: null,
          avg: null,
          count: 0,
        };
      }
    } else {
      const counts: Record<string, number> = {};
      values.forEach((v: string) => {
        counts[v] = (counts[v] || 0) + 1;
      });
      (stats.summary as Record<string, unknown>)[header] = {
        unique: Object.keys(counts).length,
        top: Object.entries(counts)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 5)
          .map(([val, cnt]) => ({ value: val, count: cnt })),
      };
    }
  }

  return {
    success: true,
    data: stats,
  };
}

/**
 * 检测数据类型
 */
function detectType(values: string[]): string {
  let hasNumber = false;
  let hasString = false;
  let hasDate = false;

  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;

    const num = parseFloat(value);
    if (!isNaN(num)) {
      hasNumber = true;
    } else {
      hasString = true;
    }

    if (!hasDate && !isNaN(Date.parse(value))) {
      hasDate = true;
    }
  }

  if (hasDate && !hasNumber) return 'date';
  if (hasNumber && !hasString) return 'number';
  return 'string';
}

/**
 * 数据排序
 */
async function sortData(
  filePath: string,
  column: string,
  order: string = 'asc',
): Promise<{
  success: boolean;
  data?: { headers: string[]; rows: Record<string, string>[] };
  error?: string;
}> {
  const ext = path.extname(filePath).toLowerCase();

  let data: Record<string, string>[];
  let headers: string[];

  if (ext === '.csv') {
    const result = await readCSV(filePath);
    if (!result.success) return result;
    headers = result.data!.headers;
    data = result.data!.rows;
  } else if (ext === '.json') {
    const result = await readJSON(filePath);
    if (!result.success) return result as { success: false; error: string };
    const jsonData = result.data as Record<string, unknown> | Record<string, string>[];
    headers =
      (jsonData as Record<string, string[]>).headers ||
      (Array.isArray(jsonData) && jsonData.length > 0
        ? Object.keys(jsonData[0] as Record<string, string>)
        : []);
    data =
      (jsonData as Record<string, Record<string, string>[]>).rows ||
      (jsonData as Record<string, string>[]);
  } else {
    return {
      success: false,
      error: `不支持的文件格式: ${ext}`,
    };
  }

  if (!headers.includes(column)) {
    return {
      success: false,
      error: `列不存在: ${column}`,
    };
  }

  const sorted = [...data].sort((a, b) => {
    const valA = a[column];
    const valB = b[column];

    const numA = parseFloat(valA);
    const numB = parseFloat(valB);

    if (!isNaN(numA) && !isNaN(numB)) {
      return order === 'asc' ? numA - numB : numB - numA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();

    if (order === 'asc') {
      return strA.localeCompare(strB);
    }
    return strB.localeCompare(strA);
  });

  return {
    success: true,
    data: { headers, rows: sorted },
  };
}

export {
  readCSV,
  writeCSV,
  readJSON,
  writeJSON,
  csvToJSON,
  jsonToCSV,
  queryData,
  analyzeData,
  sortData,
};
