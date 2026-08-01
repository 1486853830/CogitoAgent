---
title: '[Good First Issue] 为数学统计工具模块添加单元测试 / Add Unit Tests for Math Tools'
labels: ['good first issue', 'test', 'area: tools']
---

## 任务描述 / Task Description

为 `src/agent/tools/math.ts` 中的数学统计工具函数添加单元测试。
Add unit tests for the math and statistics tool functions in `src/agent/tools/math.ts`.

### 需要测试的函数 / Functions to Test

- `describe()` - 描述统计（均值、中位数、标准差等）/ Descriptive statistics (mean, median, standard deviation, etc.)
- `correlation()` - 相关系数 / Correlation coefficient
- `linearRegression()` - 线性回归 / Linear regression
- `matrixMultiply()` - 矩阵乘法 / Matrix multiplication
- `matrixDeterminant()` - 矩阵行列式 / Matrix determinant
- `solveQuadratic()` - 一元二次方程求解 / Quadratic equation solver

### 测试文件位置 / Test File Location

`tests/unit/math.test.ts`

### 验收标准 / Acceptance Criteria

- [ ] 每个函数至少覆盖 3 个测试用例 / Each function is covered by at least 3 test cases
- [ ] 测试通过 `npm test` / Tests pass with `npm test`
- [ ] 测试命名遵循 `describe/it` 模式 / Test naming follows the `describe/it` pattern

### 难度 / Difficulty

⭐ 简单（适合首次贡献者）/ Easy (suitable for first-time contributors)

### 提示 / Tips

矩阵运算的测试用例可以手动计算验证结果。
Test cases for matrix operations can be verified by manual calculation.
