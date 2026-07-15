/**
 * 医学工具（Medicine）
 * 提供临床评分计算、药物剂量、单位换算、生理参数分析等功能
 * 第一梯队：零外部依赖，纯数学计算
 */

import fs from 'fs/promises';
import path from 'path';
import { getBasePath } from './path.ts';

// ============================================
// 医学单位换算系数表
// ============================================
const UNIT_CONVERSIONS: any = {
  'glucose': {
    'mg/dL': 1, 'mmol/L': 0.0555,
    label: '葡萄糖'
  },
  'creatinine': {
    'mg/dL': 1, 'μmol/L': 88.4, 'umol/L': 88.4,
    label: '肌酐'
  },
  'bun': {
    'mg/dL': 1, 'mmol/L': 0.357,
    label: '尿素氮'
  },
  'bilirubin': {
    'mg/dL': 1, 'μmol/L': 17.1, 'umol/L': 17.1,
    label: '胆红素'
  },
  'calcium': {
    'mg/dL': 1, 'mmol/L': 0.2495,
    label: '钙'
  },
  'cholesterol': {
    'mg/dL': 1, 'mmol/L': 0.0259,
    label: '胆固醇'
  },
  'triglycerides': {
    'mg/dL': 1, 'mmol/L': 0.0113,
    label: '甘油三酯'
  }
};

// ============================================
// 临床评分计算
// ============================================

/**
 * BMI 体重指数计算
 * @param {number} weight - 体重（kg）
 * @param {number} height - 身高（m）
 * @returns {Promise<Object>}
 */
async function bmi(weight: any, height: any): Promise<any> {
  try {
    if (!weight || !height || weight <= 0 || height <= 0) {
      return { success: false, error: '体重和身高必须为正数' };
    }
    const value = weight / (height * height);
    const rounded = Math.round(value * 10) / 10;

    let category;
    if (rounded < 18.5) category = '偏瘦';
    else if (rounded < 24) category = '正常范围';
    else if (rounded < 28) category = '超重';
    else category = '肥胖';

    return {
      success: true,
      data: `BMI: ${rounded} (${category})`
    };
  } catch (error: any) {
    return { success: false, error: `BMI 计算失败: ${error.message}` };
  }
}

/**
 * 体表面积 BSA 计算
 * @param {number} weight - 体重（kg）
 * @param {number} height - 身高（cm）
 * @param {string} [formula='mosteller'] - 公式：'mosteller' | 'dubois' | 'haycock'
 * @returns {Promise<Object>}
 */
async function bsa(weight: any, height: any, formula: string = 'mosteller'): Promise<any> {
  try {
    if (!weight || !height || weight <= 0 || height <= 0) {
      return { success: false, error: '体重和身高必须为正数' };
    }

    const f = formula.toLowerCase().trim();
    let value, formulaName;

    switch (f) {
      case 'mosteller':
        value = Math.sqrt((height * weight) / 3600);
        formulaName = 'Mosteller';
        break;
      case 'dubois':
        value = 0.007184 * Math.pow(weight, 0.425) * Math.pow(height, 0.725);
        formulaName = 'Du Bois';
        break;
      case 'haycock':
        value = 0.024265 * Math.pow(weight, 0.5378) * Math.pow(height, 0.3964);
        formulaName = 'Haycock';
        break;
      default:
        return { success: false, error: `不支持的公式: ${formula}，仅支持 mosteller、dubois、haycock` };
    }

    return {
      success: true,
      data: `BSA (${formulaName}): ${value.toFixed(4)} m²`
    };
  } catch (error: any) {
    return { success: false, error: `BSA 计算失败: ${error.message}` };
  }
}

/**
 * eGFR 估算肾小球滤过率（CKD-EPI 2021 公式）
 * @param {number} creatinine - 血肌酐（mg/dL）
 * @param {number} age - 年龄（岁）
 * @param {string} gender - 性别：'male' 或 'female'
 * @returns {Promise<Object>}
 */
