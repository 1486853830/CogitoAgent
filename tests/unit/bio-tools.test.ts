import {
  dnaComplement,
  dnaReverseComplement,
  rnaTranscribe,
  translate,
  gcContent,
  molecularWeight,
  hammingDistance,
  levenshteinDistance,
  tmEstimate,
  hairpinCheck,
  randomSeq,
  parseFASTA,
  parseFASTQ,
  fastaToCSV,
  codonUsage,
} from '../../src/agent/tools/bio.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('bio tools', () => {
  describe('dnaComplement', () => {
    it('should compute DNA complement', async () => {
      const result = await dnaComplement('ATCG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('TAGC');
    });

    it('should handle lowercase', async () => {
      const result = await dnaComplement('atcg');
      expect(result.success).toBe(true);
      expect(result.data).toContain('TAGC');
    });

    it('should reject empty sequence', async () => {
      const result = await dnaComplement('');
      expect(result.success).toBe(false);
    });

    it('should reject invalid characters', async () => {
      const result = await dnaComplement('XYZ');
      expect(result.success).toBe(false);
    });
  });

  describe('dnaReverseComplement', () => {
    it('should compute reverse complement', async () => {
      const result = await dnaReverseComplement('ATCG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('CGAT');
    });
  });

  describe('rnaTranscribe', () => {
    it('should transcribe DNA to RNA', async () => {
      const result = await rnaTranscribe('ATCG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('AUCG');
    });
  });

  describe('translate', () => {
    it('should translate RNA to protein', async () => {
      const result = await translate('AUGUUUAAA');
      expect(result.success).toBe(true);
      expect(result.data).toContain('M');
      expect(result.data).toContain('F');
    });

    it('should handle reading frame 1', async () => {
      const result = await translate('UAUGUUUAAA', 1);
      expect(result.success).toBe(true);
    });

    it('should handle reading frame 2', async () => {
      const result = await translate('UUAUGUUUAAA', 2);
      expect(result.success).toBe(true);
    });

    it('should reject invalid reading frame', async () => {
      const result = await translate('AUG', 3);
      expect(result.success).toBe(false);
    });
  });

  describe('gcContent', () => {
    it('should calculate GC content', async () => {
      const result = await gcContent('ATCGCG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('66.67');
    });

    it('should handle RNA sequence', async () => {
      const result = await gcContent('AUCGCG');
      expect(result.success).toBe(true);
    });
  });

  describe('molecularWeight', () => {
    it('should calculate protein molecular weight', async () => {
      const result = await molecularWeight('AVG');
      expect(result.success).toBe(true);
    });

    it('should reject invalid protein sequence', async () => {
      const result = await molecularWeight('XYZ');
      expect(result.success).toBe(false);
    });
  });

  describe('hammingDistance', () => {
    it('should calculate Hamming distance', async () => {
      const result = await hammingDistance('ATCG', 'ATGG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should reject unequal lengths', async () => {
      const result = await hammingDistance('ATCG', 'ATG');
      expect(result.success).toBe(false);
    });

    it('should reject empty sequences', async () => {
      const result = await hammingDistance('', 'ATCG');
      expect(result.success).toBe(false);
    });
  });

  describe('levenshteinDistance', () => {
    it('should calculate Levenshtein distance', async () => {
      const result = await levenshteinDistance('kitten', 'sitting');
      expect(result.success).toBe(true);
    });

    it('should handle unequal lengths', async () => {
      const result = await levenshteinDistance('ATCG', 'AT');
      expect(result.success).toBe(true);
    });

    it('should reject empty sequences', async () => {
      const result = await levenshteinDistance('', 'ATCG');
      expect(result.success).toBe(false);
    });
  });

  describe('tmEstimate', () => {
    it('should estimate melting temperature', async () => {
      const result = await tmEstimate('ATCGATCG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Wallace');
    });
  });

  describe('hairpinCheck', () => {
    it('should detect hairpin structure', async () => {
      const result = await hairpinCheck('ATCGCGATCG');
      expect(result.success).toBe(true);
    });
  });

  describe('randomSeq', () => {
    it('should generate random DNA sequence', async () => {
      const result = await randomSeq(10);
      expect(result.success).toBe(true);
      expect(result.data).toContain('10 bp');
    });

    it('should generate random RNA sequence', async () => {
      const result = await randomSeq(10, 'rna');
      expect(result.success).toBe(true);
      expect(result.data).toContain('RNA');
    });

    it('should generate random protein sequence', async () => {
      const result = await randomSeq(10, 'protein');
      expect(result.success).toBe(true);
      expect(result.data).toContain('蛋白质');
    });

    it('should reject invalid length', async () => {
      const result = await randomSeq(-1);
      expect(result.success).toBe(false);
    });

    it('should reject invalid type', async () => {
      const result = await randomSeq(10, 'invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('parseFASTA', () => {
    let tempDir: string;
    let fastaPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bio-fasta-test-'));
      fastaPath = path.join(tempDir, 'test.fasta');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should parse single FASTA entry', async () => {
      const fastaContent = `>Sequence1
ATCGATCG
`;
      await fs.writeFile(fastaPath, fastaContent, 'utf-8');
      const result = await parseFASTA(fastaPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1 个序列');
    });

    it('should parse multiple FASTA entries', async () => {
      const fastaContent = `>Gene1
ATCG
>Gene2
GCTA
`;
      await fs.writeFile(fastaPath, fastaContent, 'utf-8');
      const result = await parseFASTA(fastaPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('2 个序列');
    });

    it('should reject empty FASTA file', async () => {
      await fs.writeFile(fastaPath, '', 'utf-8');
      const result = await parseFASTA(fastaPath);
      expect(result.success).toBe(false);
    });

    it('should handle file not found', async () => {
      const result = await parseFASTA(path.join(tempDir, 'nonexistent.fasta'));
      expect(result.success).toBe(false);
    });
  });

  describe('parseFASTQ', () => {
    let tempDir: string;
    let fastqPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bio-fastq-test-'));
      fastqPath = path.join(tempDir, 'test.fastq');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should parse single FASTQ entry', async () => {
      const fastqContent = `@Read1
ATCG
+
!!!!
`;
      await fs.writeFile(fastqPath, fastqContent, 'utf-8');
      const result = await parseFASTQ(fastqPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1 个 reads');
    });

    it('should parse multiple FASTQ entries', async () => {
      const fastqContent = `@Read1
ATCG
+
!!!!
@Read2
GCTA
+
####
`;
      await fs.writeFile(fastqPath, fastqContent, 'utf-8');
      const result = await parseFASTQ(fastqPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('2 个 reads');
    });

    it('should reject invalid FASTQ format', async () => {
      await fs.writeFile(fastqPath, 'invalid content', 'utf-8');
      const result = await parseFASTQ(fastqPath);
      expect(result.success).toBe(false);
    });
  });

  describe('fastaToCSV', () => {
    let tempDir: string;
    let fastaPath: string;
    let csvPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bio-csv-test-'));
      fastaPath = path.join(tempDir, 'input.fasta');
      csvPath = path.join(tempDir, 'output.csv');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should convert FASTA to CSV', async () => {
      const fastaContent = `>Gene1
ATCG
>Gene2
GCTA
`;
      await fs.writeFile(fastaPath, fastaContent, 'utf-8');
      const result = await fastaToCSV(fastaPath, csvPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('导出');
    });

    it('should handle empty FASTA', async () => {
      await fs.writeFile(fastaPath, '', 'utf-8');
      const result = await fastaToCSV(fastaPath, csvPath);
      expect(result.success).toBe(false);
    });
  });

  describe('codonUsage', () => {
    it('should calculate codon usage', async () => {
      const result = await codonUsage('ATCGATCG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('密码子');
    });

    it('should handle short sequence', async () => {
      const result = await codonUsage('AT');
      expect(result.success).toBe(false);
    });

    it('should reject invalid DNA', async () => {
      const result = await codonUsage('XYZ');
      expect(result.success).toBe(false);
    });
  });
});
