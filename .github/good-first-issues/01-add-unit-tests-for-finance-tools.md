---
title: '[Good First Issue] 为金融工具模块添加单元测试 / Add Unit Tests for Finance Tools'
labels: ['good first issue', 'test', 'area: tools']
---

## 任务描述 / Task Description

为 `src/agent/tools/finance.ts` 中的金融工具函数添加单元测试。
Add unit tests for the finance tool functions in `src/agent/tools/finance.ts`.

### 需要测试的函数 / Functions to Test

- `compoundInterest()` - 复利计算 / Compound interest calculation
- `presentValue()` - 现值计算 / Present value calculation
- `futureValueAnnuity()` - 年金终值 / Future value of annuity
- `npv()` - 净现值 / Net present value
- `loanPayment()` - 贷款月供 / Loan payment calculation
- `amortizationSchedule()` - 还款计划表 / Amortization schedule

### 测试文件位置 / Test File Location

`tests/unit/finance.test.ts`

### 参考示例 / Reference Examples

参考 `tests/unit/` 目录下已有的测试文件。
Refer to existing test files in the `tests/unit/` directory.

### 验收标准 / Acceptance Criteria

- [ ] 每个函数至少覆盖 3 个测试用例（正常值、边界值、异常值）/ Each function is covered by at least 3 test cases (normal, boundary, and exceptional values)
- [ ] 测试通过 `npm test` / Tests pass with `npm test`
- [ ] 测试命名遵循 `describe/it` 模式 / Test naming follows the `describe/it` pattern

### 难度 / Difficulty

⭐ 简单（适合首次贡献者）/ Easy (suitable for first-time contributors)

### 学习资源 / Learning Resources

- 查看 `tests/unit/` 目录下的现有测试了解测试风格 / Check existing tests in `tests/unit/` to understand the testing style
- 阅读 [Jest 文档](https://jestjs.io/docs/getting-started) / Read the [Jest documentation](https://jestjs.io/docs/getting-started)