async function egfr(creatinine: any, age: any, gender: any): Promise<any> {
  try {
    if (!creatinine || creatinine <= 0) return { success: false, error: '肌酐值必须为正数' };
    if (!age || age <= 0 || age > 150) return { success: false, error: '年龄无效' };

    const g = gender.toLowerCase().trim();
    if (g !== 'male' && g !== 'female') {
      return { success: false, error: '性别仅支持 male 或 female' };
    }

    const cr = creatinine;
    const isFemale = g === 'female';
    let k, a, scale;

    if (isFemale) {
      scale = 0.7;
      a = cr <= 0.7 ? -0.241 : -1.200;
      k = 1.012;
    } else {
      scale = 0.9;
      a = cr <= 0.9 ? -0.302 : -1.200;
      k = 1.0;
    }

    const value = 142 * Math.pow(cr / scale, a) * Math.pow(0.9938, age) * k;
    const rounded = Math.round(value);

    let stage;
    if (rounded >= 90) stage = 'G1（正常或升高）';
    else if (rounded >= 60) stage = 'G2（轻度下降）';
    else if (rounded >= 45) stage = 'G3a（轻到中度下降）';
    else if (rounded >= 30) stage = 'G3b（中到重度下降）';
    else if (rounded >= 15) stage = 'G4（重度下降）';
    else stage = 'G5（肾衰竭）';

    return {
      success: true,
      data: `eGFR (CKD-EPI 2021): ${rounded} mL/min/1.73m²\nCKD 分期: ${stage}`
    };
  } catch (error: any) {
    return { success: false, error: `eGFR 计算失败: ${error.message}` };
  }
}

/**
 * 肌酐清除率 CrCl（Cockcroft-Gault 公式）
 * @param {number} creatinine - 血肌酐（mg/dL）
 * @param {number} age - 年龄（岁）
 * @param {number} weight - 体重（kg）
 * @param {string} gender - 性别：'male' 或 'female'
 * @returns {Promise<Object>}
 */
async function crcl(creatinine: any, age: any, weight: any, gender: any): Promise<any> {
  try {
    if (!creatinine || creatinine <= 0) return { success: false, error: '肌酐值必须为正数' };
    if (!age || age <= 0 || age > 150) return { success: false, error: '年龄无效' };
    if (!weight || weight <= 0) return { success: false, error: '体重必须为正数' };

    const g = gender.toLowerCase().trim();
    if (g !== 'male' && g !== 'female') {
      return { success: false, error: '性别仅支持 male 或 female' };
    }

    const factor = g === 'female' ? 0.85 : 1.0;
    const value = ((140 - age) * weight * factor) / (72 * creatinine);
    const rounded = Math.round(value * 10) / 10;

    return {
      success: true,
      data: `CrCl (Cockcroft-Gault): ${rounded} mL/min`
    };
  } catch (error: any) {
    return { success: false, error: `CrCl 计算失败: ${error.message}` };
  }
}

/**
 * Child-Pugh 肝功能分级
 * @param {number} bilirubin - 总胆红素（mg/dL）
 * @param {number} albumin - 白蛋白（g/dL）
 * @param {number} inr - INR
 * @param {string} ascites - 腹水：'none' | 'mild' | 'moderate'
 * @param {string} encephalopathy - 肝性脑病：'none' | 'grade1-2' | 'grade3-4'
 * @returns {Promise<Object>}
 */
