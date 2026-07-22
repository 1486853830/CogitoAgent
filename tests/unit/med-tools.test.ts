import {
  bmi,
  bsa,
  egfr,
  crcl,
  childPugh,
  calculateDose,
  bsaDose,
  infusionRate,
  idealBodyWeight,
  convertUnit,
  temperatureConvert,
  meanArterialPressure,
  anionGap,
  correctedCalcium,
  oxygenIndex,
  parseVitalSigns,
  vitalsReport,
} from '../../src/agent/tools/med.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('med tools', () => {
  describe('bmi', () => {
    it('should calculate BMI for normal weight', async () => {
      const result = await bmi(70, 1.75);
      expect(result.success).toBe(true);
      expect(result.data).toContain('22.9');
      expect(result.data).toContain('正常范围');
    });

    it('should calculate BMI for overweight', async () => {
      const result = await bmi(85, 1.75);
      expect(result.success).toBe(true);
      expect(result.data).toContain('超重');
    });

    it('should calculate BMI for obese', async () => {
      const result = await bmi(95, 1.75);
      expect(result.success).toBe(true);
      expect(result.data).toContain('肥胖');
    });

    it('should calculate BMI for underweight', async () => {
      const result = await bmi(50, 1.75);
      expect(result.success).toBe(true);
      expect(result.data).toContain('偏瘦');
    });

    it('should reject invalid values', async () => {
      const result = await bmi(0, 1.75);
      expect(result.success).toBe(false);
    });
  });

  describe('bsa', () => {
    it('should calculate BSA using Mosteller formula', async () => {
      const result = await bsa(70, 175);
      expect(result.success).toBe(true);
      expect(result.data).toContain('Mosteller');
    });

    it('should calculate BSA using Du Bois formula', async () => {
      const result = await bsa(70, 175, 'dubois');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Du Bois');
    });

    it('should calculate BSA using Haycock formula', async () => {
      const result = await bsa(70, 175, 'haycock');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Haycock');
    });

    it('should reject invalid formula', async () => {
      const result = await bsa(70, 175, 'invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('egfr', () => {
    it('should calculate eGFR for male', async () => {
      const result = await egfr(1.0, 60, 'male');
      expect(result.success).toBe(true);
      expect(result.data).toContain('eGFR');
    });

    it('should calculate eGFR for female', async () => {
      const result = await egfr(0.8, 60, 'female');
      expect(result.success).toBe(true);
    });

    it('should reject invalid gender', async () => {
      const result = await egfr(1.0, 60, 'invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('crcl', () => {
    it('should calculate CrCl for male', async () => {
      const result = await crcl(1.0, 60, 70, 'male');
      expect(result.success).toBe(true);
      expect(result.data).toContain('CrCl');
    });

    it('should calculate CrCl for female', async () => {
      const result = await crcl(0.8, 60, 60, 'female');
      expect(result.success).toBe(true);
    });
  });

  describe('childPugh', () => {
    it('should calculate Child-Pugh score', async () => {
      const result = await childPugh(1.5, 4.0, 1.5, 'none', 'none');
      expect(result.success).toBe(true);
      expect(result.data).toContain('Child-Pugh');
    });
  });

  describe('calculateDose', () => {
    it('should calculate dose by weight', async () => {
      const result = await calculateDose(70, 5, 'mg');
      expect(result.success).toBe(true);
      expect(result.data).toContain('350.00');
    });

    it('should reject invalid weight', async () => {
      const result = await calculateDose(0, 5, 'mg');
      expect(result.success).toBe(false);
    });
  });

  describe('bsaDose', () => {
    it('should calculate BSA dose', async () => {
      const result = await bsaDose(1.8, 100, 'mg');
      expect(result.success).toBe(true);
      expect(result.data).toContain('180.00');
    });
  });

  describe('infusionRate', () => {
    it('should calculate rate in mL/h', async () => {
      const result = await infusionRate(500, 2, 'h');
      expect(result.success).toBe(true);
      expect(result.data).toContain('250.0');
    });

    it('should calculate rate in mL/min', async () => {
      const result = await infusionRate(500, 60, 'min');
      expect(result.success).toBe(true);
    });

    it('should reject invalid time unit', async () => {
      const result = await infusionRate(500, 2, 'invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('idealBodyWeight', () => {
    it('should calculate IBW for male', async () => {
      const result = await idealBodyWeight(175, 'male');
      expect(result.success).toBe(true);
    });

    it('should calculate IBW for female', async () => {
      const result = await idealBodyWeight(165, 'female');
      expect(result.success).toBe(true);
    });
  });

  describe('convertUnit', () => {
    it('should convert glucose mg/dL to mmol/L', async () => {
      const result = await convertUnit(100, 'mg/dL', 'mmol/L');
      expect(result.success).toBe(true);
      expect(result.data).toContain('葡萄糖');
    });

    it('should convert creatinine mg/dL to μmol/L', async () => {
      const result = await convertUnit(1.0, 'mg/dL', 'umol/L');
      expect(result.success).toBe(true);
      expect(result.data).toContain('肌酐');
    });

    it('should convert mmHg to kPa', async () => {
      const result = await convertUnit(120, 'mmHg', 'kPa');
      expect(result.success).toBe(true);
      expect(result.data).toContain('血压');
    });

    it('should reject unsupported conversion', async () => {
      const result = await convertUnit(100, 'kg', 'lb');
      expect(result.success).toBe(false);
    });
  });

  describe('temperatureConvert', () => {
    it('should convert Celsius to Fahrenheit', async () => {
      const result = await temperatureConvert(25, 'c', 'f');
      expect(result.success).toBe(true);
      expect(result.data).toContain('77.00');
    });

    it('should convert Fahrenheit to Celsius', async () => {
      const result = await temperatureConvert(77, 'f', 'c');
      expect(result.success).toBe(true);
    });

    it('should convert Celsius to Kelvin', async () => {
      const result = await temperatureConvert(0, 'c', 'k');
      expect(result.success).toBe(true);
      expect(result.data).toContain('273.15');
    });

    it('should reject invalid units', async () => {
      const result = await temperatureConvert(25, 'invalid', 'c');
      expect(result.success).toBe(false);
    });
  });

  describe('meanArterialPressure', () => {
    it('should calculate MAP', async () => {
      const result = await meanArterialPressure(120, 80);
      expect(result.success).toBe(true);
      expect(result.data).toContain('93');
    });
  });

  describe('anionGap', () => {
    it('should calculate anion gap', async () => {
      const result = await anionGap(140, 100, 24);
      expect(result.success).toBe(true);
      expect(result.data).toContain('16');
    });

    it('should reject missing parameters', async () => {
      const result = await anionGap(140, 100, undefined);
      expect(result.success).toBe(false);
    });
  });

  describe('correctedCalcium', () => {
    it('should calculate corrected calcium', async () => {
      const result = await correctedCalcium(8.5, 3.5);
      expect(result.success).toBe(true);
    });
  });

  describe('oxygenIndex', () => {
    it('should calculate oxygen index with decimal FiO2', async () => {
      const result = await oxygenIndex(100, 0.5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('200');
    });

    it('should calculate oxygen index with percentage FiO2', async () => {
      const result = await oxygenIndex(100, 50);
      expect(result.success).toBe(true);
    });

    it('should reject invalid FiO2', async () => {
      const result = await oxygenIndex(100, 200);
      expect(result.success).toBe(false);
    });
  });

  describe('parseVitalSigns', () => {
    let tempDir: string;
    let csvPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'med-vitals-test-'));
      csvPath = path.join(tempDir, 'vitals.csv');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should parse vital signs CSV', async () => {
      const csvContent = `timestamp,bp_sys,bp_dia,hr,temp,rr,spo2
2024-01-01 08:00,120,80,75,36.5,18,98
2024-01-01 09:00,118,78,72,36.6,16,99
`;
      await fs.writeFile(csvPath, csvContent, 'utf-8');
      const result = await parseVitalSigns(csvPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('2 条记录');
    });

    it('should reject file with only header', async () => {
      await fs.writeFile(csvPath, 'timestamp,bp_sys,bp_dia\n', 'utf-8');
      const result = await parseVitalSigns(csvPath);
      expect(result.success).toBe(false);
    });

    it('should handle file not found', async () => {
      const result = await parseVitalSigns(path.join(tempDir, 'nonexistent.csv'));
      expect(result.success).toBe(false);
    });
  });

  describe('vitalsReport', () => {
    let tempDir: string;
    let csvPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'med-report-test-'));
      csvPath = path.join(tempDir, 'vitals.csv');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should generate vital signs report', async () => {
      const csvContent = `timestamp,bp_sys,bp_dia,hr
2024-01-01 08:00,120,80,75
2024-01-01 09:00,118,78,72
2024-01-01 10:00,122,82,78
`;
      await fs.writeFile(csvPath, csvContent, 'utf-8');
      const result = await vitalsReport(csvPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('生命体征统计报告');
    });

    it('should reject file with only header', async () => {
      await fs.writeFile(csvPath, 'timestamp,bp_sys\n', 'utf-8');
      const result = await vitalsReport(csvPath);
      expect(result.success).toBe(false);
    });
  });
});
