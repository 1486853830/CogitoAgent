import {
  elementInfo,
  molWeight,
  elementComposition,
  molarity,
  dilution,
  phFromH,
  phToH,
  idealGasLaw,
  gasDensity,
} from '../../src/agent/tools/chem.ts';

describe('chem tools', () => {
  describe('elementInfo', () => {
    it('should return element info for H', async () => {
      const result = await elementInfo('H');
      expect(result.success).toBe(true);
      expect(result.data).toContain('氢');
      expect(result.data).toContain('原子序数: 1');
    });

    it('should return element info for Fe', async () => {
      const result = await elementInfo('Fe');
      expect(result.success).toBe(true);
      expect(result.data).toContain('铁');
    });

    it('should reject unknown element', async () => {
      const result = await elementInfo('XX');
      expect(result.success).toBe(false);
    });
  });

  describe('molWeight', () => {
    it('should calculate molecular weight for H2O', async () => {
      const result = await molWeight('H2O');
      expect(result.success).toBe(true);
      expect(result.data).toContain('H2O');
      expect(result.data).toContain('18.015');
    });

    it('should calculate molecular weight for H2SO4', async () => {
      const result = await molWeight('H2SO4');
      expect(result.success).toBe(true);
      expect(result.data).toContain('H2SO4');
    });

    it('should handle parentheses in formula', async () => {
      const result = await molWeight('Ca(OH)2');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Ca(OH)2');
    });

    it('should handle hydrate formula', async () => {
      const result = await molWeight('CuSO4·5H2O');
      expect(result.success).toBe(true);
    });

    it('should reject unknown element', async () => {
      const result = await molWeight('XX');
      expect(result.success).toBe(false);
    });
  });

  describe('elementComposition', () => {
    it('should calculate element composition for H2O', async () => {
      const result = await elementComposition('H2O');
      expect(result.success).toBe(true);
      expect(result.data).toContain('H');
      expect(result.data).toContain('O');
    });

    it('should reject invalid formula', async () => {
      const result = await elementComposition('XX');
      expect(result.success).toBe(false);
    });
  });

  describe('molarity', () => {
    it('should calculate molarity', async () => {
      const result = await molarity(0.1, 1);
      expect(result.success).toBe(true);
      expect(result.data).toContain('0.1000');
    });

    it('should reject zero moles', async () => {
      const result = await molarity(0, 1);
      expect(result.success).toBe(false);
    });

    it('should reject zero volume', async () => {
      const result = await molarity(0.1, 0);
      expect(result.success).toBe(false);
    });
  });

  describe('dilution', () => {
    it('should calculate target volume', async () => {
      const result = await dilution(1, 0.1, 0.1, undefined);
      expect(result.success).toBe(true);
    });

    it('should calculate target concentration', async () => {
      const result = await dilution(1, 0.1, undefined, 1);
      expect(result.success).toBe(true);
    });

    it('should verify C1V1=C2V2', async () => {
      const result = await dilution(1, 0.1, 0.1, 1);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', async () => {
      const result = await dilution(1, 0.1, undefined, undefined);
      expect(result.success).toBe(false);
    });

    it('should reject target concentration >= initial', async () => {
      const result = await dilution(1, 0.1, 2, undefined);
      expect(result.success).toBe(false);
    });
  });

  describe('phFromH', () => {
    it('should calculate pH from H+ concentration', async () => {
      const result = await phFromH(1e-7);
      expect(result.success).toBe(true);
      expect(result.data).toContain('7.00');
      expect(result.data).toContain('中性');
    });

    it('should handle acidic solution', async () => {
      const result = await phFromH(1e-4);
      expect(result.success).toBe(true);
      expect(result.data).toContain('4.00');
      expect(result.data).toContain('酸性');
    });

    it('should handle basic solution', async () => {
      const result = await phFromH(1e-10);
      expect(result.success).toBe(true);
      expect(result.data).toContain('10.00');
      expect(result.data).toContain('碱性');
    });

    it('should reject zero H+', async () => {
      const result = await phFromH(0);
      expect(result.success).toBe(false);
    });
  });

  describe('phToH', () => {
    it('should calculate H+ from pH', async () => {
      const result = await phToH(7);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1.0000e-07');
    });

    it('should reject pH < 0', async () => {
      const result = await phToH(-1);
      expect(result.success).toBe(false);
    });

    it('should reject pH > 14', async () => {
      const result = await phToH(15);
      expect(result.success).toBe(false);
    });
  });

  describe('idealGasLaw', () => {
    it('should calculate P', async () => {
      const result = await idealGasLaw(undefined, 1, 1, 273);
      expect(result.success).toBe(true);
    });

    it('should calculate V', async () => {
      const result = await idealGasLaw(1, undefined, 1, 273);
      expect(result.success).toBe(true);
    });

    it('should calculate n', async () => {
      const result = await idealGasLaw(1, 22.4, undefined, 273);
      expect(result.success).toBe(true);
    });

    it('should calculate T', async () => {
      const result = await idealGasLaw(1, 22.4, 1, undefined);
      expect(result.success).toBe(true);
    });

    it('should verify PV=nRT', async () => {
      const result = await idealGasLaw(1, 22.4, 1, 273);
      expect(result.success).toBe(true);
    });

    it('should reject insufficient parameters', async () => {
      const result = await idealGasLaw(1, 1, undefined, undefined);
      expect(result.success).toBe(false);
    });
  });

  describe('gasDensity', () => {
    it('should calculate gas density', async () => {
      const result = await gasDensity(28, 273, 1);
      expect(result.success).toBe(true);
      expect(result.data).toContain('g/L');
    });

    it('should reject invalid parameters', async () => {
      const result = await gasDensity(0, 273, 1);
      expect(result.success).toBe(false);
    });
  });
});
