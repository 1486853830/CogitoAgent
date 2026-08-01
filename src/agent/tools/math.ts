/**
 * 数学工具（Mathematics）
 * 提供描述性统计、相关性分析、线性代数、组合数学等功能
 * 零外部依赖
 */

/**
 * 描述性统计
 * @param {Array|string} data - 数据数组或 JSON 字符串
 * @returns {Promise<Object>}
 */
async function describe(
  data: number[] | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const values = typeof data === 'string' ? JSON.parse(data) : data;
    if (!Array.isArray(values) || values.length < 2) {
      return { success: false, error: '数据至少需要 2 个值' };
    }

    const n = values.length;
    const sorted = [...values].sort((a: number, b: number) => a - b);
    const sum = values.reduce((s: number, v: number) => s + v, 0);
    const mean = sum / n;

    // 中位数
    let median;
    if (n % 2 === 0) median = (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    else median = sorted[Math.floor(n / 2)];

    // 众数
    const freq: Record<string, number> = {};
    for (const v of values) freq[v] = (freq[v] || 0) + 1;
    const maxFreq = Math.max(...(Object.values(freq) as number[]));
    const modes = Object.entries(freq)
      .filter(([, c]: [string, number]) => c === maxFreq)
      .map(([k]: [string, number]) => parseFloat(k));

    // 方差和标准差
    const variance = values.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);

    // 偏度
    let skewness = 0;
    if (std > 0) {
      skewness =
        (values.reduce((s: number, v: number) => s + Math.pow((v - mean) / std, 3), 0) * n) /
        ((n - 1) * (n - 2));
    }

    // 四分位数
    const q1Idx = Math.floor(n * 0.25);
    const q3Idx = Math.floor(n * 0.75);
    const q1 = sorted[q1Idx];
    const q3 = sorted[q3Idx];
    const iqr = q3 - q1;

    const min = sorted[0];
    const max = sorted[n - 1];

    return {
      success: true,
      data:
        `描述性统计（n=${n}）:\n` +
        `  均值: ${mean.toFixed(4)}\n` +
        `  中位数: ${median.toFixed(4)}\n` +
        `  众数: ${modes.length <= 3 ? modes.join(', ') : modes.slice(0, 3).join(', ') + '...'}\n` +
        `  标准差: ${std.toFixed(4)}\n` +
        `  方差: ${variance.toFixed(4)}\n` +
        `  偏度: ${skewness.toFixed(4)}\n` +
        `  最小值: ${min}\n` +
        `  最大值: ${max}\n` +
        `  范围: ${min} - ${max}\n` +
        `  Q1: ${q1}, Q3: ${q3}, IQR: ${iqr}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `统计计算失败: ${(error as Error).message}` };
  }
}

/**
 * 皮尔逊相关系数
 * @param {Array|string} x - 第一组数据
 * @param {Array|string} y - 第二组数据
 * @returns {Promise<Object>}
 */
async function correlation(
  x: number[] | string,
  y: number[] | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const xArr = typeof x === 'string' ? JSON.parse(x) : x;
    const yArr = typeof y === 'string' ? JSON.parse(y) : y;

    if (!Array.isArray(xArr) || !Array.isArray(yArr)) {
      return { success: false, error: '两组数据都必须是数组' };
    }
    if (xArr.length !== yArr.length) {
      return { success: false, error: `两组数据长度不相等: ${xArr.length} vs ${yArr.length}` };
    }
    if (xArr.length < 3) {
      return { success: false, error: '至少需要 3 个数据点' };
    }

    const n = xArr.length;
    const meanX = xArr.reduce((s: number, v: number) => s + v, 0) / n;
    const meanY = yArr.reduce((s: number, v: number) => s + v, 0) / n;

    let num = 0,
      denomX = 0,
      denomY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xArr[i] - meanX;
      const dy = yArr[i] - meanY;
      num += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    let r;
    if (denom === 0) {
      r = 0;
    } else {
      r = num / denom;
    }

    // 判定相关强度
    const abs = Math.abs(r);
    let strength;
    if (abs >= 0.8) strength = '强相关';
    else if (abs >= 0.5) strength = '中等相关';
    else if (abs >= 0.3) strength = '弱相关';
    else strength = '极弱相关或无相关';

    return {
      success: true,
      data: `皮尔逊相关系数 r = ${r.toFixed(4)}\n${strength}（${r >= 0 ? '正' : '负'}相关）\nR² = ${(r * r).toFixed(4)}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `相关系数计算失败: ${(error as Error).message}` };
  }
}

