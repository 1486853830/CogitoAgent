---
title: '[Good First Issue] Improve Error Messages for Tool Modules / 改进工具模块的错误提示信息'
labels: ['good first issue', 'enhancement', 'area: tools']
---

## Task Description / 任务描述

Currently, some tool modules return unfriendly error messages when parameters are incorrect or execution fails, making it difficult for the LLM to understand how to fix the issue.
目前部分工具模块在参数错误或执行失败时，返回的错误信息不够友好，LLM 难以理解如何修正。

### Modules to Improve / 需要改进的模块

- `src/agent/tools/gis.ts` - GIS Tools / GIS 工具
- `src/agent/tools/chem.ts` - Chemistry Tools / 化学工具
- `src/agent/tools/med.ts` - Medical Tools / 医学工具

### Improvement Requirements / 改进要求

For each function, ensure the error message contains the following:
对每个函数，确保错误信息包含：

1. **Error Cause** — Which parameter/operation went wrong / **错误原因** — 什么参数/操作出了问题
2. **Expected Value** — The expected parameter type or range / **期望值** — 期望的参数类型或范围
3. **Actual Value** — The value actually passed by the user / **实际值** — 用户实际传入的值
4. **Fix Suggestion** — How to fix this error / **修正建议** — 如何修复这个错误

### Example / 示例

```typescript
// Before improvement / 改进前
throw new Error('Invalid parameter');

// After improvement / 改进后
throw new Error(
  `Invalid coordinate format: expected "lat,lng" (e.g. "39.9042,116.4074"), got "${input}"`,
);
```

### Acceptance Criteria / 验收标准

- [ ] Every function has at least one friendly error message / 每个函数至少有一个友好的错误提示
- [ ] Error messages include the actual parameter value / 错误提示包含实际参数值
- [ ] Does not affect existing functionality / 不影响现有功能

### Difficulty / 难度

⭐ Easy (Suitable for first-time contributors) / 简单（适合首次贡献者）
