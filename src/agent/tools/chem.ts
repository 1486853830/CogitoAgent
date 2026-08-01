/**
 * 化学工具（Chemistry）
 * 提供分子式解析、分子量计算、溶液计算、气体定律、元素周期表查询等功能
 * 零外部依赖
 */

// ============================================
// 元素周期表（常用元素）
// ============================================
const ELEMENTS: any = {
  H: { z: 1, mass: 1.008, symbol: 'H', name: '氢', nameEn: 'Hydrogen', period: 1, group: 1 },
  He: { z: 2, mass: 4.003, symbol: 'He', name: '氦', nameEn: 'Helium', period: 1, group: 18 },
  Li: { z: 3, mass: 6.941, symbol: 'Li', name: '锂', nameEn: 'Lithium', period: 2, group: 1 },
  Be: { z: 4, mass: 9.012, symbol: 'Be', name: '铍', nameEn: 'Beryllium', period: 2, group: 2 },
  B: { z: 5, mass: 10.81, symbol: 'B', name: '硼', nameEn: 'Boron', period: 2, group: 13 },
  C: { z: 6, mass: 12.011, symbol: 'C', name: '碳', nameEn: 'Carbon', period: 2, group: 14 },
  N: { z: 7, mass: 14.007, symbol: 'N', name: '氮', nameEn: 'Nitrogen', period: 2, group: 15 },
  O: { z: 8, mass: 15.999, symbol: 'O', name: '氧', nameEn: 'Oxygen', period: 2, group: 16 },
  F: { z: 9, mass: 18.998, symbol: 'F', name: '氟', nameEn: 'Fluorine', period: 2, group: 17 },
  Ne: { z: 10, mass: 20.18, symbol: 'Ne', name: '氖', nameEn: 'Neon', period: 2, group: 18 },
  Na: { z: 11, mass: 22.99, symbol: 'Na', name: '钠', nameEn: 'Sodium', period: 3, group: 1 },
  Mg: { z: 12, mass: 24.305, symbol: 'Mg', name: '镁', nameEn: 'Magnesium', period: 3, group: 2 },
  Al: { z: 13, mass: 26.982, symbol: 'Al', name: '铝', nameEn: 'Aluminium', period: 3, group: 13 },
  Si: { z: 14, mass: 28.086, symbol: 'Si', name: '硅', nameEn: 'Silicon', period: 3, group: 14 },
  P: { z: 15, mass: 30.974, symbol: 'P', name: '磷', nameEn: 'Phosphorus', period: 3, group: 15 },
  S: { z: 16, mass: 32.065, symbol: 'S', name: '硫', nameEn: 'Sulfur', period: 3, group: 16 },
  Cl: { z: 17, mass: 35.453, symbol: 'Cl', name: '氯', nameEn: 'Chlorine', period: 3, group: 17 },
  Ar: { z: 18, mass: 39.948, symbol: 'Ar', name: '氩', nameEn: 'Argon', period: 3, group: 18 },
  K: { z: 19, mass: 39.098, symbol: 'K', name: '钾', nameEn: 'Potassium', period: 4, group: 1 },
  Ca: { z: 20, mass: 40.078, symbol: 'Ca', name: '钙', nameEn: 'Calcium', period: 4, group: 2 },
  Sc: { z: 21, mass: 44.956, symbol: 'Sc', name: '钪', nameEn: 'Scandium', period: 4, group: 3 },
  Ti: { z: 22, mass: 47.867, symbol: 'Ti', name: '钛', nameEn: 'Titanium', period: 4, group: 4 },
  V: { z: 23, mass: 50.942, symbol: 'V', name: '钒', nameEn: 'Vanadium', period: 4, group: 5 },
  Cr: { z: 24, mass: 51.996, symbol: 'Cr', name: '铬', nameEn: 'Chromium', period: 4, group: 6 },
  Mn: { z: 25, mass: 54.938, symbol: 'Mn', name: '锰', nameEn: 'Manganese', period: 4, group: 7 },
  Fe: { z: 26, mass: 55.845, symbol: 'Fe', name: '铁', nameEn: 'Iron', period: 4, group: 8 },
  Co: { z: 27, mass: 58.933, symbol: 'Co', name: '钴', nameEn: 'Cobalt', period: 4, group: 9 },
  Ni: { z: 28, mass: 58.693, symbol: 'Ni', name: '镍', nameEn: 'Nickel', period: 4, group: 10 },
  Cu: { z: 29, mass: 63.546, symbol: 'Cu', name: '铜', nameEn: 'Copper', period: 4, group: 11 },
  Zn: { z: 30, mass: 65.38, symbol: 'Zn', name: '锌', nameEn: 'Zinc', period: 4, group: 12 },
  Br: { z: 35, mass: 79.904, symbol: 'Br', name: '溴', nameEn: 'Bromine', period: 4, group: 17 },
  Ag: { z: 47, mass: 107.868, symbol: 'Ag', name: '银', nameEn: 'Silver', period: 5, group: 11 },
  I: { z: 53, mass: 126.904, symbol: 'I', name: '碘', nameEn: 'Iodine', period: 5, group: 17 },
  Ba: { z: 56, mass: 137.327, symbol: 'Ba', name: '钡', nameEn: 'Barium', period: 6, group: 2 },
  Pt: { z: 78, mass: 195.084, symbol: 'Pt', name: '铂', nameEn: 'Platinum', period: 6, group: 10 },
  Au: { z: 79, mass: 196.967, symbol: 'Au', name: '金', nameEn: 'Gold', period: 6, group: 11 },
  Hg: { z: 80, mass: 200.59, symbol: 'Hg', name: '汞', nameEn: 'Mercury', period: 6, group: 12 },
  Pb: { z: 82, mass: 207.2, symbol: 'Pb', name: '铅', nameEn: 'Lead', period: 6, group: 14 },
};

