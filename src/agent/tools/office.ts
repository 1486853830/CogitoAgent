// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _PptxGen: any = null;
async function getPptxGen() {
  if (!_PptxGen) {
    const mod = await import('pptxgenjs');
    _PptxGen = 'default' in mod ? mod.default : mod;
  }
  return new _PptxGen();
}

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  type FileChild,
} from 'docx';
import XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import { resolveInWorkspace } from './path.ts';

// ==================== PPT ====================

interface SlideData {
  title?: string;
  content?: string;
  image?: string;
  bullets?: string[];
}

async function createPpt(
  options: Record<string, unknown> | string,
  ...rest: unknown[]
): Promise<{
  success: boolean;
  data?: string;
  path?: string;
  slideCount?: number;
  error?: string;
}> {
  try {
    let outputPath: string | undefined,
      slides: SlideData[] = [],
      title = 'Untitled',
      author = 'CogitoAgent';

    if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
      outputPath = options.outputPath as string;
      slides = (options.slides as SlideData[]) || [];
      title = (options.title as string) || 'Untitled';
      author = (options.author as string) || 'CogitoAgent';
    } else if (typeof options === 'string') {
      outputPath = options;
      const slideTitle = (rest[0] as string) || 'Slide 1';
      const slideContent = (rest[1] as string) || '';
      slides = [{ title: slideTitle, content: slideContent }];
      title = slideTitle;
    }

    if (!outputPath) {
      return { success: false, error: '缺少 outputPath 参数' };
    }

    // 校验路径必须在工作区内，防止路径穿越写入工作区外
    const resolvedPath = resolveInWorkspace(outputPath);
    if (!resolvedPath) {
      return { success: false, error: 'outputPath 越界：必须位于工作区内' };
    }
    outputPath = resolvedPath;

    const ppt = await getPptxGen();
    ppt.author = author;
    ppt.title = title;

    if (slides.length === 0) {
      slides = [{ title: 'Blank Slide', content: 'No content provided' }];
    }

    for (const slideData of slides) {
      const slide = ppt.addSlide();
      slide.background = { color: 'F5F5F5' };

      if (slideData.title) {
        slide.addText(slideData.title, {
          x: 0.5,
          y: 0.3,
          w: '90%',
          h: 0.8,
          fontSize: 32,
          bold: true,
          color: '333333',
          align: 'left',
        });
      }

      if (slideData.content) {
        slide.addText(slideData.content, {
          x: 0.5,
          y: slideData.title ? 1.3 : 0.5,
          w: '90%',
          h: '70%',
          fontSize: 18,
          color: '666666',
          align: 'left',
          valign: 'top',
        });
      }

      if (slideData.image) {
        try {
          await fs.access(slideData.image);
          slide.addImage({
            x: 0.5,
            y: slideData.title ? 2.5 : 1.5,
            w: '80%',
            h: '50%',
            path: slideData.image,
          });
        } catch {
          // 图片添加失败不影响幻灯片整体生成
        }
      }

      if (slideData.bullets && Array.isArray(slideData.bullets)) {
        slide.addText(
          slideData.bullets.map((b: string, i: number) => ({
            text: b,
            options: { bullet: true, breakLine: i < (slideData.bullets as string[]).length - 1 },
          })),
          {
            x: 0.5,
            y: slideData.title ? 1.3 : 0.5,
            w: '90%',
            h: '60%',
            fontSize: 16,
            color: '444444',
            valign: 'top',
          },
        );
      }
    }

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await ppt.writeFile({ fileName: outputPath });

    return {
      success: true,
      data: `PPT 文件已创建成功：${outputPath}（共 ${slides.length} 页）`,
      path: outputPath,
      slideCount: slides.length,
    };
  } catch (e: unknown) {
    return { success: false, error: `创建PPT失败: ${(e as Error).message}` };
  }
}

// ==================== Word ====================

