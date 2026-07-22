import fs from 'fs/promises';
import path from 'path';

async function testWriteCSV() {
  const testDir = path.join(process.env.TEMP || '/tmp', 'cogito-test-data');
  await fs.mkdir(testDir, { recursive: true });

  const csvPath = path.join(testDir, 'output.csv');
  const headers = ['name', 'age'];
  const rows = [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ];

  try {
    const dir = path.dirname(csvPath);
    console.log('dir:', dir);
    console.log(
      'dir exists:',
      await fs
        .access(dir)
        .then(() => true)
        .catch(() => false),
    );

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
        const value = row[header] || '';
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      lines.push(values.join(','));
    }

    await fs.writeFile(csvPath, lines.join('\n'), 'utf-8');

    console.log('success:', csvPath);
    const content = await fs.readFile(csvPath, 'utf-8');
    console.log('content:', content);
  } catch (e: any) {
    console.log('error:', e.message);
  }

  await fs.rm(testDir, { recursive: true, force: true });
}

testWriteCSV();