// ============================================
// 分子式解析
// ============================================

/**
 * 解析化学分子式，返回元素组成
 * 支持：H2SO4, Ca(OH)2, CuSO4·5H2O, CH3COOH
 */
function parseFormula(formula: string): any {
  const clean = formula.replace(/[·∙⋅]/g, '.').trim();
  const stack: any[] = [{}];
  let i = 0;

  while (i < clean.length) {
    const ch = clean[i];

    if (ch === '(') {
      stack.push({});
      i++;
    } else if (ch === ')') {
      const top = stack.pop();
      i++;
      let num = '';
      while (i < clean.length && /\d/.test(clean[i])) {
        num += clean[i];
        i++;
      }
      const multiplier = num ? parseInt(num, 10) : 1;
      for (const [el, cnt] of Object.entries(top)) {
        stack[stack.length - 1][el] =
          (stack[stack.length - 1][el] || 0) + (cnt as number) * multiplier;
      }
    } else if (ch === '.' && i + 1 < clean.length) {
      // 处理水合物分隔符，如 CuSO4·5H2O，跳过
      i++;
      // 检查后面是否跟数字
      let num = '';
      while (i < clean.length && /\d/.test(clean[i])) {
        num += clean[i];
        i++;
      }
      // 数字后面应该是 H2O 之类的，继续正常解析
    } else if (/[A-Z]/.test(ch)) {
      let sym = ch;
      i++;
      while (i < clean.length && /[a-z]/.test(clean[i])) {
        sym += clean[i];
        i++;
      }
      if (!ELEMENTS[sym]) {
        throw new Error(`未知元素: ${sym}`);
      }
      let num = '';
      while (i < clean.length && /\d/.test(clean[i])) {
        num += clean[i];
        i++;
      }
      const count = num ? parseInt(num, 10) : 1;
      stack[stack.length - 1][sym] = (stack[stack.length - 1][sym] || 0) + count;
    } else {
      i++;
    }
  }

  return stack[0];
}

// ============================================
// 工具函数
// ============================================

/**
 * 查询元素信息
 * @param {string} symbol - 元素符号
 * @returns {Promise<Object>}
 */
async function elementInfo(symbol: string): Promise<any> {
  try {
    const sym = symbol.trim();
    const el = ELEMENTS[sym];
    if (!el) {
      return { success: false, error: `未知元素: ${sym}` };
    }
    return {
      success: true,
      data: `${el.symbol} (${el.nameEn}) ${el.name}\n原子序数: ${el.z}\n原子量: ${el.mass} g/mol\n周期: ${el.period}，族: ${el.group}`,
    };
  } catch (error: any) {
    return { success: false, error: `查询失败: ${error.message}` };
  }
}

/**
 * 解析化学分子式并计算分子量
 * @param {string} formula - 化学分子式，如 H2SO4、Ca(OH)2
 * @returns {Promise<Object>}
 */
async function molWeight(formula: string): Promise<any> {
  try {
    const elements = parseFormula(formula);
    let total = 0;
    const details: any[] = [];

    for (const [el, cnt] of Object.entries(elements)) {
      const m = ELEMENTS[el].mass * (cnt as number);
      total += m;
      details.push(`${el}(${ELEMENTS[el].mass}×${cnt})=${m.toFixed(3)}`);
    }

    return {
      success: true,
      data: `${formula} 分子量: ${total.toFixed(3)} g/mol\n${details.join('\n')}`,
    };
  } catch (error: any) {
    return { success: false, error: `分子量计算失败: ${error.message}` };
  }
}

