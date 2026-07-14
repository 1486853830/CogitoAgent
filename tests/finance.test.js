import * as finance from '../src/agent/tools/finance.js';

describe('金融工具', () => {
  describe('复利计算', () => {
    it('should calculate compound interest', async () => {
      const result = await finance.compoundInterest(10000, 0.05, 12, 5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('终值');
      expect(result.data).toContain('12833');
    });

    it('should calculate present value', async () => {
      const result = await finance.presentValue(12763, 0.05, 5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('现值');
    });

    it('should calculate future value of annuity', async () => {
      const result = await finance.futureValueAnnuity(1000, 0.05, 5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('终值');
    });
  });

  describe('投资分析', () => {
    it('should calculate NPV', async () => {
      const cashflows = [-10000, 3000, 4000, 5000];
      const result = await finance.npv(0.1, cashflows);
      expect(result.success).toBe(true);
      expect(result.data).toContain('可行');
    });

    it('should calculate IRR', async () => {
      const cashflows = [-10000, 3000, 4000, 5000];
      const result = await finance.irr(cashflows);
      expect(result.success).toBe(true);
      expect(result.data).toContain('IRR');
    });

    it('should calculate payback period', async () => {
      const cashflows = [-10000, 3000, 4000, 5000];
      const result = await finance.paybackPeriod(cashflows);
      expect(result.success).toBe(true);
      expect(result.data).toContain('回收期');
    });

    it('should calculate ROI', async () => {
      const result = await finance.roi(5000, 10000);
      expect(result.success).toBe(true);
      expect(result.data).toContain('50');
    });
  });

  describe('贷款计算', () => {
    it('should calculate loan payment', async () => {
      const result = await finance.loanPayment(100000, 0.042, 240);
      expect(result.success).toBe(true);
      expect(result.data).toContain('月供');
    });

    it('should calculate total interest', async () => {
      const result = await finance.totalInterest(100000, 0.042, 240);
      expect(result.success).toBe(true);
      expect(result.data).toContain('总利息');
    });
  });

  describe('统计指标', () => {
    it('should calculate moving average', async () => {
      const data = [100, 102, 98, 105, 103, 101, 104];
      const result = await finance.movingAverage(data, 3);
      expect(result.success).toBe(true);
      expect(result.data).toContain('移动平均');
    });

    it('should calculate volatility', async () => {
      const prices = [100, 102, 98, 105, 103];
      const result = await finance.volatility(prices);
      expect(result.success).toBe(true);
      expect(result.data).toContain('波动率');
    });
  });
});