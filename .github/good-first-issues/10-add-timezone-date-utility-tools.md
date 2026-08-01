---
title: '[Good First Issue] Add Timezone and Date Utility Tools Module / 添加时区和日期工具模块'
labels: ['good first issue', 'enhancement', 'area: tools']
---

## Task Description / 任务描述

Add timezone and date processing tools to CogitoAgent, making it easier for the LLM to handle time-related tasks.
为 CogitoAgent 添加时区和日期处理工具，方便 LLM 处理时间相关任务。

### Features to Implement / 需要实现的功能

Create a new file `datetime.ts` under `src/agent/tools/`, containing the following utility functions:
在 `src/agent/tools/` 下新建 `datetime.ts`，包含以下工具函数：

1. `getCurrentTime(timezone?: string)` - Get the current time (with timezone support) / 获取当前时间（支持时区）
2. `convertTimezone(date: string, fromTz: string, toTz: string)` - Timezone conversion / 时间转换
3. `dateDiff(date1: string, date2: string, unit: string)` - Date difference calculation / 日期差计算
4. `formatDate(date: string, format: string, timezone?: string)` - Date formatting / 日期格式化
5. `isWeekend(date?: string)` - Check if a date is a weekend / 判断是否为周末
6. `getTimezones()` - List all supported timezones / 列出所有支持的时区

### Dependencies / 依赖

Use Node.js built-in `Intl.DateTimeFormat` and `Intl.supportedValuesOf`. No additional third-party packages required.
使用 Node.js 内置的 `Intl.DateTimeFormat` 和 `Intl.supportedValuesOf`。不需要额外安装第三方包。

### Register Tools / 注册工具

Register the new tools in `src/agent/registry.ts`.
在 `src/agent/registry.ts` 中注册新工具。

### Acceptance Criteria / 验收标准

- [ ] Support common timezones (e.g. Asia/Shanghai, America/New_York) / 支持常见的时区（如 Asia/Shanghai, America/New_York）
- [ ] Handle Daylight Saving Time (DST) / 处理夏令时
- [ ] Registered in the tool registry, callable by the LLM / 注册到工具注册表，LLM 可调用
- [ ] Add corresponding unit tests `tests/unit/datetime.test.ts` / 添加对应的单元测试 `tests/unit/datetime.test.ts`

### Difficulty / 难度

⭐⭐ Medium / 中等

### Learning Resources / 学习资源

- Refer to `src/agent/tools/data.ts` to understand the tool implementation pattern / 参考 `src/agent/tools/data.ts` 了解工具实现模式
- Refer to `src/agent/registry.ts` to understand how tools are registered / 参考 `src/agent/registry.ts` 了解工具注册方式
- [MDN: Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