interface ParagraphData {
  type: string;
  text?: string;
  level?: number;
  items?: string[];
  rows?: string[][];
  src?: string;
  width?: number;
  height?: number;
}

interface HeadingMap {
  [key: number]:
    'Heading1' | 'Heading2' | 'Heading3' | 'Heading4' | 'Heading5' | 'Heading6' | 'Title';
}

async function createWord(
  options: Record<string, unknown> | string,
  ...rest: unknown[]
): Promise<{
  success: boolean;
  data?: string;
  path?: string;
  paragraphCount?: number;
  error?: string;
}> {
  try {
    let outputPath: string | undefined,
      paragraphs: ParagraphData[] = [],
      title = 'Untitled',
      author = 'CogitoAgent';

    if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
      outputPath = options.outputPath as string;
      paragraphs = (options.paragraphs as ParagraphData[]) || [];
      title = (options.title as string) || 'Untitled';
      author = (options.author as string) || 'CogitoAgent';
    } else if (typeof options === 'string') {
      outputPath = options;
      const docTitle = (rest[0] as string) || 'Document';
      const docContent = (rest[1] as string) || '';
      paragraphs = [
        { type: 'heading', text: docTitle, level: 1 },
        { type: 'text', text: docContent },
      ];
      title = docTitle;
    }

    if (!outputPath) {
      return { success: false, error: '缺少 outputPath 参数' };
    }

    // 校验路径必须在工作区内，防止路径穿越写入工作区外
    const resolvedPath = resolveInWorkspace(outputPath);
    if (!resolvedPath) {
      return { success: false, error: 'outputPath 越界：必须位于工作区内' };
    }
    outputPath = resolvedPath;

    const children: unknown[] = [];

    for (const para of paragraphs) {
      if (para.type === 'heading') {
        const level = para.level || 1;
        const headingMap: HeadingMap = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
          5: HeadingLevel.HEADING_5,
          6: HeadingLevel.HEADING_6,
        };
        children.push(
          new Paragraph({
            text: para.text || '',
            heading: headingMap[level] || HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 200 },
          }),
        );
      } else if (para.type === 'text') {
        children.push(
          new Paragraph({
            children: [new TextRun(para.text || '')],
            spacing: { after: 200 },
          }),
        );
      } else if (para.type === 'list') {
        const items = para.items || [];
        for (const item of items) {
          children.push(
            new Paragraph({
              children: [new TextRun(item)],
              bullet: { level: 0 },
              spacing: { after: 100 },
            }),
          );
        }
      } else if (para.type === 'table') {
        const rows = para.rows || [];
        if (rows.length > 0) {
          const tableRows = rows.map(
            (row: string[]) =>
              new TableRow({
                children: row.map(
                  (cell: string) =>
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun(cell || '')] })],
                      width: { size: 100 / (row.length || 1), type: WidthType.PERCENTAGE },
                    }),
                ),
              }),
          );
          children.push(
            new Paragraph({ spacing: { before: 200, after: 200 } }),
            new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
            new Paragraph({ spacing: { before: 200, after: 200 } }),
          );
        }
      } else if (para.type === 'image') {
        try {
          await fs.access(para.src!);
          const imageBuffer = await fs.readFile(para.src!);
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  data: new Uint8Array(imageBuffer) as any,
                  type: 'png',
                  transformation: { width: para.width || 600, height: para.height || 400 },
                }),
              ],
              spacing: { before: 200, after: 200 },
            }),
          );
        } catch {
          // 图片添加失败不影响文档整体生成
        }
      }
    }

    if (children.length === 0) {
      children.push(new Paragraph({ children: [new TextRun('No content provided')] }));
    }

    const doc = new Document({
      creator: author,
      title: title,
      sections: [{ properties: {}, children: children as unknown as readonly FileChild[] }],
    });

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);

    return {
      success: true,
      data: `Word 文档已创建成功：${outputPath}（共 ${paragraphs.length} 个段落）`,
      path: outputPath,
      paragraphCount: paragraphs.length,
    };
  } catch (e: unknown) {
    return { success: false, error: `创建Word文档失败: ${(e as Error).message}` };
  }
}

