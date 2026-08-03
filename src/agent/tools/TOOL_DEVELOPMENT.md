# 工具开发指南

本指南详细说明如何为 CogitoAgent 开发新工具并将其集成到系统中。

## 目录

1. [项目结构](#1-项目结构)
2. [工具分类](#2-工具分类)
3. [分步开发指南](#3-分步开发指南)
4. [工具 API 规范](#4-工具-api-规范)
5. [测试指南](#5-测试指南)

---

## 1. 项目结构

工具统一放置在 `src/agent/tools/` 目录下：

```
src/agent/tools/
├── index.ts          # 所有工具的统一导出入口
├── path.ts           # 工作区路径相关工具
├── file.ts           # 文件系统操作工具
├── web.ts            # 网页相关工具
├── system.ts         # 系统操作工具
├── browser.ts        # 浏览器自动化工具
├── code.ts           # 代码执行工具
├── git.ts            # Git 版本控制工具
├── task.ts           # 任务管理工具
├── memory.ts         # 记忆系统工具
├── data.ts           # 数据处理工具
├── db.ts             # 数据库工具
├── email.ts          # 邮件工具
├── monitor.ts        # 系统监控工具
├── scheduler.ts      # 定时任务工具
├── ocr.ts            # OCR 图像识别工具
└── TOOL_DEVELOPMENT.md  # 本文档
```

---

## 2. 工具分类

工具按照功能进行分组：

| 文件         | 用途                       |
| ------------ | -------------------------- |
| path.ts      | 工作区路径相关的工具函数   |
| file.ts      | 文件/目录的读写、修改操作  |
| web.ts       | 网页搜索、抓取、打开操作   |
| system.ts    | 系统/软件操作相关          |
| browser.ts   | 浏览器自动化（Playwright） |
| code.ts      | JavaScript/Python 代码执行 |
| git.ts       | Git 版本控制操作           |
| task.ts      | 任务创建、管理、分解       |
| memory.ts    | 记忆存储、搜索、管理       |
| data.ts      | CSV/JSON 数据处理          |
| db.ts        | SQLite 数据库操作          |
| email.ts     | 邮件发送                   |
| monitor.ts   | 系统资源监控               |
| scheduler.ts | 定时任务管理               |
| ocr.ts       | 图像文字识别               |

为你的新工具选择最合适的分类文件，如果没有合适的，可以创建新的分类文件。

---

## 3. 分步开发指南

### 第一步：编写工具实现代码

打开对应的分类文件（例如 `file.ts`、`system.ts`），添加你的工具函数。

#### 示例实现：

```javascript
/**
 * 简短描述这个工具的功能
 * @param {string} param1 - 参数1 的说明
 * @param {number} [param2] - 可选参数2（默认值为0）
 * @returns {Promise<Object>} 返回结果对象，包含 success/data/error
 */
async function myNewTool(param1, param2 = 0) {
  try {
    // 你的工具逻辑写在这里
    const result = await someAsyncOperation(param1);

    // 成功响应
    return {
      success: true,
      data: `操作完成: ${result}`,
    };
  } catch (error) {
    // 错误响应
    return {
      success: false,
      error: `执行失败: ${error.message}`,
    };
  }
}
```

### 第二步：从分类文件导出工具

在同一个分类文件中，将你的工具添加到 `export` 语句中：

```javascript
export { ls, read, copy, mkdir, create, myNewTool };
```

### 第三步：在 `index.ts` 中重新导出

更新 `src/agent/tools/index.ts` 来重新导出你的新工具：

```javascript
import { getBasePath } from './path.ts';
import { ls, read, copy, mkdir, create, myNewTool } from './file.ts'; // 在这里添加
import { search, browse, fetchPage } from './web.ts';
import { listApps, openApp, closeApp } from './system.ts';

export {
  getBasePath,
  ls,
  read,
  copy,
  mkdir,
  create,
  myNewTool, // 在这里添加
  search,
  browse,
  fetchPage,
  listApps,
  openApp,
  closeApp,
};
```

### 第四步：在 `registry.ts` 中注册工具

**这是关键步骤！** 在 `src/agent/registry.ts` 的 `TOOL_REGISTRY` 对象中添加注册：

```javascript
const TOOL_REGISTRY = {
  // ... 现有工具

  // 你的新工具
  myNewTool: { fn: tools.myNewTool, argCount: 2, category: 'file' },
};
```

**参数说明：**

- `fn`: 工具函数引用（从 `tools/index.ts` 导入）
- `argCount`: 工具接受的参数数量
- `category`: 工具分类（用于分组显示和权限控制）
- `customArgs`: （可选）如果参数需要特殊解析，设为 `true`

### 第五步：在 `session.ts` 中添加分类描述

**这一步让 AI 知道工具的存在！** 在 `src/agent/session.ts` 的 `buildToolList()` 函数的 `switch/case` 中添加：

```javascript
switch (category) {
  // ... 现有分类

  case 'myCategory':
    toolList += `### 我的分类工具
- myNewTool(param1, param2) - 简短描述这个工具的功能

`;
    break;
}
```

**如果使用现有分类**（如 `file`），只需在该分类的工具列表中添加一行：

```javascript
case 'file':
  toolList += `### 文件操作工具
- ls(path) - 列出目录内容
- read(path) - 读取文件内容
- myNewTool(param1, param2) - 简短描述这个工具的功能  // 添加这行

`;
  break;
```

### 第六步（可选）：更新 `config.ts`

如果新工具需要额外配置（如 API Key、服务地址），在 `src/config.ts` 中添加：

```javascript
const defaultConfig = {
  // ... 现有配置

  myTool: {
    enabled: true,
    apiKey: '',
    baseURL: '',
  },
};
```

并在环境变量解析部分添加：

```javascript
if (process.env.MY_TOOL_API_KEY) {
  config.myTool.apiKey = process.env.MY_TOOL_API_KEY;
}
```

---

## 4. 工具 API 规范

### 工具函数要求

- **异步**: 所有工具必须返回 Promise
- **返回对象**: 必须始终返回如下结构的对象：

```javascript
{
  success: boolean;     // true = 成功, false = 失败
  data?: string;        // 成功时的结果内容
  error?: string;       // 失败时的错误信息
}
```

### 重要指南

1. **工作区限制**: 文件操作时始终使用 `getBasePath()`，确保操作在用户的工作区内
2. **错误处理**: 始终用 `try/catch` 包裹逻辑，并返回结构化的错误信息
3. **用户安全**: 避免没有安全措施的破坏性操作（例如，不要在没有验证的情况下删除文件）
4. **性能**: 保持工具快速，避免在主循环中运行长时间操作
5. **文档**: 包含 JSDoc 注释，解释参数和行为

---

## 5. 测试指南

### 测试步骤

1. **启动 CogitoAgent**: 运行 `npm run electron` 或 `npm run cli`
2. **触发工具**: 让智能体使用你的新工具
3. **检查输出**: 验证：
   - 工具执行完成，没有报错
   - 结果出现在终端中
   - 工具行为符合预期
4. **检查历史**: 验证对话历史被正确保存

### 常见问题

| 问题                | 原因                                 | 修复方法                           |
| ------------------- | ------------------------------------ | ---------------------------------- |
| "Unknown tool" 错误 | 工具未在 `registry.ts` 注册          | 在 `TOOL_REGISTRY` 中添加注册      |
| 智能体不调用工具    | 工具未在 `session.ts` 分类描述中列出 | 在 `buildToolList()` switch 中添加 |
| 导入时工具崩溃      | 缺少或损坏的导入                     | 检查导入和依赖项                   |
| 参数解析错误        | `argCount` 与实际参数数量不匹配      | 检查并修正 `argCount` 值           |

---

## 完整示例：添加 "rename" 重命名工具

### 1. 添加到 `file.ts`

```javascript
/**
 * 重命名文件或目录
 * @param {string} oldPath - 源路径
 * @param {string} newPath - 目标路径
 * @returns {Promise<Object>} 结果对象
 */
async function rename(oldPath, newPath) {
  const basePath = getBasePath();
  const fullOldPath = path.isAbsolute(oldPath) ? oldPath : path.join(basePath, oldPath);
  const fullNewPath = path.isAbsolute(newPath) ? newPath : path.join(basePath, newPath);

  try {
    await fs.rename(fullOldPath, fullNewPath);
    return { success: true, data: `重命名完成: ${oldPath} → ${newPath}` };
  } catch (error) {
    return { success: false, error: `重命名失败: ${error.message}` };
  }
}

// 更新导出
export { ls, read, copy, mkdir, create, rename };
```

### 2. 更新 `index.ts`

```javascript
import { ls, read, copy, mkdir, create, rename } from './file.ts';
// ...
export {
  ls,
  read,
  copy,
  mkdir,
  create,
  rename,
  // ... 其他工具
};
```

### 3. 更新 `registry.ts`

```javascript
const TOOL_REGISTRY = {
  // ... 现有工具

  rename: { fn: tools.rename, argCount: 2, category: 'file' },
};
```

### 4. 更新 `session.ts`

在 `file` 分类中添加：

```javascript
case 'file':
  toolList += `### 文件操作工具
- ls(path) - 列出目录内容
- read(path) - 读取文件内容
- copy(src, dest) - 复制文件
- mkdir(path) - 创建目录
- create(path, content) - 创建文件
- rename(oldPath, newPath) - 重命名文件或目录

`;
  break;
```

---

## 最佳实践

- **模块化**: 每个工具专注于一个功能
- **一致性**: 遵循与现有工具相同的返回格式和编码风格
- **可读性**: 编写清晰的代码并添加注释
- **向后兼容**: 避免破坏现有工具的签名
- **文档**: 添加新功能时及时更新本指南

---

## 需要帮助？

参考现有工具的实现方式 - 它们都遵循相同的结构！
