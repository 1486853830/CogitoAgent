/**
 * SheetJS 轻量替身。
 *
 * 原实现把 write/writeFile 做成 no-op，导致 office 用例只能断言返回值，
 * 完全验证不到"文件是否真的写出、内容是否正确"。这里改为把工作簿序列化成
 * JSON 落盘，使 createExcel → readExcel 形成真实的磁盘往返，
 * 既不引入原生依赖，又能验证真实产物。
 */
import { readFileSync, writeFileSync } from 'fs';

function book_new() {
  return { Sheets: {}, SheetNames: [] };
}

function aoa_to_sheet(data) {
  // 用 __aoa 保存二维数组原文，sheet_to_json 时原样取回
  return { __aoa: Array.isArray(data) ? data.map((row) => [...row]) : [] };
}

function book_append_sheet(wb, ws, name) {
  const sheetName = name || `Sheet${wb.SheetNames.length + 1}`;
  wb.Sheets[sheetName] = ws;
  wb.SheetNames.push(sheetName);
}

function sheet_to_json(ws) {
  return ws && Array.isArray(ws.__aoa) ? ws.__aoa.map((row) => [...row]) : [];
}

function write(wb) {
  return Buffer.from(
    JSON.stringify({ Sheets: wb?.Sheets || {}, SheetNames: wb?.SheetNames || [] }),
    'utf8',
  );
}

function read(buf) {
  try {
    const parsed = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.SheetNames)) {
      return { Sheets: parsed.Sheets || {}, SheetNames: parsed.SheetNames };
    }
  } catch {
    // 非本替身写出的内容（例如测试直接写的占位文本）→ 退化为空工作簿
  }
  return { Sheets: {}, SheetNames: [] };
}

export default {
  read,
  readFile: (filePath) => read(readFileSync(filePath)),
  utils: { sheet_to_json, book_new, aoa_to_sheet, book_append_sheet },
  write,
  writeFile: (wb, filePath) => writeFileSync(filePath, write(wb)),
};