async function childPugh(bilirubin: any, albumin: any, inr: any, ascites: any, encephalopathy: any): Promise<any> {
  try {
    const points: any = {};

    // 胆红素评分
    if (bilirubin < 2) points.bilirubin = 1;
    else if (bilirubin <= 3) points.bilirubin = 2;
    else points.bilirubin = 3;

    // 白蛋白评分
    if (albumin > 3.5) points.albumin = 1;
    else if (albumin >= 2.8) points.albumin = 2;
    else points.albumin = 3;

    // INR 评分
    if (inr < 1.7) points.inr = 1;
    else if (inr <= 2.3) points.inr = 2;
    else points.inr = 3;

    // 腹水评分
    const a = (ascites || '').toLowerCase().trim();
    if (a === 'none' || a === '无') points.ascites = 1;
    else if (a === 'mild' || a === '轻度') points.ascites = 2;
    else points.ascites = 3;

    // 肝性脑病评分
    const e = (encephalopathy || '').toLowerCase().trim();
    if (e === 'none' || e === '无') points.encephalopathy = 1;
    else if (e === 'grade1-2' || e === '1-2级' || e === 'i-ii') points.encephalopathy = 2;
    else points.encephalopathy = 3;

    const total = Object.values(points).reduce((s: number, v: any) => s + v, 0);
    let grade;
    if (total <= 6) grade = 'A（代偿期）';
    else if (total <= 9) grade = 'B（轻度失代偿）';
    else grade = 'C（重度失代偿）';

    return {
      success: true,
      data: `Child-Pugh 评分: ${total} 分\n分级: ${grade}\n胆红素: ${points.bilirubin}分, 白蛋白: ${points.albumin}分, INR: ${points.inr}分, 腹水: ${points.ascites}分, 肝性脑病: ${points.encephalopathy}分`
    };
  } catch (error: any) {
    return { success: false, error: `Child-Pugh 计算失败: ${error.message}` };
  }
}

// ============================================
// 药物剂量计算
// ============================================

/**
 * 按体重计算药物剂量
 * @param {number} weight - 体重（kg）
 * @param {number} dosePerKg - 每公斤剂量
 * @param {string} [unit='mg'] - 单位
 * @returns {Promise<Object>}
 */
async function calculateDose(weight: any, dosePerKg: any, unit: string = 'mg'): Promise<any> {
  try {
    if (!weight || weight <= 0) return { success: false, error: '体重必须为正数' };
    if (!dosePerKg || dosePerKg <= 0) return { success: false, error: '剂量必须为正数' };

    const total = weight * dosePerKg;
    return {
      success: true,
      data: `单次剂量: ${total.toFixed(2)} ${unit}（${dosePerKg} ${unit}/kg × ${weight} kg）`
    };
  } catch (error: any) {
    return { success: false, error: `剂量计算失败: ${error.message}` };
  }
}

/**
 * 按体表面积计算剂量（化疗常用）
 * @param {number} bsaValue - 体表面积（m²）
 * @param {number} dosePerM2 - 每平方米剂量
 * @param {string} [unit='mg'] - 单位
 * @returns {Promise<Object>}
 */
async function bsaDose(bsaValue: any, dosePerM2: any, unit: string = 'mg'): Promise<any> {
  try {
    if (!bsaValue || bsaValue <= 0) return { success: false, error: '体表面积必须为正数' };
    if (!dosePerM2 || dosePerM2 <= 0) return { success: false, error: '剂量必须为正数' };

    const total = bsaValue * dosePerM2;
    return {
      success: true,
      data: `BSA 剂量: ${total.toFixed(2)} ${unit}（${dosePerM2} ${unit}/m² × ${bsaValue.toFixed(4)} m²）`
    };
  } catch (error: any) {
    return { success: false, error: `BSA 剂量计算失败: ${error.message}` };
  }
}

/**
 * 输液速度计算
 * @param {number} volume - 液体总量（mL）
 * @param {number} time - 时间
 * @param {string} [timeUnit='h'] - 时间单位：'h'（小时）或 'min'（分钟）
 * @returns {Promise<Object>}
 */
async function infusionRate(volume: any, time: any, timeUnit: string = 'h'): Promise<any> {
  try {
    if (!volume || volume <= 0) return { success: false, error: '液体总量必须为正数' };
    if (!time || time <= 0) return { success: false, error: '时间必须为正数' };

    const unit = timeUnit.toLowerCase().trim();
    let rate, unitLabel;

    if (unit === 'h' || unit === 'hour' || unit === '小时') {
      rate = volume / time;
      unitLabel = 'mL/h';
    } else if (unit === 'min' || unit === 'minute' || unit === '分钟') {
      rate = volume / time;
      unitLabel = 'mL/min';
      const ratePerHour = rate * 60;
      return {
        success: true,
        data: `输液速度: ${rate.toFixed(1)} ${unitLabel}（约 ${ratePerHour.toFixed(1)} mL/h）`
      };
    } else {
      return { success: false, error: `不支持的时间单位: ${timeUnit}，仅支持 h（小时）或 min（分钟）` };
    }

    return {
      success: true,
      data: `输液速度: ${rate.toFixed(1)} ${unitLabel}`
    };
  } catch (error: any) {
    return { success: false, error: `输液速度计算失败: ${error.message}` };
  }
}