/**
 * 线性回归 y = ax + b
 * @param {Array|string} x - 自变量数据
 * @param {Array|string} y - 因变量数据
 * @returns {Promise<Object>}
 */
async function linearRegression(
  x: number[] | string,
  y: number[] | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const xArr = typeof x === 'string' ? JSON.parse(x) : x;
    const yArr = typeof y === 'string' ? JSON.parse(y) : y;

    if (xArr.length !== yArr.length) {
      return { success: false, error: `数据长度不相等: ${xArr.length} vs ${yArr.length}` };
    }
    if (xArr.length < 3) {
      return { success: false, error: '至少需要 3 个数据点' };
    }

    const n = xArr.length;
    const sumX = xArr.reduce((s: number, v: number) => s + v, 0);
    const sumY = yArr.reduce((s: number, v: number) => s + v, 0);
    const sumXY = xArr.reduce((s: number, v: number, i: number) => s + v * yArr[i], 0);
    const sumX2 = xArr.reduce((s: number, v: number) => s + v * v, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    const a = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const b = meanY - a * meanX;

    // R²
    const ssRes = yArr.reduce(
      (s: number, v: number, i: number) => s + (v - (a * xArr[i] + b)) ** 2,
      0,
    );
    const ssTot = yArr.reduce((s: number, v: number) => s + (v - meanY) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return {
      success: true,
      data: `线性回归: y = ${a.toFixed(4)}x + ${b.toFixed(4)}\n斜率 a = ${a.toFixed(4)}\n截距 b = ${b.toFixed(4)}\nR² = ${r2.toFixed(4)}\n${r2 >= 0.7 ? '拟合效果良好' : r2 >= 0.3 ? '拟合效果一般' : '拟合效果较差'}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `线性回归失败: ${(error as Error).message}` };
  }
}

/**
 * 矩阵乘法
 * @param {Array|string} A - 矩阵 A（二维数组或 JSON 字符串）
 * @param {Array|string} B - 矩阵 B
 * @returns {Promise<Object>}
 */
async function matrixMultiply(
  A: number[][] | string,
  B: number[][] | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const mA = typeof A === 'string' ? JSON.parse(A) : A;
    const mB = typeof B === 'string' ? JSON.parse(B) : B;

    if (!Array.isArray(mA) || !Array.isArray(mB)) {
      return { success: false, error: '两个参数都必须是矩阵（二维数组）' };
    }

    const rowsA = mA.length;
    const colsA = mA[0].length;
    const rowsB = mB.length;
    const colsB = mB[0].length;

    if (colsA !== rowsB) {
      return {
        success: false,
        error: `矩阵维度不匹配: A(${rowsA}×${colsA}), B(${rowsB}×${colsB})`,
      };
    }

    const result: number[][] = [];
    for (let i = 0; i < rowsA; i++) {
      result[i] = [];
      for (let j = 0; j < colsB; j++) {
        let sum = 0;
        for (let k = 0; k < colsA; k++) {
          sum += mA[i][k] * mB[k][j];
        }
        result[i][j] = parseFloat(sum.toFixed(4));
      }
    }

    return {
      success: true,
      data: `矩阵乘法结果 (${rowsA}×${colsB}):\n${result.map((r: number[]) => `[${r.join(', ')}]`).join('\n')}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `矩阵乘法失败: ${(error as Error).message}` };
  }
}

/**
 * 矩阵行列式（2x2 或 3x3）
 * @param {Array|string} A - 方阵
 * @returns {Promise<Object>}
 */
async function matrixDeterminant(
  A: number[][] | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const mA = typeof A === 'string' ? JSON.parse(A) : A;
    const n = mA.length;

    if (n !== mA[0].length) {
      return { success: false, error: '矩阵必须是方阵' };
    }

    let det;
    if (n === 2) {
      det = mA[0][0] * mA[1][1] - mA[0][1] * mA[1][0];
    } else if (n === 3) {
      const [a, b, c] = mA[0];
      const [d, e, f] = mA[1];
      const [g, h, i] = mA[2];
      det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    } else {
      return { success: false, error: '仅支持 2x2 和 3x3 矩阵的行列式计算' };
    }

    return {
      success: true,
      data: `行列式 det = ${det.toFixed(4)}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `行列式计算失败: ${(error as Error).message}` };
  }
}

/**
 * 矩阵逆（2x2 或 3x3）
 * @param {Array|string} A - 方阵
 * @returns {Promise<Object>}
 */
async function matrixInverse(
  A: number[][] | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const mA = typeof A === 'string' ? JSON.parse(A) : A;
    const n = mA.length;

    if (n !== mA[0].length) {
      return { success: false, error: '矩阵必须是方阵' };
    }

    let det, inv: number[][];

    if (n === 2) {
      det = mA[0][0] * mA[1][1] - mA[0][1] * mA[1][0];
      if (Math.abs(det) < 1e-10) return { success: false, error: '矩阵不可逆（行列式为 0）' };
      inv = [
        [mA[1][1] / det, -mA[0][1] / det],
        [-mA[1][0] / det, mA[0][0] / det],
      ];
    } else if (n === 3) {
      const [a, b, c] = mA[0];
      const [d, e, f] = mA[1];
      const [g, h, i] = mA[2];
      const A_val = e * i - f * h;
      const B_val = -(d * i - f * g);
      const C_val = d * h - e * g;
      const D_val = -(b * i - c * h);
      const E_val = a * i - c * g;
      const F_val = -(a * h - b * g);
      const G_val = b * f - c * e;
      const H_val = -(a * f - c * d);
      const I_val = a * e - b * d;
      det = a * A_val + b * B_val + c * C_val;
      if (Math.abs(det) < 1e-10) return { success: false, error: '矩阵不可逆（行列式为 0）' };
      inv = [
        [A_val / det, D_val / det, G_val / det],
        [B_val / det, E_val / det, H_val / det],
        [C_val / det, F_val / det, I_val / det],
      ];
    } else {
      return { success: false, error: '仅支持 2x2 和 3x3 矩阵的逆' };
    }

    // 格式化
    const formatted = inv.map((r: number[]) => r.map((v: number) => parseFloat(v.toFixed(4))));

    return {
      success: true,
      data: `逆矩阵:\n${formatted.map((r: number[]) => `[${r.join(', ')}]`).join('\n')}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `矩阵求逆失败: ${(error as Error).message}` };
  }
}

