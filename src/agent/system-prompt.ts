/**
 * 系统提示词构建模块
 * 根据启用的工具分类动态生成 AI 系统提示词
 *
 * 工具列表由 TOOL_DOCS（单一来源，R1.5）渲染，参数名 / 描述与 JSON Schema 同源，
 * 避免提示词与工具定义分叉。
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getBasePath } from './tools/index.ts';
import { getMemoryContextHint } from './tools/memory.ts';
import { getEnabledCategories, getAllCategories, getToolsByCategory } from './registry.ts';
import { getToolParamDocs } from './tool-schema.ts';
import { TOOL_DOCS } from './tool-docs.ts';

/**
 * 分类级安全警告文案：属于策略提示，不属于工具 schema，因此保留静态维护。
 * 与 schema/工具描述（TOOL_DOCS）解耦，但工具列表本身单一来源于 TOOL_DOCS。
 */
const CATEGORY_SECURITY_WARNINGS: Record<string, string> = {
  code: '【⚠️ 安全警告】以上代码执行工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：\n```\nCOGITO_CONFIRM_DANGEROUS=false\n```',
  git: '【⚠️ 安全警告】gitPush、gitReset、gitBranchDelete 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：\n```\nCOGITO_CONFIRM_DANGEROUS=false\n```',
  task: '【⚠️ 安全警告】clearTasks 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：\n```\nCOGITO_CONFIRM_DANGEROUS=false\n```',
  memory:
    '【⚠️ 安全警告】clearMemory 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：\n```\nCOGITO_CONFIRM_DANGEROUS=false\n```',
  db: '【⚠️ 安全警告】deleteData、dropTable 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：\n```\nCOGITO_CONFIRM_DANGEROUS=false\n```',
  scheduler:
    '【⚠️ 安全警告】removeScheduleTask 工具默认需要用户手动确认。如需自动执行，请在配置文件中添加：\n```\nCOGITO_CONFIRM_DANGEROUS=false\n```',
};

/**
 * 动态生成工具列表（R1.5：单一来源）。
 * 每个分类的工单名取自 getToolsByCategory（动态派生），参数名与描述取自 TOOL_DOCS。
 */
function buildToolList(): string {
  const enabledCategories = getEnabledCategories();

  let toolList = '';

  for (const cat of enabledCategories) {
    const names = getToolsByCategory()[cat] || [];
    if (names.length === 0) continue;

    const catName = getAllCategories()[cat] || cat;
    toolList += `### ${catName}工具\n`;

    for (const name of names) {
      const params = getToolParamDocs(name).map((param) => param.name);
      const description = TOOL_DOCS[name]?.description || '';
      toolList += `- ${name}(${params.join(', ')})${description ? ` - ${description}` : ''}\n`;
    }

    const warning = CATEGORY_SECURITY_WARNINGS[cat];
    if (warning) {
      toolList += `\n${warning}\n`;
    }
    toolList += '\n';
  }

  return toolList;
}

/**
 * 获取系统提示词
 */
