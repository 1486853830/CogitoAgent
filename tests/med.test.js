import * as med from '../src/agent/tools/med.js';

describe('医学工具', () => {
  describe('临床评分', () => {
    it('should calculate BMI', async () => {
      const result = await med.bmi(70, 1.75);
      expect(result.success).toBe(true);
      expect(result.data).toContain('22.9');
      expect(result.data).toContain('正常');
    });

    it('should calculate BSA', async () => {
      const result = await med.bsa(70, 175, 'mosteller');
      expect(result.success).toBe(true);
      expect(result.data).toContain('BSA');
    });

    it('should calculate eGFR', async () => {
      const result = await med.egfr(1.0, 45, 'male');
      expect(result.success).toBe(true);
      expect(result.data).toContain('G1');
    });

    it('should calculate CrCl', async () => {
      const result = await med.crcl(1.0, 45, 70, 'male');
      expect(result.success).toBe(true);
      expect(result.data).toContain('CrCl');
    });

    it('should calculate Child-Pugh score', async () => {
      const result = await med.childPugh(2.5, 3.0, 1.8, 'mild', 'none');
      expect(result.success).toBe(true);
      expect(result.data).toContain('分级');
    });
  });

  describe('药物剂量', () => {
    it('should calculate dose by weight', async () => {
      const result = await med.calculateDose(70, 5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('350');
    });

    it('should calculate ideal body weight', async () => {
      const result = await med.idealBodyWeight(175, 'male');
      expect(result.success).toBe(true);
      expect(result.data).toContain('理想体重');
    });

    it('should calculate infusion rate', async () => {
      const result = await med.infusionRate(500, 8, 'h');
      expect(result.success).toBe(true);
      expect(result.data).toContain('62.5');
    });
  });

  describe('单位换算', () => {
    it('should convert glucose mg/dL to mmol/L', async () => {
      const result = await med.convertUnit(100, 'mg/dL', 'mmol/L');
      expect(result.success).toBe(true);
      expect(result.data).toContain('5.55');
    });

    it('should convert temperature', async () => {
      const result = await med.temperatureConvert(37, 'c', 'f');
      expect(result.success).toBe(true);
      expect(result.data).toContain('98.6');
    });
  });

  describe('生理参数', () => {
    it('should calculate MAP', async () => {
      const result = await med.meanArterialPressure(120, 80);
      expect(result.success).toBe(true);
      expect(result.data).toContain('93');
    });

    it('should calculate anion gap', async () => {
      const result = await med.anionGap(140, 100, 24);
      expect(result.success).toBe(true);
      expect(result.data).toContain('16');
    });

    it('should calculate oxygen index', async () => {
      const result = await med.oxygenIndex(80, 40);
      expect(result.success).toBe(true);
      expect(result.data).toContain('200');
    });
  });
});