// ==================== Excel ====================

interface SheetData {
  name?: string;
  data?: unknown[][];
}

/**
 * 规范化工作表数据：将单元格值转为 xlsx 支持的原始类型
 * （string/number/boolean），对象/数组转为 JSON 字符串，
 * 避免 aoa_to_sheet 遇到对象值时报 "n.charCodeAt is not a function"。
 */
function normalizeSheetData(rows: unknown[][]): (string | number | boolean)[][] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!Array.isArray(row)) {
      return [cellToPrimitive(row)];
    }
    return row.map((cell) => cellToPrimitive(cell));
  });
}

function cellToPrimitive(cell: unknown): string | number | boolean {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
    return cell;
  }
  // 对象/数组转 JSON 字符串，保持可读性
  try {
    return JSON.stringify(cell);
  } catch {
    return String(cell);
  }
}

async function createExcel(
  options: Record<string, unknown> | string,
  ...rest: unknown[]
): Promise<{
  success: boolean;
  data?: string;
  path?: string;
  sheetCount?: number;
  error?: string;
}> {
  try {
    let outputPath: string | undefined,
      sheets: SheetData[] = [];

    if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
      outputPath = options.outputPath as string;
      sheets = (options.sheets as SheetData[]) || [];
    } else if (typeof options === 'string') {
      outputPath = options;
      const sheetName = (rest[0] as string) || 'Sheet1';
      const data: unknown[][] = rest[1]
        ? Array.isArray(rest[1])
          ? (rest[1] as unknown[][])
          : [[rest[1]]]
        : [['No content provided']];
      sheets = [{ name: sheetName, data }];
    }

    if (!outputPath) {
      return { success: false, error: '缺少 outputPath 参数' };
    }

    // 校验路径必须在工作区内，防止路径穿越写入工作区外
    const resolvedPath = resolveInWorkspace(outputPath);
    if (!resolvedPath) {
      return { success: false, error: 'outputPath 越界：必须位于工作区内' };
    }
    outputPath = resolvedPath;

    if (sheets.length === 0) {
      sheets = [{ name: 'Sheet1', data: [['No content provided']] }];
    }

    const wb = XLSX.utils.book_new();

    for (const sheet of sheets) {
      const sheetName = sheet.name || 'Sheet';
      const rawData = sheet.data || [];
      const data = normalizeSheetData(rawData);
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // 用 XLSX.write 生成 buffer 后写入，避免 XLSX.writeFile 对文件系统/扩展名推断的依赖
    const wbType = outputPath.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: wbType }) as Buffer;
    await fs.writeFile(outputPath, buffer);

    return {
      success: true,
      data: `Excel 文件已创建成功：${outputPath}（共 ${sheets.length} 个工作表）`,
      path: outputPath,
      sheetCount: sheets.length,
    };
  } catch (e: unknown) {
    return { success: false, error: `创建Excel失败: ${(e as Error).message}` };
  }
}

async function readExcel(filePath: string): Promise<{
  success: boolean;
  data?: Record<string, unknown[][]>;
  sheetNames?: string[];
  error?: string;
}> {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: '缺少 filePath 参数' };
    }

    // 校验路径必须在工作区内，防止路径穿越读取工作区外文件
    const resolvedPath = resolveInWorkspace(filePath);
    if (!resolvedPath) {
      return { success: false, error: 'filePath 越界：必须位于工作区内' };
    }
    filePath = resolvedPath;

    await fs.access(filePath);
    const wb = XLSX.readFile(filePath);

    const result: Record<string, unknown[][]> = {};
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      result[sheetName] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    }

    return { success: true, data: result, sheetNames: wb.SheetNames };
  } catch (e: unknown) {
    return { success: false, error: `读取Excel失败: ${(e as Error).message}` };
  }
}

export { createPpt, createWord, createExcel, readExcel };