/**
 * 一元二次方程求解 ax² + bx + c = 0
 * @param {number} a - 二次项系数
 * @param {number} b - 一次项系数
 * @param {number} c - 常数项
 * @returns {Promise<Object>}
 */
async function solveQuadratic(
  a: number,
  b: number,
  c: number,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    if (!a || a === 0) return { success: false, error: 'a 不能为 0' };

    const discriminant = b * b - 4 * a * c;

    if (discriminant > 0) {
      const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
      const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
      return {
        success: true,
        data: `方程: ${a}x² + ${b}x + ${c} = 0\n判别式: Δ = ${discriminant.toFixed(4)}\n两个实根: x₁ = ${x1.toFixed(4)}, x₂ = ${x2.toFixed(4)}`,
      };
    } else if (discriminant === 0) {
      const x = -b / (2 * a);
      return {
        success: true,
        data: `方程: ${a}x² + ${b}x + ${c} = 0\n判别式: Δ = 0\n重根: x = ${x.toFixed(4)}`,
      };
    } else {
      const real = (-b / (2 * a)).toFixed(4);
      const imag = (Math.sqrt(-discriminant) / (2 * a)).toFixed(4);
      return {
        success: true,
        data: `方程: ${a}x² + ${b}x + ${c} = 0\n判别式: Δ = ${discriminant.toFixed(4)}\n两个复根: x₁ = ${real} + ${imag}i, x₂ = ${real} - ${imag}i`,
      };
    }
  } catch (error: unknown) {
    return { success: false, error: `方程求解失败: ${(error as Error).message}` };
  }
}

/**
 * 阶乘
 * @param {number} n - 非负整数
 * @returns {Promise<Object>}
 */
async function factorial(
  n: number | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    n = parseInt(n as string, 10);
    if (isNaN(n) || n < 0) return { success: false, error: 'n 必须为非负整数' };
    if (n > 170) return { success: false, error: 'n 不能超过 170（会溢出）' };

    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;

    return {
      success: true,
      data: `${n}! = ${result.toExponential(6)}（${result}）`,
    };
  } catch (error: unknown) {
    return { success: false, error: `阶乘计算失败: ${(error as Error).message}` };
  }
}

/**
 * 组合数 C(n, k)
 * @param {number} n - 总数
 * @param {number} k - 选取数
 * @returns {Promise<Object>}
 */
