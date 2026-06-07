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
├── index.js          # 所有工具的统一导出入口
├── path.js           # 工作区路径相关工具
├── file.js           # 文件系统操作工具
├── web.js            # 网页相关工具
├── system.js         # 系统操作工具
└── TOOL_DEVELOPMENT.md  # 本文档
```

---

## 2. 工具分类

工具按照功能进行分组：

| 文件       | 用途                                          |
|------------|-----------------------------------------------|
| path.js    | 工作区路径相关的工具函数                       |
| file.js    | 文件/目录的读写、修改操作                      |
| web.js     | 网页搜索、抓取、打开操作                      |
| system.js  | 系统/软件操作相关                             |

为你的新工具选择最合适的分类文件，如果没有合适的，可以创建新的分类文件。

---

## 3. 分步开发指南

### 第一步：编写工具实现代码

打开对应的分类文件（例如 `file.js`、`system.js`），添加你的工具函数。

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
      data: `操作完成: ${result}`
    };
  } catch (error) {
    // 错误响应
    return {
      success: false,
      error: `执行失败: ${error.message}`
    };
  }
}
```

### 第二步：从分类文件导出工具

在同一个分类文件中，将你的工具添加到 `export` 语句中：

```javascript
export { ls, read, copy, mkdir, create, myNewTool };
```

### 第三步：在 `index.js` 中重新导出

更新 `src/agent/tools/index.js` 来重新导出你的新工具：

```javascript
import { getBasePath } from './path.js';
import { ls, read, copy, mkdir, create, myNewTool } from './file.js'; // 在这里添加
import { search, browse, fetchPage } from './web.js';
import { listApps, openApp, closeApp } from './system.js';

export {
  getBasePath,
  ls,
  read,
  copy,
  mkdir,
  create,
  myNewTool,  // 在这里添加
  search,
  browse,
  fetchPage,
  listApps,
  openApp,
  closeApp
};
```

### 第四步：更新 `Agent.js`

在 `Agent.js` 的 `executeTool` 函数中添加你的工具：

```javascript
async function executeTool(toolName, args) {
  switch (toolName) {
    // ... 现有工具
    case 'myNewTool':
      return await myNewTool(args[0], args[1]);
    default:
      return { success: false, error: `未知工具: ${toolName}` };
  }
}
```

同时更新顶部的 import 语句：

```javascript
import {
  ls,
  read,
  copy,
  mkdir,
  create,
  search,
  browse,
  fetchPage,
  listApps,
  openApp,
  closeApp,
  myNewTool,  // 在这里添加
  getBasePath
} from './tools/index.js';
```

### 第五步：更新 `prompt.js` 中的系统提示词

将你的工具描述添加到系统提示词中，这样智能体就知道它的存在了：

```javascript
## 可用工具
你可以调用以下工具来操作文件：
- ls(path) - 列出目录内容（只列出一级内容）
- read(path) - 读取文件内容
// ... 现有工具
- myNewTool(param1, param2) - 简短描述这个工具的功能
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
1. **启动 CogitoAgent**: 运行 `npm start`
2. **触发工具**: 让智能体使用你的新工具
3. **检查输出**: 验证：
   - 工具执行完成，没有报错
   - 结果出现在终端中
   - 工具行为符合预期
4. **检查历史**: 验证对话历史被正确保存

### 常见问题
| 问题                           | 原因                                  | 修复方法                            |
|--------------------------------|---------------------------------------|-------------------------------------|
| "Unknown tool" 错误            | 工具未添加到 `executeTool`            | 在 `executeTool` switch 中添加 case |
| 智能体不调用工具               | 工具未在系统提示词中列出              | 在 `prompt.js` 中添加工具描述       |
| 导入时工具崩溃                 | 缺少或损坏的导入                      | 检查导入和依赖项                    |

---

## 完整示例：添加 "rename" 重命名工具

### 1. 添加到 `file.js`
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

### 2. 更新 `index.js`
```javascript
import { ls, read, copy, mkdir, create, rename } from './file.js';
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

### 3. 更新 `Agent.js`
```javascript
// 导入
import {
  // ... 其他工具
  rename,
  getBasePath
} from './tools/index.js';

// 执行
case 'rename':
  return await rename(args[0], args[1]);
```

### 4. 更新 `prompt.js`
在工具列表中添加：
```
- rename(oldPath, newPath) - 重命名文件或目录
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
