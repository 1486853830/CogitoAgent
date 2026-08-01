---
title: '[Good First Issue] 为工具函数补充 JSDoc 注释 / Add JSDoc Annotations to Tool Functions'
labels: ['good first issue', 'documentation', 'area: tools']
---

## 任务描述 / Task Description

为 `src/agent/tools/` 目录下的工具函数补充缺失的 JSDoc 注释。
Add missing JSDoc annotations to the tool functions in the `src/agent/tools/` directory.

### 需要补充的文件 / Files to Update

- `src/agent/tools/gis.ts` - GIS 地理信息工具 / GIS geographic information tools
- `src/agent/tools/bio.ts` - 生命科学工具 / Life science tools
- `src/agent/tools/med.ts` - 医学工具 / Medical tools
- `src/agent/tools/chem.ts` - 化学工具 / Chemistry tools

### JSDoc 格式要求 / JSDoc Format Requirements

每个函数需要包含：
Each function should include:

````typescript
/**
 * 函数简短描述（中文）
 * Short description in English
 *
 * @param paramName - 参数描述 / Parameter description
 * @returns 返回值描述 / Return value description
 * @example
 * ```ts
 * functionName(args)
 * ```
 */
````

### 参考示例 / Reference Examples

查看 `src/agent/tools/finance.ts` 或 `src/agent/tools/math.ts` 中已有的 JSDoc。
Refer to existing JSDoc in `src/agent/tools/finance.ts` or `src/agent/tools/math.ts`.

### 验收标准 / Acceptance Criteria

- [ ] 所有公共函数都有 JSDoc 注释 / All public functions have JSDoc annotations
- [ ] 中英双语描述 / Descriptions are bilingual (Chinese and English)
- [ ] 包含 `@param` 和 `@returns` 标签 / Includes `@param` and `@returns` tags
- [ ] 关键函数有 `@example` / Key functions include `@example`

### 难度 / Difficulty

⭐ 简单（适合首次贡献者，也适合练习英文）/ Easy (suitable for first-time contributors and English practice)