/**
 * 理想体重计算（Devine 公式）
 * @param {number} height - 身高（cm）
 * @param {string} gender - 性别：'male' 或 'female'
 * @returns {Promise<Object>}
 */
async function idealBodyWeight(height: any, gender: any): Promise<any> {
  try {
    if (!height || height <= 0) return { success: false, error: '身高必须为正数' };

    const g = gender.toLowerCase().trim();
    if (g !== 'male' && g !== 'female') {
      return { success: false, error: '性别仅支持 male 或 female' };
    }

    const excess = height - 152;
    let ibw;
    if (g === 'male') {
      ibw = 50 + 0.9 * excess;
    } else {
      ibw = 45.5 + 0.9 * excess;
    }

    return {
      success: true,
      data: `理想体重 (Devine): ${ibw.toFixed(1)} kg`
    };
  } catch (error: any) {
    return { success: false, error: `理想体重计算失败: ${error.message}` };
  }
}

// ============================================
// 单位换算
// ============================================

/**
 * 医学单位换算
 * @param {number} value - 数值
 * @param {string} from - 源单位
 * @param {string} to - 目标单位
 * @returns {Promise<Object>}
 */
async function convertUnit(value: any, from: any, to: any): Promise<any> {
  try {
    if (value === undefined || value === null) {
      return { success: false, error: '请输入数值' };
    }

    const fromNorm = from.toLowerCase().trim().replace(/[^a-z0-9/]/g, '');
    const toNorm = to.toLowerCase().trim().replace(/[^a-z0-9/]/g, '');

    // 生化换算
    const conversions: any[] = [
      // 葡萄糖 mg/dL ↔ mmol/L
      { test: (f: string, t: string) => (f.includes('mg/dl') || f === 'mg%') && (t === 'mmol/l' || t === 'mmoll'), calc: (v: number) => v * 0.0555, label: '葡萄糖' },
      { test: (f: string, t: string) => (f === 'mmol/l' || f === 'mmoll') && (t.includes('mg/dl') || t === 'mg%'), calc: (v: number) => v / 0.0555, label: '葡萄糖' },
      // 肌酐 mg/dL ↔ μmol/L
      { test: (f: string, t: string) => f.includes('mg/dl') && (t.includes('μmol/l') || t.includes('umol/l')), calc: (v: number) => v * 88.4, label: '肌酐' },
      { test: (f: string, t: string) => (f.includes('μmol/l') || f.includes('umol/l')) && t.includes('mg/dl'), calc: (v: number) => v / 88.4, label: '肌酐' },
      // 尿素氮 mg/dL ↔ mmol/L
      { test: (f: string, t: string) => f.includes('mg/dl') && t.includes('mmol/l'), calc: (v: number) => v * 0.357, label: '尿素氮' },
      { test: (f: string, t: string) => f.includes('mmol/l') && t.includes('mg/dl'), calc: (v: number) => v / 0.357, label: '尿素氮' },
      // 胆红素 mg/dL ↔ μmol/L
      { test: (f: string, t: string) => f.includes('mg/dl') && (t.includes('μmol/l') || t.includes('umol/l')), calc: (v: number) => v * 17.1, label: '胆红素' },
      { test: (f: string, t: string) => (f.includes('μmol/l') || f.includes('umol/l')) && t.includes('mg/dl'), calc: (v: number) => v / 17.1, label: '胆红素' },
      // 钙 mg/dL ↔ mmol/L
      { test: (f: string, t: string) => f.includes('mg/dl') && t.includes('mmol/l'), calc: (v: number) => v * 0.2495, label: '钙' },
      { test: (f: string, t: string) => f.includes('mmol/l') && t.includes('mg/dl'), calc: (v: number) => v / 0.2495, label: '钙' },
      // 胆固醇 mg/dL ↔ mmol/L
      { test: (f: string, t: string) => f.includes('mg/dl') && t.includes('mmol/l'), calc: (v: number) => v * 0.0259, label: '胆固醇' },
      { test: (f: string, t: string) => f.includes('mmol/l') && t.includes('mg/dl'), calc: (v: number) => v / 0.0259, label: '胆固醇' },
      // 甘油三酯 mg/dL ↔ mmol/L
      { test: (f: string, t: string) => f.includes('mg/dl') && t.includes('mmol/l'), calc: (v: number) => v * 0.0113, label: '甘油三酯' },
      { test: (f: string, t: string) => f.includes('mmol/l') && t.includes('mg/dl'), calc: (v: number) => v / 0.0113, label: '甘油三酯' },
      // 血压 mmHg ↔ kPa
      { test: (f: string, t: string) => (f.includes('mmhg') || f === 'mmhg') && (t.includes('kpa') || t === 'kpa'), calc: (v: number) => v * 0.1333, label: '血压' },
      { test: (f: string, t: string) => (f.includes('kpa') || f === 'kpa') && (t.includes('mmhg') || t === 'mmhg'), calc: (v: number) => v / 0.1333, label: '血压' },
    ];

    for (const conv of conversions) {
      if (conv.test(fromNorm, toNorm)) {
        const result = conv.calc(value);
        return {
          success: true,
          data: `${conv.label}: ${value} ${from} = ${result.toFixed(4)} ${to}`
        };
      }
    }

    return { success: false, error: `不支持的换算对: ${from} → ${to}。支持：葡萄糖、肌酐、尿素氮、胆红素、钙、胆固醇、甘油三酯的 mg/dL↔mmol/L 互转，以及 mmHg↔kPa` };
  } catch (error: any) {
    return { success: false, error: `单位换算失败: ${error.message}` };
  }
}