/**
 * 元素百分比组成
 * @param {string} formula - 化学分子式
 * @returns {Promise<Object>}
 */
async function elementComposition(formula: string): Promise<any> {
  try {
    const elements = parseFormula(formula);
    let total = 0;
    const weights: any = {};

    for (const [el, cnt] of Object.entries(elements)) {
      const w = ELEMENTS[el].mass * (cnt as number);
      weights[el] = w;
      total += w;
    }

    const lines = [`${formula} 元素组成（总分子量: ${total.toFixed(3)} g/mol）:\n`];
    for (const [el, w] of Object.entries(weights)) {
      const pct = (((w as number) / total) * 100).toFixed(2);
      lines.push(`  ${el}: ${ELEMENTS[el].name}  ${(w as number).toFixed(3)} g/mol (${pct}%)`);
    }

    return { success: true, data: lines.join('\n') };
  } catch (error: any) {
    return { success: false, error: `元素组成计算失败: ${error.message}` };
  }
}

/**
 * 摩尔浓度计算
 * @param {number} moles - 物质的量（mol）
 * @param {number} volume - 溶液体积（L）
 * @returns {Promise<Object>}
 */
async function molarity(moles: any, volume: any): Promise<any> {
  try {
    if (!moles || moles <= 0) return { success: false, error: '物质的量必须为正数' };
    if (!volume || volume <= 0) return { success: false, error: '体积必须为正数' };

    const M = moles / volume;
    return { success: true, data: `浓度: ${M.toFixed(4)} mol/L (M)` };
  } catch (error: any) {
    return { success: false, error: `浓度计算失败: ${error.message}` };
  }
}

/**
 * 稀释计算 C1V1 = C2V2
 * @param {number} c1 - 初始浓度
 * @param {number} v1 - 初始体积
 * @param {number} c2 - 目标浓度（不传则求）
 * @param {number} v2 - 目标体积（不传则求）
 * @returns {Promise<Object>}
 */
async function dilution(c1: any, v1: any, c2: any, v2: any): Promise<any> {
  try {
    if (!c1 || c1 <= 0) return { success: false, error: '初始浓度必须为正数' };
    if (!v1 || v1 <= 0) return { success: false, error: '初始体积必须为正数' };

    const c2Given = c2 !== undefined && c2 !== null;
    const v2Given = v2 !== undefined && v2 !== null;

    if (c2Given && v2Given) {
      // 验证 C1V1 = C2V2
      const lhs = c1 * v1;
      const rhs = c2 * v2;
      return {
        success: true,
        data: `验证: ${c1}×${v1} = ${lhs.toFixed(4)}，${c2}×${v2} = ${rhs.toFixed(4)}\n两者相差: ${Math.abs(lhs - rhs).toFixed(4)} (${Math.abs(lhs - rhs) < 0.001 ? '一致 ✓' : '不一致 ✗'})`,
      };
    } else if (c2Given) {
      if (c2 <= 0) return { success: false, error: '目标浓度必须为正数' };
      if (c2 >= c1) return { success: false, error: '目标浓度应小于初始浓度' };
      const result = (c1 * v1) / c2;
      return {
        success: true,
        data: `需要最终体积: ${result.toFixed(4)} (${c1}×${v1} = ${c2}×${result.toFixed(4)})`,
      };
    } else if (v2Given) {
      if (v2 <= v1) return { success: false, error: '目标体积应大于初始体积' };
      const result = (c1 * v1) / v2;
      return {
        success: true,
        data: `稀释后浓度: ${result.toFixed(4)} (${c1}×${v1} = ${result.toFixed(4)}×${v2})`,
      };
    } else {
      return { success: false, error: '请至少提供 C2 或 V2 中的一个' };
    }
  } catch (error: any) {
    return { success: false, error: `稀释计算失败: ${error.message}` };
  }
}

/**
 * 由 H⁺ 浓度计算 pH
 * @param {number} h - 氢离子浓度（mol/L）
 * @returns {Promise<Object>}
 */
async function phFromH(h: any): Promise<any> {
  try {
    if (!h || h <= 0) return { success: false, error: 'H⁺ 浓度必须为正数' };
    const ph = -Math.log10(h);
    let type;
    if (ph < 0) type = '强酸';
    else if (ph < 7) type = '酸性';
    else if (ph === 7) type = '中性';
    else if (ph <= 14) type = '碱性';
    else type = '强碱';

    return { success: true, data: `pH = ${ph.toFixed(2)}（${type}）` };
  } catch (error: any) {
    return { success: false, error: `pH 计算失败: ${error.message}` };
  }
}

