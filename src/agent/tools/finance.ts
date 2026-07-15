/**
 * 金融工具（Finance）
 * 提供复利、投资分析、贷款计算、统计指标等功能
 * 零外部依赖
 */

// 工具函数：将参数转为数字，NaN 时返回原值
function toNum(v: any): any {
  if (v === undefined || v === null) return v;
  const n = Number(v);
  return isNaN(n) ? v : n;
}

/**
 * 复利终值计算
 * @param {number} P - 本金
 * @param {number} r - 年利率（小数，如 0.05）
 * @param {number} n - 每年复利次数
 * @param {number} t - 年数
 * @returns {Promise<Object>}
 */
async function compoundInterest(P: any, r: any, n: any, t: any): Promise<any> {
  try {
    P = toNum(P); r = toNum(r); n = toNum(n); t = toNum(t);
    if (!P || P <= 0) return { success: false, error: '本金必须为正数' };
    if (r === undefined || r === null || isNaN(r)) return { success: false, error: '请输入利率' };
    if (!n || n <= 0) return { success: false, error: '复利次数必须为正数' };
    if (!t || t <= 0) return { success: false, error: '年数必须为正数' };

    const A = P * Math.pow(1 + r / n, n * t);
    const interest = A - P;

    return {
      success: true,
      data: `终值: ${A.toFixed(2)}\n本金: ${P.toFixed(2)}\n利息: ${interest.toFixed(2)}\n年利率: ${(r * 100).toFixed(2)}%，${n}次/年，${t}年`
    };
  } catch (error: any) {
    return { success: false, error: `复利计算失败: ${error.message}` };
  }
}

/**
 * 现值计算
 * @param {number} FV - 终值
 * @param {number} r - 折现率（小数）
 * @param {number} n - 期数
 * @returns {Promise<Object>}
 */
async function presentValue(FV: any, r: any, n: any): Promise<any> {
  try {
    FV = toNum(FV); r = toNum(r); n = toNum(n);
    if (!FV || FV <= 0) return { success: false, error: '终值必须为正数' };
    if (r === undefined || r === null || isNaN(r)) return { success: false, error: '请输入折现率' };
    if (!n || n <= 0) return { success: false, error: '期数必须为正数' };

    const PV = FV / Math.pow(1 + r, n);
    return { success: true, data: `现值: ${PV.toFixed(2)}（折现率 ${(r * 100).toFixed(2)}%，${n} 期）` };
  } catch (error: any) {
    return { success: false, error: `现值计算失败: ${error.message}` };
  }
}

/**
 * 年金终值计算
 * @param {number} PMT - 每期支付额
 * @param {number} r - 每期利率（小数）
 * @param {number} n - 期数
 * @returns {Promise<Object>}
 */
async function futureValueAnnuity(PMT: any, r: any, n: any): Promise<any> {
  try {
    PMT = toNum(PMT); r = toNum(r); n = toNum(n);
    if (!PMT || PMT <= 0) return { success: false, error: '每期支付额必须为正数' };
    if (r === undefined || r === null || isNaN(r)) return { success: false, error: '请输入利率' };
    if (!n || n <= 0) return { success: false, error: '期数必须为正数' };

    const FV = PMT * (Math.pow(1 + r, n) - 1) / r;
    const totalPayments = PMT * n;
    const interest = FV - totalPayments;

    return {
      success: true,
      data: `年金终值: ${FV.toFixed(2)}\n总投入: ${totalPayments.toFixed(2)}\n总收益: ${interest.toFixed(2)}`
    };
  } catch (error: any) {
    return { success: false, error: `年金终值计算失败: ${error.message}` };
  }
}

/**
 * 净现值 NPV
 * @param {number} rate - 折现率（小数）
 * @param {Array|string} cashflows - 现金流数组或 JSON 字符串（第0项为初始投资，负值）
 * @returns {Promise<Object>}
 */
async function npv(rate: any, cashflows: any): Promise<any> {
  try {
    rate = toNum(rate);
    const flows = typeof cashflows === 'string' ? JSON.parse(cashflows) : cashflows;
    if (!Array.isArray(flows) || flows.length < 2) {
      return { success: false, error: '现金流至少需要 2 期' };
    }

    let total = 0;
    for (let i = 0; i < flows.length; i++) {
      total += flows[i] / Math.pow(1 + rate, i);
    }

    const totalInvestment = Math.abs(flows.filter((f: number) => f < 0).reduce((s: number, v: number) => s + v, 0));
    return {
      success: true,
      data: `NPV: ${total.toFixed(4)}\n总投资: ${totalInvestment.toFixed(2)}\n${total >= 0 ? '✅ 项目可行（NPV ≥ 0）' : '❌ 项目不可行（NPV < 0）'}`
    };
  } catch (error: any) {
    return { success: false, error: `NPV 计算失败: ${error.message}` };
  }
}