/**
 * 温度换算
 * @param {number} value - 温度值
 * @param {string} from - 源单位：'c'（℃）、'f'（℉）、'k'（K）
 * @param {string} to - 目标单位
 * @returns {Promise<Object>}
 */
async function temperatureConvert(value: any, from: any, to: any): Promise<any> {
  try {
    if (value === undefined || value === null) {
      return { success: false, error: '请输入温度值' };
    }

    const f = from.toLowerCase().trim();
    const t = to.toLowerCase().trim();
    const validUnits = ['c', 'celsius', '℃', 'f', 'fahrenheit', '℉', 'k', 'kelvin', 'k'];

    const normalize = (u: string): any => {
      if (u === 'c' || u === 'celsius' || u === '℃') return 'c';
      if (u === 'f' || u === 'fahrenheit' || u === '℉') return 'f';
      if (u === 'k' || u === 'kelvin') return 'k';
      return null;
    };

    const fromUnit = normalize(f);
    const toUnit = normalize(t);
    if (!fromUnit || !toUnit) {
      return { success: false, error: '温度单位仅支持 ℃、℉、K' };
    }

    // 先转摄氏度
    let celsius;
    if (fromUnit === 'c') celsius = value;
    else if (fromUnit === 'f') celsius = (value - 32) * 5 / 9;
    else celsius = value - 273.15;

    // 从摄氏度转目标
    let result, unitLabel;
    if (toUnit === 'c') { result = celsius; unitLabel = '℃'; }
    else if (toUnit === 'f') { result = celsius * 9 / 5 + 32; unitLabel = '℉'; }
    else { result = celsius + 273.15; unitLabel = 'K'; }

    return {
      success: true,
      data: `${value}${fromUnit === 'c' ? '℃' : fromUnit === 'f' ? '℉' : 'K'} = ${result.toFixed(2)} ${unitLabel}`
    };
  } catch (error: any) {
    return { success: false, error: `温度换算失败: ${error.message}` };
  }
}

