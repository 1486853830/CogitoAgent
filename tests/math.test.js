import * as math from '../src/agent/tools/math.js';

describe('数学统计工具', () => {
  describe('描述性统计', () => {
    it('should calculate describe statistics', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = await math.describe(data);
      expect(result.success).toBe(true);
      expect(result.data).toContain('5.5');
      expect(result.data).toContain('标准差');
    });
  });

  describe('相关性分析', () => {
    it('should calculate positive correlation', async () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      const result = await math.correlation(x, y);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should calculate negative correlation', async () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      const result = await math.correlation(x, y);
      expect(result.success).toBe(true);
      expect(result.data).toContain('-1');
    });
  });

  describe('线性回归', () => {
    it('should perform linear regression', async () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 5, 7, 8];
      const result = await math.linearRegression(x, y);
      expect(result.success).toBe(true);
      expect(result.data).toContain('斜率');
    });
  });

  describe('矩阵运算', () => {
    it('should multiply two 2x2 matrices', async () => {
      const A = [[1, 2], [3, 4]];
      const B = [[5, 6], [7, 8]];
      const result = await math.matrixMultiply(A, B);
      expect(result.success).toBe(true);
      expect(result.data).toContain('19');
    });

    it('should calculate determinant of 2x2 matrix', async () => {
      const A = [[1, 2], [3, 4]];
      const result = await math.matrixDeterminant(A);
      expect(result.success).toBe(true);
      expect(result.data).toContain('-2');
    });

    it('should calculate inverse of 2x2 matrix', async () => {
      const A = [[4, 7], [2, 6]];
      const result = await math.matrixInverse(A);
      expect(result.success).toBe(true);
      expect(result.data).toContain('0.6');
    });
  });

  describe('数值计算', () => {
    it('should solve quadratic equation', async () => {
      const result = await math.solveQuadratic(1, -5, 6);
      expect(result.success).toBe(true);
      expect(result.data).toContain('2');
      expect(result.data).toContain('3');
    });

    it('should calculate factorial', async () => {
      const result = await math.factorial(5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('120');
    });

    it('should calculate combination', async () => {
      const result = await math.combination(5, 2);
      expect(result.success).toBe(true);
      expect(result.data).toContain('10');
    });

    it('should calculate permutation', async () => {
      const result = await math.permutation(5, 2);
      expect(result.success).toBe(true);
      expect(result.data).toContain('20');
    });
  });

  describe('单位换算', () => {
    it('should convert SI units', async () => {
      const result = await math.siConvert(1000, 'kg', 'g');
      expect(result.success).toBe(true);
      expect(result.data).toContain('1.000000e+6');
    });

    it('should convert meters to kilometers', async () => {
      const result = await math.siConvert(5000, 'm', 'km');
      expect(result.success).toBe(true);
      expect(result.data).toContain('5');
    });
  });
});