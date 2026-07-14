import * as bio from '../src/agent/tools/bio.js';

describe('生命科学工具', () => {
  describe('序列操作', () => {
    it('should complement DNA sequence', async () => {
      const result = await bio.dnaComplement('ATGCGTACG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('TACGCATGC');
    });

    it('should reverse complement DNA sequence', async () => {
      const result = await bio.dnaReverseComplement('ATGCGTACG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('CGTACGCAT');
    });

    it('should transcribe DNA to RNA', async () => {
      const result = await bio.rnaTranscribe('ATGCGTACG');
      expect(result.success).toBe(true);
      expect(result.data).toMatch(/转录 RNA: [AUCG]+/);
    });

    it('should translate RNA to protein', async () => {
      const result = await bio.translate('AUGCCUAGCUAG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('MPS');
    });

    it('should calculate GC content', async () => {
      const result = await bio.gcContent('ATGCGCTAGCTAGCTAG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('%');
    });

    it('should calculate molecular weight', async () => {
      const result = await bio.molecularWeight('ACDEFGHIKLMNPQRSTVWY');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Da');
    });
  });

  describe('序列比对', () => {
    it('should calculate Hamming distance', async () => {
      const result = await bio.hammingDistance('ATGC', 'ATCC');
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should handle unequal length sequences', async () => {
      const result = await bio.hammingDistance('ATGC', 'AT');
      expect(result.success).toBe(false);
    });

    it('should calculate Levenshtein distance', async () => {
      const result = await bio.levenshteinDistance('ACGT', 'ACG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });
  });

  describe('引物设计', () => {
    it('should estimate Tm', async () => {
      const result = await bio.tmEstimate('ATGCGCTAGCTAGCTAG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Tm');
    });

    it('should check for hairpin structure', async () => {
      const result = await bio.hairpinCheck('ATGCGCTAGCTAGCTAG');
      expect(result.success).toBe(true);
    });
  });

  describe('密码子统计', () => {
    it('should count codon usage', async () => {
      const result = await bio.codonUsage('ATGCGCTAGCTAGCTAG');
      expect(result.success).toBe(true);
      expect(result.data).toContain('密码子');
    });
  });

  describe('随机序列', () => {
    it('should generate random DNA sequence', async () => {
      const result = await bio.randomSeq(20, 'dna');
      expect(result.success).toBe(true);
      expect(result.data).toMatch(/^>Random DNA.*\n[ATCG]{20}$/);
    });

    it('should generate random RNA sequence', async () => {
      const result = await bio.randomSeq(20, 'rna');
      expect(result.success).toBe(true);
      expect(result.data).toMatch(/^>Random RNA.*\n[AUCG]{20}$/);
    });

    it('should generate random protein sequence', async () => {
      const result = await bio.randomSeq(20, 'protein');
      expect(result.success).toBe(true);
      expect(result.data.split('\n')[1]?.length).toBe(20);
    });
  });
});