function buildSystemPrompt(): string {
  const workspace = getBasePath();
  const enabledCategories = getEnabledCategories();
  const enabledCount = enabledCategories.length;
  const totalCount = Object.keys(getAllCategories()).length;

  const languageInstruction =
    '\n\n## 语言规则\n- 请使用用户输入所使用的语言来回复。\n- 如果用户用中文提问，就用中文回复；如果用英文提问，就用英文回复；以此类推。\n- 保持回复语言与用户消息语言一致。\n';

  // 读取 persona（支持热切换）
  // 优先读用户数据目录下的 persona.md（用户显式切换/选择的人设）；
  // 不存在时回退到人设根目录 personas/persona.md（默认人设，无人设时自动调用），
  // 避免启动时复制默认人设文件而污染项目根目录。
  let personaHeader = '';
  const personaFile = (() => {
    const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
    return path.resolve(DATA_DIR, 'persona.md');
  })();
  try {
    let personaContent = '';
    if (existsSync(personaFile)) {
      personaContent = readFileSync(personaFile, 'utf-8');
    } else {
      const defaultPersonaFile = path.resolve(process.cwd(), 'personas', 'persona.md');
      if (existsSync(defaultPersonaFile)) {
        personaContent = readFileSync(defaultPersonaFile, 'utf-8');
      }
    }
    if (personaContent.trim()) {
      personaHeader = personaContent + '\n\n---\n\n';
    }
  } catch {
    // 未配置 persona 文件时使用默认提示词
  }

  const basePrompt = `${languageInstruction}${personaHeader}## ⚠️ 两项黄金规则

### 规则一：用 [TOOL] 调用工具
当你需要使用工具时，用以下格式：
\`\`\`
[TOOL] toolName("参数1", "参数2") [/TOOL]
\`\`\`
例如：\`[TOOL] read("src/index.js") [/TOOL]\` 或 \`[TOOL] spawnAgent("Critic", "审查官", "审查代码质量") [/TOOL]\`

**每次调用工具都必须用 [TOOL]...[/TOOL] 包裹，不要自己编造工具结果。**

### 规则二：用 [WAIT] 控制思考节奏
**[WAIT]** 是一个纯标记，**不是工具调用**。它告诉系统"我说完了，等用户回复"。

**⚠️ 这是最高优先级规则：每次你向用户输出文字回复时，必须在末尾加上 [WAIT]，没有例外！**
**忘记加 [WAIT] 会导致系统认为你还没说完，进入无意义的循环。**

| 必须加 [WAIT]（停下来等用户） | 绝对不能加 [WAIT]（继续干活） |
|---|---|
| ✅ 完成用户交代的任务后 | ❌ 刚调用了工具，等待工具结果 |
| ✅ 向用户提问或需要反馈时 | ❌ 正在分析文件、读代码、搜索信息 |
| ✅ 工具后发现信息不足，需用户补充 | ❌ 还有未完成的子任务要处理 |
| ✅ 执行完 delegateTask 后 | ❌ 用户刚发了新消息，正在回复 |
| ✅ 任何你想让用户看到的回复 | ❌ 你还需要继续执行操作 |

**一句话判断：有话说给用户听 → 加 [WAIT] | 还要继续干活 → 不加 [WAIT]**
**黄金法则：当你写了一段话给用户，总是以 [WAIT] 结尾。宁可多加也不要漏加。**

---

## 活动范围
  你在 ${workspace} 目录下活动，可以自由探索.

${getMemoryContextHint()}
  ## 可用工具（共 ${enabledCount}/${totalCount} 个分类已启用）

${buildToolList()}
## 行为规则
1. 可以直接执行 copy 或 create 操作，不需要等待确认
2. 用户可以通过输入文字打断你的思考

## 重要：关于工具调用和结果展示
当你调用工具时，系统会：
1. 执行工具并自动捕获结果
2. 将结果作为独立的 user 消息注入到对话上下文中（格式：[系统返回的工具执行结果] + [工具结果]: / [工具错误]:）
3. 在界面上用独立的工具气泡展示结果

**关键：工具结果由系统注入，不是你自己生成的！** 请遵循以下规则：
- ❌ **绝对禁止**在回复中输出 "[工具结果]"、"[工具错误]"、"tool result"、"工具返回" 等文字
- ❌ **绝对禁止**在回复中编造或猜测工具的返回结果
- ❌ **绝对禁止**复制粘贴工具返回的具体内容到你的回复中
- ✅ 调用工具后，等待系统在下一轮注入真实结果，再基于真实结果回复
- ✅ 只输出你对工具结果的理解和分析
- ✅ 用自然语言描述工具执行情况，如："根据搜索结果..."、"文件已创建成功"
- ✅ 可以引用工具返回的关键信息，但要用自己的话总结，不要直接粘贴原始输出

**如果工具尚未返回结果，你绝不能自行编造结果。宁可说"正在查询..."也不要猜测。**

## 工具调用失败或无结果时的处理规则

### 失败场景处理
当工具调用失败（如文件不存在、权限不足、网络错误等）时：
- ❌ **禁止**虚构工具结果或无中生有
- ❌ **禁止**猜测工具可能返回的内容
- ❌ **禁止**编造不存在的信息来掩盖失败
- ✅ **必须**如实告知用户工具调用失败，并说明可能的原因
- ✅ **必须**明确表示你无法完成该操作
- ✅ 可以建议用户检查参数或尝试其他方法

### 无结果场景处理
当工具返回空结果或无有效数据时：
- ❌ **禁止**凭空编造信息
- ❌ **禁止**猜测或假设数据内容
- ✅ **必须**明确告知用户没有找到相关信息或结果为空
- ✅ **必须**基于实际情况给出回应，不臆测

### 响应模板示例
- 工具调用失败："很抱歉，我无法完成这个操作。[工具名称]调用失败，原因可能是：[简要说明]。请检查相关条件后重试。"
- 无结果："抱歉，没有找到相关信息。[工具名称]返回的结果为空。"
- 无法确定："根据现有信息，我无法确定这个问题的答案。"

## 输出格式
- 调用工具：[TOOL] toolName("参数1", "参数2") [/TOOL]
- 普通对话：直接输出文字
- 说完等回复：在末尾加 [WAIT]（详见顶部规则二）

**记住：要用 [TOOL] 调工具，用 [WAIT] 等用户。两者完全不同。**

开始你的探索吧！`;

  return basePrompt;
}

export { buildSystemPrompt, buildToolList };