/**
 * 由 pH 计算 H⁺ 浓度
 * @param {number} ph - pH 值
 * @returns {Promise<Object>}
 */
async function phToH(ph: any): Promise<any> {
  try {
    if (ph === undefined || ph === null) return { success: false, error: '请输入 pH 值' };
    if (ph < 0 || ph > 14) return { success: false, error: 'pH 值应在 0-14 之间' };

    const h = Math.pow(10, -ph);
    const parts = h.toExponential(4).split('e');
    const formatted = `${parts[0]}e${parseInt(parts[1], 10) < 0 ? '-' : '+'}${Math.abs(parseInt(parts[1], 10)).toString().padStart(2, '0')}`;
    return { success: true, data: `[H⁺] = ${formatted} mol/L` };
  } catch (error: any) {
    return { success: false, error: `H⁺ 计算失败: ${error.message}` };
  }
}

/**
 * 理想气体状态方程 PV=nRT
 * 已知任意 3 个参数求第 4 个
 * @param {number} P - 压强（atm，可省略）
 * @param {number} V - 体积（L，可省略）
 * @param {number} n - 物质的量（mol，可省略）
 * @param {number} T - 温度（K，可省略）
 * @returns {Promise<Object>}
 */
async function idealGasLaw(P: any, V: any, n: any, T: any): Promise<any> {
  try {
    const R = 0.082057; // L·atm/(mol·K)
    const params = [
      { val: P, name: 'P', unit: 'atm' },
      { val: V, name: 'V', unit: 'L' },
      { val: n, name: 'n', unit: 'mol' },
      { val: T, name: 'T', unit: 'K' },
    ];

    const given = params.filter((p) => p.val !== undefined && p.val !== null);
    const missing = params.filter((p) => p.val === undefined || p.val === null);

    if (given.length < 3) {
      return { success: false, error: '至少需要提供 P、V、n、T 中的 3 个参数' };
    }

    if (missing.length === 1) {
      const [Pv, Vv, nv, Tv] = [P, V, n, T].map((v) => (v === undefined || v === null ? null : v));
      let result, unit;

      if (Pv === null) {
        result = (nv * R * Tv) / Vv;
        unit = 'atm';
      } else if (Vv === null) {
        result = (nv * R * Tv) / Pv;
        unit = 'L';
      } else if (nv === null) {
        result = (Pv * Vv) / (R * Tv);
        unit = 'mol';
      } else {
        result = (Pv * Vv) / (nv * R);
        unit = 'K';
      }

      return {
        success: true,
        data: `PV = nRT\n${params.map((p) => `${p.name} = ${p.val !== null && p.val !== undefined ? p.val : result.toFixed(4)} ${p.unit}`).join(', ')}`,
      };
    } else if (missing.length === 0) {
      // 验证
      const lhs = P * V;
      const rhs = n * R * T;
      return {
        success: true,
        data: `验证: PV = ${P}×${V} = ${lhs.toFixed(4)}\nnRT = ${n}×${R}×${T} = ${rhs.toFixed(4)}\n相差: ${Math.abs(lhs - rhs).toFixed(4)}`,
      };
    }

    return { success: false, error: '未知错误' };
  } catch (error: any) {
    return { success: false, error: `气体定律计算失败: ${error.message}` };
  }
}

/**
 * 气体密度计算
 * @param {number} mw - 分子量（g/mol）
 * @param {number} T - 温度（K）
 * @param {number} P - 压强（atm）
 * @returns {Promise<Object>}
 */
async function gasDensity(mw: any, T: any, P: any): Promise<any> {
  try {
    if (!mw || mw <= 0) return { success: false, error: '分子量必须为正数' };
    if (!T || T <= 0) return { success: false, error: '温度必须为正数（K）' };
    if (!P || P <= 0) return { success: false, error: '压强必须为正数' };

    const R = 0.082057;
    const density = (P * mw) / (R * T);
    return {
      success: true,
      data: `气体密度: ${density.toFixed(4)} g/L (${(density * 1000).toFixed(4)} mg/L)\nT=${T}K, P=${P}atm, MW=${mw} g/mol`,
    };
  } catch (error: any) {
    return { success: false, error: `气体密度计算失败: ${error.message}` };
  }
}

export {
  elementInfo,
  molWeight,
  elementComposition,
  molarity,
  dilution,
  phFromH,
  phToH,
  idealGasLaw,
  gasDensity,
};