// ============================================
// 生理参数计算
// ============================================

/**
 * 平均动脉压 MAP
 * @param {number} sbp - 收缩压（mmHg）
 * @param {number} dbp - 舒张压（mmHg）
 * @returns {Promise<Object>}
 */
async function meanArterialPressure(sbp: any, dbp: any): Promise<any> {
  try {
    if (!sbp || !dbp || sbp <= 0 || dbp <= 0) {
      return { success: false, error: '血压值必须为正数' };
    }
    const map = (sbp + 2 * dbp) / 3;
    return {
      success: true,
      data: `MAP: ${Math.round(map)} mmHg（SBP ${sbp}, DBP ${dbp}）`
    };
  } catch (error: any) {
    return { success: false, error: `MAP 计算失败: ${error.message}` };
  }
}

/**
 * 阴离子间隙 AG
 * @param {number} na - 血钠（mmol/L）
 * @param {number} cl - 血氯（mmol/L）
 * @param {number} hco3 - 碳酸氢根（mmol/L）
 * @returns {Promise<Object>}
 */
async function anionGap(na: any, cl: any, hco3: any): Promise<any> {
  try {
    if (!na || !cl || !hco3) {
      return { success: false, error: '所有参数都必须提供' };
    }
    const ag = na - (cl + hco3);
    let interpretation;
    if (ag < 8) interpretation = '偏低（可能为低白蛋白血症）';
    else if (ag <= 12) interpretation = '正常范围';
    else interpretation = '升高（提示阴离子间隙性代谢性酸中毒）';

    return {
      success: true,
      data: `阴离子间隙: ${ag.toFixed(1)} mmol/L（${interpretation}）`
    };
  } catch (error: any) {
    return { success: false, error: `阴离子间隙计算失败: ${error.message}` };
  }
}

/**
 * 校正钙
 * @param {number} calcium - 实测血钙（mg/dL）
 * @param {number} albumin - 白蛋白（g/dL）
 * @returns {Promise<Object>}
 */
async function correctedCalcium(calcium: any, albumin: any): Promise<any> {
  try {
    if (!calcium || calcium <= 0) return { success: false, error: '血钙值必须为正数' };
    if (albumin === undefined || albumin === null) return { success: false, error: '请提供白蛋白值' };

    const corrected = calcium + 0.8 * (4 - albumin);
    return {
      success: true,
      data: `校正钙: ${corrected.toFixed(2)} mg/dL（实测 ${calcium} mg/dL，白蛋白 ${albumin} g/dL）`
    };
  } catch (error: any) {
    return { success: false, error: `校正钙计算失败: ${error.message}` };
  }
}

/**
 * 氧合指数 PaO2/FiO2
 * @param {number} pao2 - 动脉血氧分压（mmHg）
 * @param {number} fio2 - 吸入氧浓度（百分比 21-100，或小数 0.21-1.0）
 * @returns {Promise<Object>}
 */
async function oxygenIndex(pao2: any, fio2: any): Promise<any> {
  try {
    if (!pao2 || pao2 <= 0) return { success: false, error: 'PaO2 必须为正数' };
    if (!fio2 || fio2 <= 0) return { success: false, error: 'FiO2 必须为正数' };

    // 处理 FiO2 是百分比还是小数
    const fio2Decimal = fio2 > 1 ? fio2 / 100 : fio2;
    if (fio2Decimal <= 0 || fio2Decimal > 1) {
      return { success: false, error: 'FiO2 必须在 0.21-1.0（小数）或 21-100（百分比）之间' };
    }

    const pfRatio = pao2 / fio2Decimal;
    const rounded = Math.round(pfRatio);

    let interpretation;
    if (rounded >= 400) interpretation = '正常';
    else if (rounded >= 300) interpretation = '轻度低氧血症';
    else if (rounded >= 200) interpretation = '中度低氧血症（符合 ARDS 标准）';
    else interpretation = '重度低氧血症（严重 ARDS）';

    return {
      success: true,
      data: `PaO₂/FiO₂: ${rounded} mmHg（${interpretation}）`
    };
  } catch (error: any) {
    return { success: false, error: `氧合指数计算失败: ${error.message}` };
  }
}

