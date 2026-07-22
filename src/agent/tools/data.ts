import fs from 'fs/promises';
import path from 'path';

/**
 * 读取 CSV 文件
 */
async function readCSV(filePath: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length === 0) {
      return {
        success: true,
        data: { headers: [], rows: [] },
      };
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const values = parseCSVLine(line);
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      return row;
    });

    return {
      success: true,
      data: { headers, rows },
    };
  } catch (e: any) {
    return {
      success: false,
      error: `读取 CSV 失败: ${e.message}`,
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
async function writeCSV(filePath: string, headers: string[], rows: any[]): Promise<any> {
  try {
    const dir = path.dirname(filePath);
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

    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    return {
      success: true,
      data: `CSV 文件已写入: ${filePath}`,
    };
  } catch (e: any) {
    return {
      success: false,
      error: `写入 CSV 失败: ${e.message}`,
    };
  }
}

/**
 * 读取 JSON 文件
 */
async function readJSON(filePath: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    return {
      success: true,
      data,
    };
  } catch (e: any) {
    return {
      success: false,
      error: `读取 JSON 失败: ${e.message}`,
    };
  }
}

/**
 * 写入 JSON 文件
 */
async function writeJSON(filePath: string, data: any, pretty: boolean = true): Promise<any> {
  try {
    const dir = path.dirname(filePath);
    if (
      !(await fs
        .access(dir)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs.mkdir(dir, { recursive: true });
    }

    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

    await fs.writeFile(filePath, content, 'utf-8');

    return {
      success: true,
      data: `JSON 文件已写入: ${filePath}`,
    };
  } catch (e: any) {
    return {
      success: false,
      error: `写入 JSON 失败: ${e.message}`,
    };
  }
}

/**
 * 转换 CSV 到 JSON
 */
async function csvToJSON(csvPath: string, jsonPath: string): Promise<any> {
  const csvResult = await readCSV(csvPath);
  if (!csvResult.success) {
    return csvResult;
  }

  const { headers, rows } = csvResult.data;
  return await writeJSON(jsonPath, { headers, rows });
}

/**
 * 转换 JSON 到 CSV
 */
async function jsonToCSV(jsonPath: string, csvPath: string): Promise<any> {
  const jsonResult = await readJSON(jsonPath);
  if (!jsonResult.success) {
    return jsonResult;
  }

  const data = jsonResult.data;
  let headers, rows;

  if (data.headers && data.rows) {
    headers = data.headers;
    rows = data.rows;
  } else if (Array.isArray(data)) {
    if (data.length === 0) {
      return {
        success: false,
        error: 'JSON 数组为空',
      };
    }
    headers = Object.keys(data[0]);
    rows = data;
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
async function queryData(filePath: string, query: any): Promise<any> {
  const ext = path.extname(filePath).toLowerCase();

  let data;
  if (ext === '.csv') {
    const result = await readCSV(filePath);
    if (!result.success) return result;
    data = result.data.rows;
  } else if (ext === '.json') {
    const result = await readJSON(filePath);
    if (!result.success) return result;
    const jsonData = result.data;
    data = jsonData.rows || jsonData;
  } else {
    return {
      success: false,
      error: `不支持的文件格式: ${ext}`,
    };
  }

  try {
    const filtered = data.filter((row: any) => {
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
  } catch (e: any) {
    return {
      success: false,
      error: `查询失败: ${e.message}`,
    };
  }
}

/**
 * 统计数据
 */
async function analyzeData(filePath: string): Promise<any> {
  const ext = path.extname(filePath).toLowerCase();

  let data;
  if (ext === '.csv') {
    const result = await readCSV(filePath);
    if (!result.success) return result;
    data = result.data;
  } else if (ext === '.json') {
    const result = await readJSON(filePath);
    if (!result.success) return result;
    const jsonData = result.data;
    data = {
      headers: jsonData.headers || (jsonData.length > 0 ? Object.keys(jsonData[0]) : []),
      rows: jsonData.rows || jsonData,
    };
  } else {
    return {
      success: false,
      error: `不支持的文件格式: ${ext}`,
    };
  }

  const stats: any = {
    totalRows: data.rows.length,
    columns: data.headers.length,
    columnNames: data.headers,
    columnTypes: {},
    summary: {},
  };

  for (const header of data.headers) {
    const values = data.rows.map((row: any) => row[header]);

    stats.columnTypes[header] = detectType(values);

    if (stats.columnTypes[header] === 'number') {
      const nums = values.filter((v: any) => !isNaN(parseFloat(v))).map((v: any) => parseFloat(v));
      // 检查数组是否为空，避免 Math.min/max 返回 Infinity
      if (nums.length > 0) {
        stats.summary[header] = {
          min: Math.min(...nums),
          max: Math.max(...nums),
          avg: nums.reduce((a: number, b: number) => a + b, 0) / nums.length,
          count: nums.length,
        };
      } else {
        stats.summary[header] = {
          min: null,
          max: null,
          avg: null,
          count: 0,
        };
      }
    } else {
      const counts: any = {};
      values.forEach((v: any) => {
        counts[v] = (counts[v] || 0) + 1;
      });
      stats.summary[header] = {
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
function detectType(values: any[]): string {
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
async function sortData(filePath: string, column: string, order: string = 'asc'): Promise<any> {
  const ext = path.extname(filePath).toLowerCase();

  let data;
  let headers;

  if (ext === '.csv') {
    const result = await readCSV(filePath);
    if (!result.success) return result;
    headers = result.data.headers;
    data = result.data.rows;
  } else if (ext === '.json') {
    const result = await readJSON(filePath);
    if (!result.success) return result;
    const jsonData = result.data;
    headers = jsonData.headers || (jsonData.length > 0 ? Object.keys(jsonData[0]) : []);
    data = jsonData.rows || jsonData;
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