/**
 * 内部收益率 IRR（牛顿迭代法）
 * @param {Array|string} cashflows - 现金流数组或 JSON 字符串
 * @returns {Promise<Object>}
 */
async function irr(cashflows: any): Promise<any> {
  try {
    const flows = typeof cashflows === 'string' ? JSON.parse(cashflows) : cashflows;
    if (!Array.isArray(flows) || flows.length < 2) {
      return { success: false, error: '现金流至少需要 2 期' };
    }

    // 牛顿迭代法求 IRR
    let guess = 0.1;
    const maxIter = 1000;
    const tolerance = 1e-7;

    for (let iter = 0; iter < maxIter; iter++) {
      let npvVal = 0;
      let dnpv = 0;
      for (let i = 0; i < flows.length; i++) {
        npvVal += flows[i] / Math.pow(1 + guess, i);
        dnpv -= i * flows[i] / Math.pow(1 + guess, i + 1);
      }

      if (Math.abs(npvVal) < tolerance) {
        return {
          success: true,
          data: `IRR: ${(guess * 100).toFixed(2)}%`
        };
      }

      if (dnpv === 0) break;
      guess = guess - npvVal / dnpv;
    }

    return {
      success: true,
      data: `IRR: ${(guess * 100).toFixed(2)}%（近似值）`
    };
  } catch (error: any) {
    return { success: false, error: `IRR 计算失败: ${error.message}` };
  }
}

/**
 * 投资回收期
 * @param {Array|string} cashflows - 现金流数组或 JSON 字符串
 * @returns {Promise<Object>}
 */
async function paybackPeriod(cashflows: any): Promise<any> {
  try {
    const flows = typeof cashflows === 'string' ? JSON.parse(cashflows) : cashflows;
    if (!Array.isArray(flows) || flows.length < 2) {
      return { success: false, error: '现金流至少需要 2 期' };
    }

    let cumulative = 0;
    for (let i = 0; i < flows.length; i++) {
      cumulative += flows[i];
      if (cumulative >= 0) {
        // 插值精确回收期
        const prevCumulative = cumulative - flows[i];
        if (prevCumulative < 0 && flows[i] > 0) {
          const fraction = -prevCumulative / flows[i];
          const period = (i - 1) + fraction;
          return { success: true, data: `回收期: ${period.toFixed(2)} 期` };
        }
        return { success: true, data: `回收期: ${i} 期（在第 ${i} 期刚好回收）` };
      }
    }

    return { success: true, data: `在 ${flows.length} 期内未能回收投资` };
  } catch (error: any) {
    return { success: false, error: `回收期计算失败: ${error.message}` };
  }
}

/**
 * 投资回报率 ROI
 * @param {number} gain - 收益
 * @param {number} cost - 成本
 * @returns {Promise<Object>}
 */
async function roi(gain: any, cost: any): Promise<any> {
  try {
    gain = toNum(gain); cost = toNum(cost);
    if (!cost || cost <= 0) return { success: false, error: '成本必须为正数' };
    if (gain === undefined || gain === null) return { success: false, error: '请输入收益' };

    const value = ((gain - cost) / cost) * 100;
    return {
      success: true,
      data: `ROI: ${value.toFixed(2)}%\n收益: ${gain.toFixed(2)}，成本: ${cost.toFixed(2)}，净利润: ${(gain - cost).toFixed(2)}`
    };
  } catch (error: any) {
    return { success: false, error: `ROI 计算失败: ${error.message}` };
  }
}

/**
 * 等额本息月供计算
 * @param {number} principal - 贷款本金
 * @param {number} annualRate - 年利率（小数，如 0.05）
 * @param {number} months - 贷款期数（月）
 * @returns {Promise<Object>}
 */
async function loanPayment(principal: any, annualRate: any, months: any): Promise<any> {
  try {
    principal = toNum(principal); annualRate = toNum(annualRate); months = toNum(months);
    if (!principal || principal <= 0) return { success: false, error: '本金必须为正数' };
    if (annualRate === undefined || annualRate === null || isNaN(annualRate)) return { success: false, error: '请输入年利率' };
    if (!months || months <= 0) return { success: false, error: '期数必须为正数' };

    const monthlyRate = annualRate / 12;
    const payment = principal * monthlyRate * Math.pow(1 + monthlyRate, months) /
      (Math.pow(1 + monthlyRate, months) - 1);
    const totalPayment = payment * months;
    const totalInterest = totalPayment - principal;

    return {
      success: true,
      data: `月供: ${payment.toFixed(2)}\n总还款: ${totalPayment.toFixed(2)}\n总利息: ${totalInterest.toFixed(2)}\n年利率: ${(annualRate * 100).toFixed(2)}%，${months} 个月`
    };
  } catch (error: any) {
    return { success: false, error: `贷款计算失败: ${error.message}` };
  }
}

/**
 * 等额本息还款计划表
 * @param {number} principal - 贷款本金
 * @param {number} annualRate - 年利率（小数）
 * @param {number} months - 期数
 * @returns {Promise<Object>}
 */
