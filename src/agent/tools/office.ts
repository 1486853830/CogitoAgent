import pptxgen from 'pptxgenjs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } from 'docx';
import XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';

// ==================== PPT ====================

async function createPpt(options: any, ...rest: any[]): Promise<any> {
  try {
    let outputPath, slides: any[] = [], title = 'Untitled', author = 'CogitoAgent';

    if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
      outputPath = options.outputPath;
      slides = options.slides || [];
      title = options.title || 'Untitled';
      author = options.author || 'CogitoAgent';
    } else if (typeof options === 'string') {
      outputPath = options;
      const slideTitle = rest[0] || 'Slide 1';
      const slideContent = rest[1] || '';
      slides = [{ title: slideTitle, content: slideContent }];
      title = slideTitle;
    }

    if (!outputPath) {
      return { success: false, error: '缺少 outputPath 参数' };
    }

    const ppt = new pptxgen();
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
          x: 0.5, y: 0.3, w: '90%', h: 0.8,
          fontSize: 32, bold: true, color: '333333', align: 'left'
        });
      }

      if (slideData.content) {
        slide.addText(slideData.content, {
          x: 0.5, y: slideData.title ? 1.3 : 0.5, w: '90%', h: '70%',
          fontSize: 18, color: '666666', align: 'left', valign: 'top'
        });
      }

      if (slideData.image) {
        try {
          await fs.access(slideData.image);
          slide.addImage({
            x: 0.5, y: slideData.title ? 2.5 : 1.5, w: '80%', h: '50%',
            path: slideData.image
          });
        } catch (e) {}
      }

      if (slideData.bullets && Array.isArray(slideData.bullets)) {
        slide.addText(
          slideData.bullets.map((b: any, i: number) => ({
            text: b,
            options: { bullet: true, breakLine: i < slideData.bullets.length - 1 }
          })),
          {
            x: 0.5, y: slideData.title ? 1.3 : 0.5, w: '90%', h: '60%',
            fontSize: 16, color: '444444', valign: 'top'
          }
        );
      }
    }

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await ppt.writeFile({ fileName: outputPath });

    return { success: true, path: outputPath, slideCount: slides.length };
  } catch (e: any) {
    return { success: false, error: `创建PPT失败: ${e.message}` };
  }
}

// ==================== Word ====================

async function createWord(options: any, ...rest: any[]): Promise<any> {
  try {
    let outputPath, paragraphs: any[] = [], title = 'Untitled', author = 'CogitoAgent';

    if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
      outputPath = options.outputPath;
      paragraphs = options.paragraphs || [];
      title = options.title || 'Untitled';
      author = options.author || 'CogitoAgent';
    } else if (typeof options === 'string') {
      outputPath = options;
      const docTitle = rest[0] || 'Document';
      const docContent = rest[1] || '';
      paragraphs = [
        { type: 'heading', text: docTitle, level: 1 },
        { type: 'text', text: docContent }
      ];
      title = docTitle;
    }

    if (!outputPath) {
      return { success: false, error: '缺少 outputPath 参数' };
    }

    const children: any[] = [];

    for (const para of paragraphs) {
      if (para.type === 'heading') {
        const level = para.level || 1;
        const headingMap: any = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
          5: HeadingLevel.HEADING_5,
          6: HeadingLevel.HEADING_6
        };
        children.push(
          new Paragraph({
            text: para.text || '',
            heading: headingMap[level] || HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 200 }
          })
        );
      } else if (para.type === 'text') {
        children.push(
          new Paragraph({
            children: [new TextRun(para.text || '')],
            spacing: { after: 200 }
          })
        );
      } else if (para.type === 'list') {
        const items = para.items || [];
        for (const item of items) {
          children.push(
            new Paragraph({
              children: [new TextRun(item)],
              bullet: { level: 0 },
              spacing: { after: 100 }
            })
          );
        }
      } else if (para.type === 'table') {
        const rows = para.rows || [];
        if (rows.length > 0) {
          const tableRows = rows.map((row: any) =>
            new TableRow({
              children: row.map((cell: any) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun(cell || '')] })],
                  width: { size: 100 / (row.length || 1), type: WidthType.PERCENTAGE }
                })
              )
            })
          );
          children.push(
            new Paragraph({ spacing: { before: 200, after: 200 } }),
            new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
            new Paragraph({ spacing: { before: 200, after: 200 } })
          );
        }
      } else if (para.type === 'image') {
        try {
          await fs.access(para.src);
          const imageBuffer = await fs.readFile(para.src);
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: { width: para.width || 600, height: para.height || 400 }
                } as any)
              ],
              spacing: { before: 200, after: 200 }
            })
          );
        } catch (e) {}
      }
    }

    if (children.length === 0) {
      children.push(new Paragraph({ children: [new TextRun('No content provided')] }));
    }

    const doc = new Document({
      creator: author,
      title: title,
      sections: [{ properties: {}, children }]
    });

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(outputPath, buffer);

    return { success: true, path: outputPath, paragraphCount: paragraphs.length };
  } catch (e: any) {
    return { success: false, error: `创建Word文档失败: ${e.message}` };
  }
}

// ==================== Excel ====================

async function createExcel(options: any, ...rest: any[]): Promise<any> {
  try {
    let outputPath, sheets: any[] = [];

    if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
      outputPath = options.outputPath;
      sheets = options.sheets || [];
    } else if (typeof options === 'string') {
      outputPath = options;
      const sheetName = rest[0] || 'Sheet1';
      const data = rest[1] ? (Array.isArray(rest[1]) ? rest[1] : [rest[1]]) : [['No content provided']];
      sheets = [{ name: sheetName, data }];
    }

    if (!outputPath) {
      return { success: false, error: '缺少 outputPath 参数' };
    }

    if (sheets.length === 0) {
      sheets = [{ name: 'Sheet1', data: [['No content provided']] }];
    }

    const wb = XLSX.utils.book_new();

    for (const sheet of sheets) {
      const sheetName = sheet.name || 'Sheet';
      const data = sheet.data || [];
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    XLSX.writeFile(wb, outputPath);

    return { success: true, path: outputPath, sheetCount: sheets.length };
  } catch (e: any) {
    return { success: false, error: `创建Excel失败: ${e.message}` };
  }
}

async function readExcel(filePath: string): Promise<any> {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: '缺少 filePath 参数' };
    }

    await fs.access(filePath);
    const wb = XLSX.readFile(filePath);

    const result: any = {};
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      result[sheetName] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    }

    return { success: true, data: result, sheetNames: wb.SheetNames };
  } catch (e: any) {
    return { success: false, error: `读取Excel失败: ${e.message}` };
  }
}

export {
  createPpt,
  createWord,
  createExcel,
  readExcel
};
