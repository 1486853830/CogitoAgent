import {
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
  volatility,
} from '../../src/agent/tools/finance.ts';

describe('finance tools', () => {
  describe('compoundInterest', () => {
    it('should calculate compound interest', async () => {
      const result = await compoundInterest(1000, 0.05, 12, 5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('终值');
    });

    it('should reject invalid principal', async () => {
      const result = await compoundInterest(0, 0.05, 12, 5);
      expect(result.success).toBe(false);
    });

    it('should reject missing rate', async () => {
      const result = await compoundInterest(1000, undefined, 12, 5);
      expect(result.success).toBe(false);
    });
  });

  describe('presentValue', () => {
    it('should calculate present value', async () => {
      const result = await presentValue(1000, 0.05, 5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('现值');
    });

    it('should reject invalid FV', async () => {
      const result = await presentValue(0, 0.05, 5);
      expect(result.success).toBe(false);
    });
  });

  describe('futureValueAnnuity', () => {
    it('should calculate future value of annuity', async () => {
      const result = await futureValueAnnuity(100, 0.05, 10);
      expect(result.success).toBe(true);
      expect(result.data).toContain('年金终值');
    });

    it('should reject invalid PMT', async () => {
      const result = await futureValueAnnuity(0, 0.05, 10);
      expect(result.success).toBe(false);
    });
  });

  describe('npv', () => {
    it('should calculate NPV', async () => {
      const result = await npv(0.1, [-1000, 500, 600]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('NPV');
    });

    it('should handle JSON string input', async () => {
      const result = await npv(0.1, '[-1000, 500, 600]');
      expect(result.success).toBe(true);
    });

    it('should reject insufficient cashflows', async () => {
      const result = await npv(0.1, [-1000]);
      expect(result.success).toBe(false);
    });

    it('should indicate project feasibility', async () => {
      const result = await npv(0.1, [-1000, 1500]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('项目可行');
    });
  });

  describe('irr', () => {
    it('should calculate IRR', async () => {
      const result = await irr([-1000, 500, 600]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('IRR');
    });

    it('should handle JSON string input', async () => {
      const result = await irr('[-1000, 500, 600]');
      expect(result.success).toBe(true);
    });

    it('should reject insufficient cashflows', async () => {
      const result = await irr([-1000]);
      expect(result.success).toBe(false);
    });
  });

  describe('paybackPeriod', () => {
    it('should calculate payback period', async () => {
      const result = await paybackPeriod([-1000, 300, 400, 400]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('回收期');
    });

    it('should handle partial period', async () => {
      const result = await paybackPeriod([-1000, 400, 400, 400]);
      expect(result.success).toBe(true);
    });

    it('should indicate no payback', async () => {
      const result = await paybackPeriod([-1000, 100, 100]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('未能回收');
    });
  });

  describe('roi', () => {
    it('should calculate ROI', async () => {
      const result = await roi(1500, 1000);
      expect(result.success).toBe(true);
      expect(result.data).toContain('ROI');
      expect(result.data).toContain('50.00');
    });

    it('should handle loss', async () => {
      const result = await roi(800, 1000);
      expect(result.success).toBe(true);
      expect(result.data).toContain('-20.00');
    });

    it('should reject invalid cost', async () => {
      const result = await roi(1000, 0);
      expect(result.success).toBe(false);
    });
  });

  describe('loanPayment', () => {
    it('should calculate loan payment', async () => {
      const result = await loanPayment(100000, 0.05, 120);
      expect(result.success).toBe(true);
      expect(result.data).toContain('月供');
    });

    it('should reject invalid principal', async () => {
      const result = await loanPayment(0, 0.05, 120);
      expect(result.success).toBe(false);
    });
  });

  describe('amortizationSchedule', () => {
    it('should generate amortization schedule', async () => {
      const result = await amortizationSchedule(10000, 0.05, 12);
      expect(result.success).toBe(true);
      expect(result.data).toContain('还款计划表');
    });

    it('should reject too many months', async () => {
      const result = await amortizationSchedule(10000, 0.05, 400);
      expect(result.success).toBe(false);
    });
  });

  describe('totalInterest', () => {
    it('should calculate total interest', async () => {
      const result = await totalInterest(10000, 0.05, 12);
      expect(result.success).toBe(true);
      expect(result.data).toContain('总利息');
    });
  });

  describe('movingAverage', () => {
    it('should calculate moving average', async () => {
      const result = await movingAverage([1, 2, 3, 4, 5], 3);
      expect(result.success).toBe(true);
      expect(result.data).toContain('移动平均线');
    });

    it('should handle JSON string input', async () => {
      const result = await movingAverage('[1, 2, 3, 4, 5]', 3);
      expect(result.success).toBe(true);
    });

    it('should reject insufficient data', async () => {
      const result = await movingAverage([1, 2], 3);
      expect(result.success).toBe(false);
    });
  });

  describe('volatility', () => {
    it('should calculate volatility', async () => {
      const result = await volatility([100, 105, 102, 108, 106]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('波动率');
    });

    it('should handle JSON string input', async () => {
      const result = await volatility('[100, 105, 102, 108, 106]');
      expect(result.success).toBe(true);
    });

    it('should reject insufficient data', async () => {
      const result = await volatility([100, 105]);
      expect(result.success).toBe(false);
    });
  });
});