async function amortizationSchedule(principal: any, annualRate: any, months: any): Promise<any> {
  try {
    principal = toNum(principal); annualRate = toNum(annualRate); months = toNum(months);
    if (!principal || principal <= 0) return { success: false, error: '本金必须为正数' };
    if (annualRate === undefined || annualRate === null || isNaN(annualRate) || annualRate <= 0) return { success: false, error: '请输入有效年利率' };
    if (months > 360) return { success: false, error: '期数不能超过 360' };

    const monthlyRate = annualRate / 12;
    const payment = principal * monthlyRate * Math.pow(1 + monthlyRate, months) /
      (Math.pow(1 + monthlyRate, months) - 1);
    let balance = principal;
    const lines = ['期次 | 月供 | 偿还本金 | 偿还利息 | 剩余本金'];
    lines.push('--- | --- | --- | --- | ---');

    for (let i = 1; i <= months; i++) {
      const interest = balance * monthlyRate;
      const principalPaid = payment - interest;
      balance -= principalPaid;
      if (balance < 0) balance = 0;
      lines.push(`${i} | ${payment.toFixed(2)} | ${principalPaid.toFixed(2)} | ${interest.toFixed(2)} | ${balance.toFixed(2)}`);

      if (i === 12 && months > 24) {
        lines.push('...（省略中间还款计划，完整 ${months} 期）');
        // 跳到最后一期
        i = months - 1;
      }
    }

    return {
      success: true,
      data: `还款计划表（${months} 期，月供 ${payment.toFixed(2)}）:\n\n${lines.join('\n')}`
    };
  } catch (error: any) {
    return { success: false, error: `还款计划计算失败: ${error.message}` };
  }
}

/**
 * 总利息计算
 * @param {number} principal - 本金
 * @param {number} annualRate - 年利率
 * @param {number} months - 期数
 * @returns {Promise<Object>}
 */
async function totalInterest(principal: any, annualRate: any, months: any): Promise<any> {
  try {
    const result = await loanPayment(principal, annualRate, months);
    if (!result.success) return result;
    // 从 loanPayment 结果中提取总利息
    const match = result.data.match(/总利息: ([\d.]+)/);
    const interest = match ? parseFloat(match[1]) : 0;
    return { success: true, data: `总利息: ${interest.toFixed(2)}` };
  } catch (error: any) {
    return { success: false, error: `总利息计算失败: ${error.message}` };
  }
}

/**
 * 移动平均线
 * @param {Array|string} data - 数据数组或 JSON 字符串
 * @param {number} period - 周期
 * @returns {Promise<Object>}
 */
async function movingAverage(data: any, period: any): Promise<any> {
  try {
    period = toNum(period);
    const values = typeof data === 'string' ? JSON.parse(data) : data;
    if (!Array.isArray(values) || values.length < period) {
      return { success: false, error: `数据长度必须大于等于周期 ${period}` };
    }

    const result: any[] = [];
    for (let i = period - 1; i < values.length; i++) {
      const sum = values.slice(i - period + 1, i + 1).reduce((s: number, v: number) => s + v, 0);
      result.push(parseFloat((sum / period).toFixed(4)));
    }

    return {
      success: true,
      data: `移动平均线（${period} 期）:\n原始数据: ${values.length} 个\n结果: ${result.length} 个\n${result.slice(0, 20).join(', ')}${result.length > 20 ? `\n...（共 ${result.length} 个值）` : ''}`
    };
  } catch (error: any) {
    return { success: false, error: `移动平均计算失败: ${error.message}` };
  }
}

/**
 * 波动率（收益率标准差）
 * @param {Array|string} prices - 价格序列数组或 JSON 字符串
 * @returns {Promise<Object>}
 */
async function volatility(prices: any): Promise<any> {
  try {
    const vals = typeof prices === 'string' ? JSON.parse(prices) : prices;
    if (!Array.isArray(vals) || vals.length < 3) {
      return { success: false, error: '价格数据至少需要 3 个' };
    }

    // 计算对数收益率
    const returns: any[] = [];
    for (let i = 1; i < vals.length; i++) {
      returns.push(Math.log(vals[i] / vals[i - 1]));
    }

    const mean = returns.reduce((s: number, v: number) => s + v, 0) / returns.length;
    const variance = returns.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);

    return {
      success: true,
      data: `波动率（标准差）: ${(std * 100).toFixed(2)}%\n年化波动率: ${(std * Math.sqrt(252) * 100).toFixed(2)}%（按 252 个交易日）\n数据点数: ${vals.length}，收益率个数: ${returns.length}`
    };
  } catch (error: any) {
    return { success: false, error: `波动率计算失败: ${error.message}` };
  }
}

export {
  compoundInterest,
  presentValue,
  futureValueAnnuity,
  npv,
  irr,
  paybackPeriod,
  roi,
  loanPayment,
  amortizationSchedule,
  totalInterest,
  movingAverage,
  volatility
};