async function combination(
  n: number | string,
  k: number | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    n = parseInt(n as string, 10);
    k = parseInt(k as string, 10);
    if (isNaN(n) || n < 0) return { success: false, error: 'n 必须为非负整数' };
    if (isNaN(k) || k < 0) return { success: false, error: 'k 必须为非负整数' };
    if (k > n) return { success: false, error: 'k 不能大于 n' };
    if (n > 100) return { success: false, error: 'n 不能超过 100' };

    // 用较小的 k 计算
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= k; i++) {
      result = (result * (n - k + i)) / i;
    }

    return {
      success: true,
      data: `C(${n}, ${k}) = ${Math.round(result)}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `组合数计算失败: ${(error as Error).message}` };
  }
}

/**
 * 排列数 P(n, k)
 * @param {number} n - 总数
 * @param {number} k - 选取数
 * @returns {Promise<Object>}
 */
async function permutation(
  n: number | string,
  k: number | string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    n = parseInt(n as string, 10);
    k = parseInt(k as string, 10);
    if (isNaN(n) || n < 0) return { success: false, error: 'n 必须为非负整数' };
    if (isNaN(k) || k < 0) return { success: false, error: 'k 必须为非负整数' };
    if (k > n) return { success: false, error: 'k 不能大于 n' };
    if (n > 100) return { success: false, error: 'n 不能超过 100' };

    let result = 1;
    for (let i = 0; i < k; i++) {
      result *= n - i;
    }

    return {
      success: true,
      data: `P(${n}, ${k}) = ${result}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `排列数计算失败: ${(error as Error).message}` };
  }
}

/**
 * SI 单位换算
 * @param {number} value - 数值
 * @param {string} from - 源单位
 * @param {string} to - 目标单位
 * @returns {Promise<Object>}
 */
async function siConvert(
  value: number | string | undefined | null,
  from: string,
  to: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    if (value === undefined || value === null) return { success: false, error: '请输入数值' };

    const prefixes: Record<string, number> = {
      Y: 1e24,
      Z: 1e21,
      E: 1e18,
      P: 1e15,
      T: 1e12,
      G: 1e9,
      M: 1e6,
      k: 1e3,
      h: 1e2,
      da: 1e1,
      d: 1e-1,
      c: 1e-2,
      m: 1e-3,
      μ: 1e-6,
      u: 1e-6,
      n: 1e-9,
      p: 1e-12,
      f: 1e-15,
      a: 1e-18,
    };

    const baseUnits = [
      'm',
      'g',
      's',
      'A',
      'K',
      'mol',
      'cd',
      'L',
      'Hz',
      'W',
      'V',
      'Pa',
      'J',
      'N',
      'B',
    ];

    // 尝试解析单位
    const parseUnit = (u: string): { factor: number; base: string } | null => {
      u = u.trim();
      // 检查是否有前缀
      for (const [prefix, factor] of Object.entries(prefixes)) {
        if (u.startsWith(prefix) && u.length > prefix.length) {
          const base = u.slice(prefix.length);
          if (baseUnits.includes(base)) {
            return { factor, base };
          }
        }
      }
      // 无前缀
      if (baseUnits.includes(u)) {
        return { factor: 1, base: u };
      }
      return null;
    };

    const fromParsed = parseUnit(from);
    const toParsed = parseUnit(to);

    if (!fromParsed) return { success: false, error: `无法识别的源单位: ${from}` };
    if (!toParsed) return { success: false, error: `无法识别的目标单位: ${to}` };
    if (fromParsed.base !== toParsed.base) {
      return {
        success: false,
        error: `单位不兼容: ${from} (${fromParsed.base}) → ${to} (${toParsed.base})`,
      };
    }

    // 转成基本单位再转目标
    const baseValue = (value as number) * fromParsed.factor;
    const result = baseValue / toParsed.factor;

    const prefixNames: Record<string, string> = {
      G: '吉',
      M: '兆',
      k: '千',
      m: '毫',
      μ: '微',
      u: '微',
      n: '纳',
      p: '皮',
      c: '厘',
      d: '分',
      da: '十',
      h: '百',
    };

    const fromName = prefixNames[from[0]] || '';
    const toName = prefixNames[to[0]] || '';

    return {
      success: true,
      data: `${value} ${from} = ${result.toExponential(6)} ${to}\n${from} = ${fromParsed.factor} ${fromParsed.base}，${to} = ${toParsed.factor} ${toParsed.base}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `SI 换算失败: ${(error as Error).message}` };
  }
}

export {
  describe,
  correlation,
  linearRegression,
  matrixMultiply,
  matrixDeterminant,
  matrixInverse,
  solveQuadratic,
  factorial,
  combination,
  permutation,
  siConvert,
};