// ============================================
// 数据格式处理
// ============================================

/**
 * 解析生命体征记录
 * 支持 CSV 格式：timestamp, bp_sys, bp_dia, hr, temp, rr, spo2
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>}
 */
async function parseVitalSigns(filePath: string): Promise<any> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      return { success: false, error: '文件至少需要表头行和一行数据' };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const records: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim());
      if (vals.length !== headers.length) continue;
      const record: any = {};
      for (let j = 0; j < headers.length; j++) {
        const num = parseFloat(vals[j]);
        record[headers[j]] = isNaN(num) ? vals[j] : num;
      }
      records.push(record);
    }

    if (records.length === 0) {
      return { success: false, error: '未能解析有效记录' };
    }

    // 识别常见字段
    const fieldMap: any = {
      hr: { label: '心率', unit: 'bpm' },
      temp: { label: '体温', unit: '℃' },
      rr: { label: '呼吸频率', unit: '次/min' },
      spo2: { label: '血氧饱和度', unit: '%' },
      bp_sys: { label: '收缩压', unit: 'mmHg' },
      bp_dia: { label: '舒张压', unit: 'mmHg' }
    };

    const summary: any = {};
    for (const [field, meta] of Object.entries(fieldMap)) {
      const values = records.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
      if (values.length > 0) {
        const avg = values.reduce((s: number, v: number) => s + v, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        summary[(meta as any).label] = {
          avg: avg.toFixed(1),
          min: min,
          max: max,
          unit: (meta as any).unit,
          count: values.length
        };
      }
    }

    return {
      success: true,
      data: `共 ${records.length} 条记录\n` +
        Object.entries(summary).map(([name, s]: any) =>
          `  ${name}: ${s.avg} ${s.unit}（范围 ${s.min}-${s.max}，${s.count} 次测量）`
        ).join('\n')
    };
  } catch (error: any) {
    return { success: false, error: `解析生命体征失败: ${error.message}` };
  }
}

/**
 * 生命体征汇总报告
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>}
 */
async function vitalsReport(filePath: string): Promise<any> {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
      return { success: false, error: '文件至少需要表头行和一行数据' };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const records: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim());
      if (vals.length !== headers.length) continue;
      const record: any = {};
      for (let j = 0; j < headers.length; j++) {
        const num = parseFloat(vals[j]);
        record[headers[j]] = isNaN(num) ? vals[j] : num;
      }
      records.push(record);
    }

    if (records.length === 0) {
      return { success: false, error: '未能解析有效记录' };
    }

    // 整体统计
    const numericFields = Object.keys(records[0]).filter(k =>
      typeof records[0][k] === 'number'
    );

    const stats: any = {};
    for (const field of numericFields) {
      const values = records.map(r => r[field]).filter(v => !isNaN(v)).sort((a: number, b: number) => a - b);
      if (values.length === 0) continue;
      const sum = values.reduce((s: number, v: number) => s + v, 0);
      const mean = sum / values.length;
      const median = values.length % 2 === 0
        ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
        : values[Math.floor(values.length / 2)];
      const std = Math.sqrt(values.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / values.length);

      stats[field] = {
        mean: mean.toFixed(2),
        median: median.toFixed(2),
        std: std.toFixed(2),
        min: values[0],
        max: values[values.length - 1],
        count: values.length
      };
    }

    return {
      success: true,
      data: `生命体征统计报告（共 ${records.length} 条记录，${Object.keys(stats).length} 个指标）:\n\n` +
        Object.entries(stats).map(([field, s]: any) =>
          `  ${field}:\n` +
          `    均值: ${s.mean}，中位数: ${s.median}\n` +
          `    标准差: ${s.std}，范围: ${s.min} - ${s.max}\n` +
          `    有效测量: ${s.count} 次`
        ).join('\n\n')
    };
  } catch (error: any) {
    return { success: false, error: `生成报告失败: ${error.message}` };
  }
}

export {
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
  vitalsReport
};
