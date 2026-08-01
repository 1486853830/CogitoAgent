---
title: '[Good First Issue] 添加 YAML 文件处理工具 / Add YAML Processing Tools'
labels: ['good first issue', 'enhancement', 'area: tools']
---

## 任务描述 / Task Description

为 CogitoAgent 添加 YAML 文件处理能力，支持读取、写入和验证 YAML 文件。
Add YAML file processing capabilities to CogitoAgent, supporting reading, writing, and validating YAML files.

### 需要实现的功能 / Features to Implement

在 `src/agent/tools/` 下新建 `yaml.ts`，包含以下工具函数：
Create a new `yaml.ts` file under `src/agent/tools/` with the following tool functions:

1. `readYaml(filePath: string)` - 读取并解析 YAML 文件 / Read and parse a YAML file
2. `writeYaml(filePath: string, data: object)` - 将对象写入 YAML 文件 / Write an object to a YAML file
3. `yamlToJson(filePath: string)` - 将 YAML 文件转换为 JSON / Convert a YAML file to JSON
4. `jsonToYaml(filePath: string)` - 将 JSON 文件转换为 YAML / Convert a JSON file to YAML

### 依赖 / Dependencies

通过 `npm install js-yaml` 添加 `js-yaml` 包。
Add the `js-yaml` package via `npm install js-yaml`.

### 注册工具 / Register Tools

在 `src/agent/registry.ts` 中注册新工具。
Register the new tools in `src/agent/registry.ts`.

### 验收标准 / Acceptance Criteria

- [ ] 能正确读写标准的 YAML 文件 / Can correctly read and write standard YAML files
- [ ] 支持 YAML 注释（保留或忽略均可）/ Supports YAML comments (preserving or ignoring both acceptable)
- [ ] 注册到工具注册表，LLM 可调用 / Registered in the tool registry, callable by LLM
- [ ] 添加对应的单元测试 `tests/unit/yaml.test.ts` / Add corresponding unit tests `tests/unit/yaml.test.ts`

### 难度 / Difficulty

⭐⭐ 中等 / Intermediate

### 学习资源 / Learning Resources

- 参考 `src/agent/tools/data.ts` 了解工具实现模式 / Refer to `src/agent/tools/data.ts` for the tool implementation pattern
- 参考 `src/agent/registry.ts` 了解工具注册方式 / Refer to `src/agent/registry.ts` for how tools are registered
- [js-yaml 文档](https://github.com/nodeca/js-yaml) / [js-yaml documentation](https://github.com/nodeca/js-yaml)
