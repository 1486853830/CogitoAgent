import * as chem from '../src/agent/tools/chem.js';

describe('化学工具', () => {
  describe('元素信息', () => {
    it('should get element info', async () => {
      const result = await chem.elementInfo('Fe');
      expect(result.success).toBe(true);
      expect(result.data).toContain('铁');
      expect(result.data).toContain('26');
    });

    it('should handle unknown element', async () => {
      const result = await chem.elementInfo('XYZ');
      expect(result.success).toBe(false);
    });
  });

  describe('分子量计算', () => {
    it('should calculate molecular weight of H2O', async () => {
      const result = await chem.molWeight('H2O');
      expect(result.success).toBe(true);
      expect(result.data).toContain('18.015');
    });

    it('should calculate molecular weight of H2SO4', async () => {
      const result = await chem.molWeight('H2SO4');
      expect(result.success).toBe(true);
      expect(result.data).toContain('H2SO4');
      expect(result.data).toMatch(/分子量: \d+\.\d+/);
    });

    it('should handle complex formula Ca(OH)2', async () => {
      const result = await chem.molWeight('Ca(OH)2');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Ca');
    });
  });

  describe('溶液计算', () => {
    it('should calculate molarity', async () => {
      const result = await chem.molarity(1, 1);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1.00');
    });

    it('should calculate dilution', async () => {
      const result = await chem.dilution(10, 100, 1, null);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1000');
    });
  });

  describe('pH计算', () => {
    it('should convert H+ to pH', async () => {
      const result = await chem.phFromH(1e-7);
      expect(result.success).toBe(true);
      expect(result.data).toContain('7.0');
    });

    it('should convert pH to H+', async () => {
      const result = await chem.phToH(7);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1.0000e-07');
    });
  });

  describe('气体定律', () => {
    it('should calculate pressure using ideal gas law', async () => {
      const result = await chem.idealGasLaw(null, 22.4, 1, 273);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should calculate volume using ideal gas law', async () => {
      const result = await chem.idealGasLaw(1, null, 1, 273);
      expect(result.success).toBe(true);
      expect(result.data).toContain('22.4');
    });
  });
});
