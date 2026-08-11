import fs from 'fs/promises';
import path from 'path';
import { createPpt, createWord, createExcel, readExcel } from '../../src/agent/tools/office.ts';

/** 断言产物真的落在磁盘上且非空——替身库现在会写出真实文件 */
async function expectNonEmptyFile(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  expect(stat.isFile()).toBe(true);
  expect(stat.size).toBeGreaterThan(0);
  return fs.readFile(filePath, 'utf8');
}

describe('office tools', () => {
  const testDir = path.join(process.cwd(), 'test-output');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('createPpt', () => {
    it('should create PPT with object options', async () => {
      const outputPath = path.join(testDir, 'object-options.pptx');
      const result = await createPpt({
        outputPath,
        slides: [
          { title: 'Slide 1', content: 'Content of slide 1' },
          { title: 'Slide 2', bullets: ['Point A', 'Point B', 'Point C'] },
        ],
        title: 'Test Presentation',
        author: 'Test Author',
      });

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(result.slideCount).toBe(2);

      // 验证真实产物：文件存在、非空，且内容与入参一致
      const written = JSON.parse(await expectNonEmptyFile(outputPath));
      expect(written.slideCount).toBe(2);
      expect(written.title).toBe('Test Presentation');
      expect(written.author).toBe('Test Author');
      expect(JSON.stringify(written.slides)).toContain('Content of slide 1');
      expect(JSON.stringify(written.slides)).toContain('Point B');
    });

    it('should create PPT with string arguments', async () => {
      const outputPath = path.join(testDir, 'string-args.pptx');
      const result = await createPpt(outputPath, 'Slide Title', 'Slide Content');

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(result.slideCount).toBe(1);
    });

    it('should return error when outputPath is missing', async () => {
      const result = await createPpt({ slides: [{ title: 'x', content: 'y' }] });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createWord', () => {
    it('should create Word document with valid params', async () => {
      const outputPath = path.join(testDir, 'valid.docx');
      const result = await createWord({
        outputPath,
        paragraphs: [
          { type: 'heading', text: 'Document Heading', level: 1 },
          { type: 'text', text: 'A paragraph of body text.' },
          { type: 'list', items: ['First item', 'Second item'] },
          {
            type: 'table',
            rows: [
              ['Name', 'Age'],
              ['Alice', '30'],
            ],
          },
        ],
        title: 'Test Document',
        author: 'Test Author',
      });

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(result.paragraphCount).toBe(4);

      // 验证真实产物：.docx 确实被写出且元数据正确
      const written = JSON.parse(await expectNonEmptyFile(outputPath));
      expect(written.title).toBe('Test Document');
      expect(written.creator).toBe('Test Author');
      // heading + text + 2 个 list item + table = 至少 4 个 children
      expect(written.childCount).toBeGreaterThanOrEqual(4);
    });

    it('should return error when outputPath is missing', async () => {
      const result = await createWord({ paragraphs: [{ type: 'text', text: 'hi' }] });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('createExcel', () => {
    it('should create Excel with valid data', async () => {
      const outputPath = path.join(testDir, 'valid.xlsx');
      const result = await createExcel({
        outputPath,
        sheets: [
          {
            name: 'Sheet1',
            data: [
              ['Name', 'Age'],
              ['Alice', 30],
              ['Bob', 25],
            ],
          },
          {
            name: 'Sheet2',
            data: [
              ['x', 'y'],
              [1, 2],
            ],
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(result.sheetCount).toBe(2);

      await expectNonEmptyFile(outputPath);
    });

    it('should round-trip through readExcel（真实磁盘往返）', async () => {
      const outputPath = path.join(testDir, 'roundtrip.xlsx');
      const created = await createExcel({
        outputPath,
        sheets: [
          {
            name: 'Data',
            data: [
              ['col1', 'col2'],
              ['v1', 'v2'],
            ],
          },
        ],
      });
      expect(created.success).toBe(true);
      await expectNonEmptyFile(outputPath);

      const read = await readExcel(outputPath);
      expect(read.success).toBe(true);
      expect(read.sheetNames).toEqual(['Data']);
      expect((read.data as Record<string, unknown[][]>).Data).toEqual([
        ['col1', 'col2'],
        ['v1', 'v2'],
      ]);
    });

    it('should return error when outputPath is missing', async () => {
      const result = await createExcel({ sheets: [{ name: 'S', data: [['a']] }] });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('readExcel', () => {
    it('should read an existing Excel file', async () => {
      const filePath = path.join(testDir, 'readable.xlsx');
      // readExcel checks file existence via fs.access before delegating to the
      // (mocked) xlsx reader, so a real file must exist on disk.
      await fs.writeFile(filePath, 'placeholder');

      const result = await readExcel(filePath);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.sheetNames).toBeDefined();
    });

    it('should return error when file does not exist', async () => {
      const result = await readExcel(path.join(testDir, 'nonexistent.xlsx'));

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when filePath is empty', async () => {
      const result = await readExcel('');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
