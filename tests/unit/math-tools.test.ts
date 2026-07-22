import {
  describe as describeStats,
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
} from '../../src/agent/tools/math.ts';

describe('math tools', () => {
  describe('describe', () => {
    it('should calculate descriptive statistics', async () => {
      const result = await describeStats([1, 2, 3, 4, 5]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('均值');
      expect(result.data).toContain('中位数');
      expect(result.data).toContain('标准差');
    });

    it('should handle JSON string input', async () => {
      const result = await describeStats('[1, 2, 3, 4, 5]');
      expect(result.success).toBe(true);
    });

    it('should reject insufficient data', async () => {
      const result = await describeStats([1]);
      expect(result.success).toBe(false);
    });

    it('should handle empty array', async () => {
      const result = await describeStats([]);
      expect(result.success).toBe(false);
    });
  });

  describe('correlation', () => {
    it('should calculate Pearson correlation', async () => {
      const result = await correlation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('强相关');
    });

    it('should handle negative correlation', async () => {
      const result = await correlation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('负相关');
    });

    it('should reject unequal lengths', async () => {
      const result = await correlation([1, 2, 3], [1, 2]);
      expect(result.success).toBe(false);
    });

    it('should reject insufficient data points', async () => {
      const result = await correlation([1, 2], [3, 4]);
      expect(result.success).toBe(false);
    });
  });

  describe('linearRegression', () => {
    it('should perform linear regression', async () => {
      const result = await linearRegression([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('y =');
      expect(result.data).toContain('R²');
    });

    it('should reject unequal lengths', async () => {
      const result = await linearRegression([1, 2], [1, 2, 3]);
      expect(result.success).toBe(false);
    });

    it('should reject insufficient data', async () => {
      const result = await linearRegression([1, 2], [3, 4]);
      expect(result.success).toBe(false);
    });
  });

  describe('matrixMultiply', () => {
    it('should multiply 2x2 matrices', async () => {
      const A = [
        [1, 2],
        [3, 4],
      ];
      const B = [
        [5, 6],
        [7, 8],
      ];
      const result = await matrixMultiply(A, B);
      expect(result.success).toBe(true);
    });

    it('should handle dimension mismatch', async () => {
      const A = [
        [1, 2, 3],
        [4, 5, 6],
      ];
      const B = [
        [1, 2],
        [3, 4],
      ];
      const result = await matrixMultiply(A, B);
      expect(result.success).toBe(false);
    });

    it('should handle JSON string input', async () => {
      const result = await matrixMultiply('[[1,2],[3,4]]', '[[5,6],[7,8]]');
      expect(result.success).toBe(true);
    });
  });

  describe('matrixDeterminant', () => {
    it('should calculate 2x2 determinant', async () => {
      const result = await matrixDeterminant([
        [1, 2],
        [3, 4],
      ]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('-2');
    });

    it('should calculate 3x3 determinant', async () => {
      const result = await matrixDeterminant([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should reject non-square matrix', async () => {
      const result = await matrixDeterminant([
        [1, 2, 3],
        [4, 5, 6],
      ]);
      expect(result.success).toBe(false);
    });

    it('should reject unsupported size', async () => {
      const result = await matrixDeterminant([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe('matrixInverse', () => {
    it('should calculate 2x2 inverse', async () => {
      const result = await matrixInverse([
        [4, 7],
        [2, 6],
      ]);
      expect(result.success).toBe(true);
    });

    it('should calculate 3x3 inverse', async () => {
      const result = await matrixInverse([
        [1, 2, 3],
        [0, 1, 4],
        [5, 6, 0],
      ]);
      expect(result.success).toBe(true);
    });

    it('should reject singular matrix', async () => {
      const result = await matrixInverse([
        [1, 2],
        [2, 4],
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe('solveQuadratic', () => {
    it('should solve equation with two real roots', async () => {
      const result = await solveQuadratic(1, -3, 2);
      expect(result.success).toBe(true);
      expect(result.data).toContain('两个实根');
    });

    it('should solve equation with repeated root', async () => {
      const result = await solveQuadratic(1, 2, 1);
      expect(result.success).toBe(true);
      expect(result.data).toContain('重根');
    });

    it('should solve equation with complex roots', async () => {
      const result = await solveQuadratic(1, 2, 5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('复根');
    });

    it('should reject a=0', async () => {
      const result = await solveQuadratic(0, 2, 3);
      expect(result.success).toBe(false);
    });
  });

  describe('factorial', () => {
    it('should calculate factorial', async () => {
      const result = await factorial(5);
      expect(result.success).toBe(true);
      expect(result.data).toContain('120');
    });

    it('should handle zero', async () => {
      const result = await factorial(0);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should handle one', async () => {
      const result = await factorial(1);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should reject negative numbers', async () => {
      const result = await factorial(-1);
      expect(result.success).toBe(false);
    });

    it('should reject overflow', async () => {
      const result = await factorial(200);
      expect(result.success).toBe(false);
    });
  });

  describe('combination', () => {
    it('should calculate combination', async () => {
      const result = await combination(5, 2);
      expect(result.success).toBe(true);
      expect(result.data).toContain('10');
    });

    it('should handle k=0', async () => {
      const result = await combination(5, 0);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should reject k > n', async () => {
      const result = await combination(5, 6);
      expect(result.success).toBe(false);
    });

    it('should reject negative numbers', async () => {
      const result = await combination(-1, 2);
      expect(result.success).toBe(false);
    });
  });

  describe('permutation', () => {
    it('should calculate permutation', async () => {
      const result = await permutation(5, 2);
      expect(result.success).toBe(true);
      expect(result.data).toContain('20');
    });

    it('should handle k=0', async () => {
      const result = await permutation(5, 0);
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should reject k > n', async () => {
      const result = await permutation(5, 6);
      expect(result.success).toBe(false);
    });
  });

  describe('siConvert', () => {
    it('should convert meters to kilometers', async () => {
      const result = await siConvert(1000, 'm', 'km');
      expect(result.success).toBe(true);
      expect(result.data).toContain('1');
    });

    it('should convert kilograms to grams', async () => {
      const result = await siConvert(2, 'kg', 'g');
      expect(result.success).toBe(true);
    });

    it('should handle millimeters to meters', async () => {
      const result = await siConvert(500, 'mm', 'm');
      expect(result.success).toBe(true);
    });

    it('should reject incompatible units', async () => {
      const result = await siConvert(100, 'm', 'g');
      expect(result.success).toBe(false);
    });

    it('should reject unrecognized units', async () => {
      const result = await siConvert(100, 'xyz', 'm');
      expect(result.success).toBe(false);
    });
  });
});
