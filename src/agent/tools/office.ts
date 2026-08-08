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
import JSZip from 'jszip';
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
    } else if (slides.length > 100) {
      // 限制幻灯片数量，防止生成超大 PPT 消耗大量内存/CPU
      slides = slides.slice(0, 100);
      console.log(`[提示] 幻灯片数量超过 100，已截断`);
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
    // 不直接用 XLSX.readFile：打包/Electron 环境下 SheetJS 内部的 fs 绑定缺失
    // 会抛 "Cannot access file"，改为用自己的 fs 读 buffer 再交给 XLSX 解析。
    const buf = await fs.readFile(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

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

// ==================== Word / PPT 读取 ====================

/** 反转 XML 实体，保持 &amp; 最后处理避免二次解码 */
function unescapeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&');
}

/** 提取 XML 片段内的文本：兼容 Word 的 <w:t> 与 PPT 的 <a:t> */
function extractTextRuns(xml: string): string {
  const parts: string[] = [];
  const re = /<(?:[A-Za-z0-9]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?t>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(unescapeXmlEntities(m[1]));
  }
  return parts.join('');
}

/** 解析 docx 的 document.xml：返回分段正文、标题和表格 */
function parseWordDocument(xml: string): {
  headings: string[];
  paragraphs: string[];
  tables: string[][][];
} {
  const tables: string[][][] = [];
  const tblRe = /<w:tbl[\s\S]*?<\/w:tbl>/gi;
  let tbl: RegExpExecArray | null;
  while ((tbl = tblRe.exec(xml)) !== null) {
    const rows: string[][] = [];
    const trRe = /<w:tr[\s\S]*?<\/w:tr>/gi;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(tbl[0])) !== null) {
      const cells: string[] = [];
      const tcRe = /<w:tc\b[\s\S]*?<\/w:tc>/gi;
      let tc: RegExpExecArray | null;
      while ((tc = tcRe.exec(tr[0])) !== null) {
        cells.push(extractTextRuns(tc[0]).trim());
      }
      rows.push(cells);
    }
    tables.push(rows);
  }

  // 表格与正文分离后，再按段落切分，避免重复
  const bodyWithoutTables = xml.replace(/<w:tbl[\s\S]*?<\/w:tbl>/gi, ' ');
  const headings: string[] = [];
  const paragraphs: string[] = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>/gi;
  let p: RegExpExecArray | null;
  while ((p = pRe.exec(bodyWithoutTables)) !== null) {
    const text = extractTextRuns(p[0]).trim();
    if (!text) continue;
    const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(p[0]);
    const style = styleMatch ? styleMatch[1] : '';
    if (/heading\d+/i.test(style)) {
      headings.push(text);
    } else {
      paragraphs.push(text);
    }
  }
  return { headings, paragraphs, tables };
}

/** 解析 pptx：按 slide 序号提取每页文本，保留一段一行的顺序 */
async function parsePptSlides(zip: JSZip): Promise<{ slide: number; paragraphs: string[] }[]> {
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide(\d+)\.xml$/i.test(name))
    .map((name) => {
      const n = parseInt(/^ppt\/slides\/slide(\d+)\.xml$/i.exec(name)![1], 10);
      return { name, n };
    })
    .sort((a, b) => a.n - b.n);

  const slides: { slide: number; paragraphs: string[] }[] = [];
  for (const { name, n } of slideFiles) {
    const xml = await zip.file(name)!.async('string');
    const paragraphs: string[] = [];
    const pRe = /<a:p\b[\s\S]*?<\/a:p>/gi;
    let p: RegExpExecArray | null;
    while ((p = pRe.exec(xml)) !== null) {
      const text = extractTextRuns(p[0]).trim();
      if (text) paragraphs.push(text);
    }
    if (paragraphs.length > 0) slides.push({ slide: n, paragraphs });
  }
  return slides;
}

async function readWord(filePath: string): Promise<{
  success: boolean;
  data?: {
    format: 'docx';
    title?: string;
    headings: string[];
    paragraphs: string[];
    tables: string[][][];
  };
  error?: string;
}> {
  try {
    const resolvedPath = resolveInWorkspace(filePath);
    if (!resolvedPath) {
      return { success: false, error: 'filePath 越界：必须位于工作区内' };
    }
    filePath = resolvedPath;

    const buf = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) {
      return {
        success: false,
        error: '未找到 word/document.xml，可能不是有效的 .docx 文件（旧版 .doc 需先转换为 .docx）',
      };
    }

    const { headings, paragraphs, tables } = parseWordDocument(docXml);

    let title: string | undefined;
    const coreXml = await zip.file('docProps/core.xml')?.async('string');
    if (coreXml) {
      const t = /<dc:title>(.*?)<\/dc:title>/i.exec(coreXml);
      if (t && t[1].trim()) title = unescapeXmlEntities(t[1].trim());
    }

    return {
      success: true,
      data: { format: 'docx', title, headings, paragraphs, tables },
    };
  } catch (e: unknown) {
    return { success: false, error: `读取Word失败: ${(e as Error).message}` };
  }
}

async function readPpt(filePath: string): Promise<{
  success: boolean;
  data?: {
    format: 'pptx';
    slideCount: number;
    slides: { slide: number; paragraphs: string[] }[];
  };
  error?: string;
}> {
  try {
    const resolvedPath = resolveInWorkspace(filePath);
    if (!resolvedPath) {
      return { success: false, error: 'filePath 越界：必须位于工作区内' };
    }
    filePath = resolvedPath;

    const buf = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(buf);
    const slides = await parsePptSlides(zip);
    if (slides.length === 0) {
      return {
        success: false,
        error:
          '未找到 ppt/slides/ 下的幻灯片，可能不是有效的 .pptx 文件（旧版 .ppt 需先转换为 .pptx）',
      };
    }

    return { success: true, data: { format: 'pptx', slideCount: slides.length, slides } };
  } catch (e: unknown) {
    return { success: false, error: `读取PPT失败: ${(e as Error).message}` };
  }
}

export { createPpt, createWord, createExcel, readExcel, readWord, readPpt };
