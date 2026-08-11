/**
 * 系统提示词构建模块
 * 根据启用的工具分类动态生成 AI 系统提示词
 *
 * 工具列表由 TOOL_DOCS（单一来源，R1.5）渲染，参数名 / 描述与 JSON Schema 同源，
 * 避免提示词与工具定义分叉。
 *
 * 工具调用统一走原生 function calling（R1.2/R2.5）：模型直接发送原生 tool_calls，
 */

import { readFileSync, existsSync } from 'fs';
import { getBasePath } from './tools/index.ts';
import { getMemoryContextHint } from './tools/memory.ts';
import { getEnabledCategories, getAllCategories, getToolsByCategory } from './registry.ts';
import { getToolParamDocs } from './tool-schema.ts';
import { TOOL_DOCS } from './tool-docs.ts';
import { getActivePersonaName, resolvePersonaPath } from './persona.ts';
import { loadConfig } from '../config.ts';

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
 * 每个分类的工具名取自 getToolsByCategory（动态派生），参数名与描述取自 TOOL_DOCS。
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
 * @param personaNameOverride 可选：覆盖当前活动人设。
 *   - 传入名称 → 使用该人设（如微信信道强制默认人设）
 *   - 传入 null → 使用默认人设（Cogito）
 *   - undefined → 使用当前活动人设（默认行为）
 */
function buildSystemPrompt(personaNameOverride?: string | null): string {
  const workspace = getBasePath();
  const enabledCategories = getEnabledCategories();
  const enabledCount = enabledCategories.length;
  const totalCount = Object.keys(getAllCategories()).length;

  const languageInstruction =
    '\n\n## 语言规则\n- 请使用用户输入所使用的语言来回复。\n- 如果用户用中文提问，就用中文回复；如果用英文提问，就用英文回复；以此类推。\n- 保持回复语言与用户消息语言一致。\n';

  // 读取 persona（支持热切换）：直接按活动人设名称读取 personas/ 文件夹，
  // 不再复制文件到数据目录（避免残留 persona.md 永远顶着默认人设）。
  // 活动人设为 null 时读取默认人设 personas/cogito/persona.md（Cogito）。
  let personaHeader = '';
  try {
    const personaPath = resolvePersonaPath(
      personaNameOverride !== undefined ? personaNameOverride : getActivePersonaName(),
    );
    if (existsSync(personaPath)) {
      const personaContent = readFileSync(personaPath, 'utf-8');
      if (personaContent.trim()) {
        personaHeader = personaContent + '\n\n---\n\n';
      }
    }
  } catch {
    // 未配置 persona 文件时使用默认提示词
  }

  const protocolHeader = '## ⚠️ 工具调用规则（原生 function calling）';

  const protocolRules = `### 规则：用原生 function calling 调用工具
当你需要使用工具时，直接发送原生 tool_calls，工具名与参数以系统提供的 JSON Schema 为准。
一次可以并行发送多个独立的 tool_calls；不要输出任何文本形式的工具调用标记。
调用工具后等待系统返回 \`role: tool\` 的工具结果，再基于真实结果继续。禁止编造或猜测工具结果。

### 规则：用文字回复表示完成
当你完成输出、需要等待用户输入时，直接输出文字即可，系统会自动结束本轮思考。
**不要在回复中输出任何文本标记。**`;

  const outputFormat = `- 调用工具：通过原生 function calling 发送 tool_calls（参数为合法 JSON）
- 普通对话：直接输出文字
- 说完等回复：直接输出文字，末尾无需任何标记`;

  // R1.8 结构化输出指令：开启 strict 模式时，最终回复必须是符合 schema 的 JSON 对象。
  let structuredOutputNote = '';
  try {
    const so = loadConfig().chat?.structuredOutput;
    if (so?.strict === true) {
      const schemaName = (so.schema as { title?: string } | undefined)?.title || 'agent_output';
      structuredOutputNote = `\n\n## 结构化输出模式\n你当前处于结构化输出模式（strict）。每轮最终回复必须是**且仅是**一个符合 JSON Schema 的 JSON 对象，不要输出任何 JSON 之外的解释性文字或 Markdown 代码块标记。Schema 名称：${schemaName}。\n`;
    }
  } catch {
    /* 配置读取失败时忽略，不影响普通对话 */
  }

  const basePrompt = `${languageInstruction}${personaHeader}${protocolHeader}

${protocolRules}

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
1. 执行原生 tool_calls 并自动捕获结果
2. 将结果作为 role: tool 消息注入到对话上下文中
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
当工具调用失败（如文件不存在、无权限、超时等）时：
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
- ✅ **必须**基于实际情况给出回应，不空想

### 响应模板示例
- 工具调用失败："很抱歉，我无法完成这个操作。[工具名称]调用失败，原因可能是：[简要说明]。请检查相关条件后重试。"
- 无结果："抱歉，没有找到相关信息。[工具名称]返回的结果为空。"
- 无法确定："根据现有信息，我无法确定这个问题的答案。"

## 输出格式
${outputFormat}
${structuredOutputNote}
开始你的探索吧！`;

  return basePrompt;
}

export { buildSystemPrompt, buildToolList };
