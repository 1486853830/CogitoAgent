import fs from 'fs/promises';
import path from 'path';
import {
  readCSV,
  writeCSV,
  readJSON,
  writeJSON,
  csvToJSON,
  jsonToCSV,
  queryData,
  analyzeData,
  sortData,
} from '../../src/agent/tools/data.ts';

describe('data tools', () => {
  const testDir = path.join(process.env.TEMP || '/tmp', 'cogito-test-data');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('readCSV', () => {
    it('should read CSV file', async () => {
      const csvPath = path.join(testDir, 'test.csv');
      await fs.writeFile(csvPath, 'name,age,city\nAlice,30,New York\nBob,25,London');

      const result = await readCSV(csvPath);
      expect(result.success).toBe(true);
      expect(result.data.headers).toEqual(['name', 'age', 'city']);
      expect(result.data.rows.length).toBe(2);
      expect(result.data.rows[0].name).toBe('Alice');
    });

    it('should handle empty CSV', async () => {
      const csvPath = path.join(testDir, 'empty.csv');
      await fs.writeFile(csvPath, '');

      const result = await readCSV(csvPath);
      expect(result.success).toBe(true);
      expect(result.data.headers).toEqual([]);
      expect(result.data.rows).toEqual([]);
    });

    it('should handle CSV with quoted fields', async () => {
      const csvPath = path.join(testDir, 'quoted.csv');
      await fs.writeFile(csvPath, 'name,city\n"Smith, John","New York"');

      const result = await readCSV(csvPath);
      expect(result.success).toBe(true);
      expect(result.data.rows[0].name).toBe('Smith, John');
    });

    it('should handle non-existent file', async () => {
      const result = await readCSV(path.join(testDir, 'nonexistent.csv'));
      expect(result.success).toBe(false);
    });
  });

  describe('writeCSV', () => {
    it('should write CSV file', async () => {
      const csvPath = path.join(testDir, 'output.csv');
      const headers = ['name', 'age'];
      const rows = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const result = await writeCSV(csvPath, headers, rows);
      expect(result.success).toBe(true);

      const content = await fs.readFile(csvPath, 'utf-8');
      expect(content).toContain('name,age');
      expect(content).toContain('Alice,30');
    });

    it('should auto-create directories', async () => {
      const csvPath = path.join(testDir, 'nested', 'output.csv');
      const headers = ['a', 'b'];
      const rows = [{ a: 1, b: 2 }];

      const result = await writeCSV(csvPath, headers, rows);
      expect(result.success).toBe(true);
    });

    it('should handle fields with commas', async () => {
      const csvPath = path.join(testDir, 'comma.csv');
      const headers = ['name', 'desc'];
      const rows = [{ name: 'Test', desc: 'Hello, World' }];

      const result = await writeCSV(csvPath, headers, rows);
      expect(result.success).toBe(true);

      const content = await fs.readFile(csvPath, 'utf-8');
      expect(content).toContain('"Hello, World"');
    });
  });

  describe('readJSON', () => {
    it('should read JSON file', async () => {
      const jsonPath = path.join(testDir, 'test.json');
      await fs.writeFile(jsonPath, JSON.stringify({ key: 'value', num: 42 }));

      const result = await readJSON(jsonPath);
      expect(result.success).toBe(true);
      expect(result.data.key).toBe('value');
      expect(result.data.num).toBe(42);
    });

    it('should handle invalid JSON', async () => {
      const jsonPath = path.join(testDir, 'invalid.json');
      await fs.writeFile(jsonPath, 'not valid json');

      const result = await readJSON(jsonPath);
      expect(result.success).toBe(false);
    });
  });

  describe('writeJSON', () => {
    it('should write JSON file', async () => {
      const jsonPath = path.join(testDir, 'output.json');
      const data = { name: 'Alice', age: 30 };

      const result = await writeJSON(jsonPath, data);
      expect(result.success).toBe(true);

      const content = await fs.readFile(jsonPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe('Alice');
    });

    it('should write pretty JSON by default', async () => {
      const jsonPath = path.join(testDir, 'pretty.json');
      const data = { a: 1, b: 2 };

      await writeJSON(jsonPath, data);
      const content = await fs.readFile(jsonPath, 'utf-8');
      expect(content).toContain('\n');
    });
  });

  describe('csvToJSON', () => {
    it('should convert CSV to JSON', async () => {
      const csvPath = path.join(testDir, 'input.csv');
      const jsonPath = path.join(testDir, 'output.json');
      await fs.writeFile(csvPath, 'name,age\nAlice,30\nBob,25');

      const result = await csvToJSON(csvPath, jsonPath);
      expect(result.success).toBe(true);

      const content = await fs.readFile(jsonPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.headers).toEqual(['name', 'age']);
      expect(parsed.rows.length).toBe(2);
    });
  });

  describe('jsonToCSV', () => {
    it('should convert JSON to CSV', async () => {
      const jsonPath = path.join(testDir, 'input.json');
      const csvPath = path.join(testDir, 'output.csv');
      await fs.writeFile(
        jsonPath,
        JSON.stringify({ headers: ['name', 'age'], rows: [{ name: 'Alice', age: 30 }] }),
      );

      const result = await jsonToCSV(jsonPath, csvPath);
      expect(result.success).toBe(true);

      const content = await fs.readFile(csvPath, 'utf-8');
      expect(content).toContain('Alice,30');
    });

    it('should handle array format JSON', async () => {
      const jsonPath = path.join(testDir, 'array.json');
      const csvPath = path.join(testDir, 'array-output.csv');
      await fs.writeFile(
        jsonPath,
        JSON.stringify([
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ]),
      );

      const result = await jsonToCSV(jsonPath, csvPath);
      expect(result.success).toBe(true);
    });

    it('should handle empty JSON array', async () => {
      const jsonPath = path.join(testDir, 'empty-array.json');
      const csvPath = path.join(testDir, 'empty-output.csv');
      await fs.writeFile(jsonPath, '[]');

      const result = await jsonToCSV(jsonPath, csvPath);
      expect(result.success).toBe(false);
    });
  });

  describe('queryData', () => {
    it('should query CSV data', async () => {
      const csvPath = path.join(testDir, 'query.csv');
      await fs.writeFile(csvPath, 'name,city\nAlice,New York\nBob,London\nCharlie,New York');

      const result = await queryData(csvPath, { city: 'New York' });
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('should query JSON data', async () => {
      const jsonPath = path.join(testDir, 'query.json');
      await fs.writeFile(
        jsonPath,
        JSON.stringify([
          { name: 'Alice', city: 'New York' },
          { name: 'Bob', city: 'London' },
        ]),
      );

      const result = await queryData(jsonPath, { city: 'London' });
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
    });
  });

  describe('analyzeData', () => {
    it('should analyze CSV data', async () => {
      const csvPath = path.join(testDir, 'analyze.csv');
      await fs.writeFile(csvPath, 'name,age\nAlice,30\nBob,25\nCharlie,35');

      const result = await analyzeData(csvPath);
      expect(result.success).toBe(true);
      expect(result.data.totalRows).toBe(3);
      expect(result.data.columns).toBe(2);
    });
  });

  describe('sortData', () => {
    it('should sort CSV data ascending', async () => {
      const csvPath = path.join(testDir, 'sort.csv');
      await fs.writeFile(csvPath, 'name,age\nCharlie,35\nAlice,30\nBob,25');

      const result = await sortData(csvPath, 'age', 'asc');
      expect(result.success).toBe(true);
      expect(result.data.rows[0].name).toBe('Bob');
      expect(result.data.rows[2].name).toBe('Charlie');
    });

    it('should sort CSV data descending', async () => {
      const csvPath = path.join(testDir, 'sort.csv');
      await fs.writeFile(csvPath, 'name,age\nCharlie,35\nAlice,30\nBob,25');

      const result = await sortData(csvPath, 'age', 'desc');
      expect(result.success).toBe(true);
      expect(result.data.rows[0].name).toBe('Charlie');
    });

    it('should handle non-existent column', async () => {
      const csvPath = path.join(testDir, 'sort.csv');
      await fs.writeFile(csvPath, 'name,age\nAlice,30');

      const result = await sortData(csvPath, 'nonexistent');
      expect(result.success).toBe(false);
    });
  });
});
