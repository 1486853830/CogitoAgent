/**
 * Agent Orchestrator - 智能体编排器
 * 管理子智能体集群的生命周期、任务调度和通信
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { streamChat } from '../api/client.ts';
import { TOOL_REGISTRY, isDangerousOperation, preprocessToolArgs } from './registry.ts';
import { broadcast } from '../io/ws-server.ts';
import { parseAllToolCalls } from './tool-parser.ts';

// ============================================
// SubAgent 类 - 子智能体实例
// ============================================
class SubAgent {
  id: string;
  persona: string;
  name: string;
  instruction: string;
  state: string; // idle | thinking | tool_executing | done | error
  messages: Array<{ role: string; content: string }>; // 对话历史
  result: unknown; // 最终结果
  createdAt: string;
  lastActiveAt: string;
  toolCalls: number; // 工具调用次数
  error: string | null; // 错误信息
  iterationCount: number; // 思考迭代次数

  constructor(id: string, persona: string, name: string, instruction: string) {
    this.id = id;
    this.persona = persona;
    this.name = name;
    this.instruction = instruction;
    this.state = 'idle';
    this.messages = [];
    this.result = null;
    this.createdAt = new Date().toISOString();
    this.lastActiveAt = this.createdAt;
    this.toolCalls = 0;
    this.error = null;
    this.iterationCount = 0;
  }
}

interface OperationResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

interface ClusterStatus {
  totalAgents: number;
  byState: Record<string, number>;
  agents: Array<Record<string, unknown>>;
}

interface ParallelTask {
  agentId: string;
  task: string;
}

interface PipelineStep {
  agentId: string;
  task: string;
  name?: string;
}

// ============================================
// AgentOrchestrator 类 - 智能体编排器
// ============================================
class AgentOrchestrator {
  agents: Map<string, SubAgent>;
  counter: number;
  maxIterations: number; // 单个任务最大迭代次数
  maxToolOutput: number; // 工具输出最大长度

  constructor() {
    this.agents = new Map();
    this.counter = 0;
    this.maxIterations = 5;
    this.maxToolOutput = 5000;
  }

  /**
   * 生成一个新的子智能体
   * @param personaName - Persona 名称（如 "Critic", "Programmer"）
   * @param name - 智能体显示名称
   * @param instruction - 角色指令/职责描述
   */
  async spawnAgent(
    personaName: string,
    name?: string,
    instruction?: string,
  ): Promise<OperationResult> {
    personaName = personaName || 'Assistant';
    name = name || `${personaName}_${this.counter + 1}`;
    instruction = instruction || '';

    // 验证 persona 存在
    const personaPath = path.resolve(process.cwd(), 'personas', personaName, 'persona.md');
    if (!existsSync(personaPath)) {
      return { success: false, error: `Persona "${personaName}" 不存在` };
    }

    const id = `agent_${++this.counter}`;
    const agent = new SubAgent(id, personaName, name, instruction);
    this.agents.set(id, agent);

    // 广播集群状态变化
    this._broadcastClusterState();

    return {
      success: true,
      data: {
        id,
        name,
        persona: personaName,
        instruction: instruction || '(无)',
        createdAt: agent.createdAt,
      },
    };
  }

  /**
   * 委托任务给指定子智能体
   * @param agentId - 智能体 ID
   * @param task - 任务描述
   */
  async delegateTask(agentId: string, task: string): Promise<OperationResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false, error: `智能体 "${agentId}" 不存在` };
    }

    if (agent.state === 'thinking' || agent.state === 'tool_executing') {
      return { success: false, error: `智能体 "${agent.name}" 正在执行中，请稍后` };
    }

    agent.state = 'thinking';
    agent.lastActiveAt = new Date().toISOString();
    agent.iterationCount = 0;
    this._broadcastClusterState();

    try {
      // 构建系统提示词
      const systemPrompt = await this._buildSystemPrompt(agent);

      // 构建消息列表
      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `## 你的任务\n\n${task}\n\n请根据你的角色定位和可用工具，完成上述任务。`,
        },
      ];

      // 执行智能体的思考-行动循环
      const result = await this._executeAgentLoop(agent, messages);

      agent.state = 'done';
      agent.result = result;
      this._broadcastClusterState();

      return { success: true, data: result };
    } catch (error: unknown) {
      agent.state = 'error';
      agent.error = (error as Error).message;
      this._broadcastClusterState();
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 并行执行多个任务（使用不同智能体）
   */
  async parallelExecute(tasks: ParallelTask[]): Promise<OperationResult[]> {
    const results = await Promise.allSettled(
      tasks.map((t) => this.delegateTask(t.agentId, t.task)),
    );
    return results.map((r, i) => ({
      agentId: tasks[i].agentId,
      task: tasks[i].task,
      success: r.status === 'fulfilled' && r.value.success,
      data: r.status === 'fulfilled' ? r.value.data : undefined,
      error:
        r.status === 'fulfilled' ? r.value.error : (r as PromiseRejectedResult).reason?.message,
    }));
  }

  /**
   * Panel Discussion - 多智能体就同一主题展开讨论
   * @param topic - 讨论主题
   * @param agentIds - 参与讨论的智能体 ID 列表
   * @param moderatorInstruction - 主持人指令（可选）
   */
  async panelDiscussion(
    topic: string,
    agentIds: string[],
    moderatorInstruction = '',
  ): Promise<OperationResult> {
    if (!agentIds || agentIds.length === 0) {
      return { success: false, error: '请至少指定一个智能体参与讨论' };
    }

    // 验证所有智能体存在
    const invalidIds = agentIds.filter((id) => !this.agents.has(id));
    if (invalidIds.length > 0) {
      return { success: false, error: `智能体不存在: ${invalidIds.join(', ')}` };
    }

    // 收集每个智能体的观点
    const opinions: Array<{
      agentId: string;
      agentName: string;
      persona: string;
      success: boolean;
      response?: unknown;
    }> = [];
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId)!;
      this._broadcastClusterState();

      const instruction = moderatorInstruction
        ? `参与以下讨论：\n\n主题：${topic}\n\n主持人的要求：${moderatorInstruction}\n\n请给出你的观点和分析。`
        : `请就以下主题发表你的观点和分析：\n\n${topic}`;

      try {
        const result = await this.delegateTask(agentId, instruction);
        opinions.push({
          agentId: agent.id,
          agentName: agent.name,
          persona: agent.persona,
          success: result.success,
          response: result.success ? result.data : result.error,
        });
      } catch (error: unknown) {
        opinions.push({
          agentId: agent.id,
          agentName: agent.name,
          persona: agent.persona,
          success: false,
          response: (error as Error).message,
        });
      }
    }

    return {
      success: true,
      data: {
        topic,
        participantCount: agentIds.length,
        opinions,
      },
    };
  }

  /**
   * Pipeline - 智能体流水线，A 的输出自动成为 B 的输入
   */
  async pipeline(steps: PipelineStep[]): Promise<OperationResult> {
    if (!steps || steps.length === 0) {
      return { success: false, error: '请至少指定一个流水线步骤' };
    }

    // 验证所有智能体存在
    const invalidIds = steps.filter((s) => !this.agents.has(s.agentId));
    if (invalidIds.length > 0) {
      return {
        success: false,
        error: `智能体不存在: ${invalidIds.map((s) => s.agentId).join(', ')}`,
      };
    }

    const pipelineResults: Array<Record<string, unknown>> = [];
    let context = '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const agent = this.agents.get(step.agentId)!;
      const stepName = step.name || `步骤 ${i + 1} (${agent.name})`;

      const taskWithContext = context ? `${step.task}\n\n---\n[上一步结果]\n${context}` : step.task;

      try {
        const result = await this.delegateTask(step.agentId, taskWithContext);
        const stepResult: Record<string, unknown> = {
          step: i + 1,
          stepName,
          agentId: step.agentId,
          agentName: agent.name,
          success: result.success,
        };

        if (result.success) {
          stepResult.result = result.data;
          context = result.data as string; // 传递给下一步
        } else {
          stepResult.error = result.error;
          pipelineResults.push(stepResult);
          return { success: false, data: { step: i + 1, error: result.error, pipelineResults } };
        }

        pipelineResults.push(stepResult);
      } catch (error: unknown) {
        pipelineResults.push({
          step: i + 1,
          stepName,
          agentId: step.agentId,
          agentName: agent.name,
          success: false,
          error: (error as Error).message,
        });
        return {
          success: false,
          data: { step: i + 1, error: (error as Error).message, pipelineResults },
        };
      }
    }

    return {
      success: true,
      data: {
        totalSteps: steps.length,
        finalResult: context,
        pipelineResults,
      },
    };
  }

  /**
   * Voting - 多智能体对决策投票
   * @param question - 投票问题
   * @param agentIds - 参与投票的智能体 ID 列表
   * @param options - 选项列表（可选）
   */
  async voting(
    question: string,
    agentIds: string[],
    options: string[] = [],
  ): Promise<OperationResult> {
    if (!agentIds || agentIds.length === 0) {
      return { success: false, error: '请至少指定一个智能体参与投票' };
    }

    const invalidIds = agentIds.filter((id) => !this.agents.has(id));
    if (invalidIds.length > 0) {
      return { success: false, error: `智能体不存在: ${invalidIds.join(', ')}` };
    }

    const optionsText =
      options.length > 0
        ? `\n\n选项：\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n请从以上选项中选择一个，并说明理由。`
        : '';

    const votes: Array<Record<string, unknown>> = [];
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId)!;
      this._broadcastClusterState();

      try {
        const result = await this.delegateTask(
          agentId,
          `## 投票\n\n问题：${question}${optionsText}\n\n请给出你的投票和理由。格式：\n投票：[你的选择]\n理由：...`,
        );

        // 从结果中提取投票
        let vote = '';
        let reasoning = '';
        if (result.success) {
          const response = result.data as string;
          const voteMatch = response.match(/投票[：:]\s*(.+)/);
          if (voteMatch) {
            vote = voteMatch[1].trim();
          }
          const reasonMatch = response.match(/理由[：:]\s*([\s\S]+)/);
          if (reasonMatch) {
            reasoning = reasonMatch[1].trim();
          }
        }

        votes.push({
          agentId: agent.id,
          agentName: agent.name,
          persona: agent.persona,
          success: result.success,
          vote: vote || '未明确投票',
          reasoning: reasoning || (result.success ? result.data : result.error),
        });
      } catch (error: unknown) {
        votes.push({
          agentId: agent.id,
          agentName: agent.name,
          persona: agent.persona,
          success: false,
          vote: '错误',
          reasoning: (error as Error).message,
        });
      }
    }

    // 统计投票结果
    const tally: Record<string, number> = {};
    for (const v of votes) {
      const vote = v.vote as string;
      if (vote && vote !== '未明确投票' && vote !== '错误') {
        tally[vote] = (tally[vote] || 0) + 1;
      }
    }

    return {
      success: true,
      data: {
        question,
        totalVotes: votes.length,
        tally,
        votes,
      },
    };
  }

  /**
   * 停止/销毁一个子智能体
   */
  stopAgent(agentId: string): OperationResult {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false, error: `智能体 "${agentId}" 不存在` };
    }

    this.agents.delete(agentId);
    this._broadcastClusterState();

    return { success: true, data: { id: agentId, name: agent.name, state: 'stopped' } };
  }

  /**
   * 停止所有智能体
   */
  stopAllAgents(): OperationResult {
    const count = this.agents.size;
    this.agents.clear();
    this._broadcastClusterState();
    return { success: true, data: { stoppedCount: count } };
  }

  /**
   * 获取集群状态
   */
  getClusterStatus(): ClusterStatus {
    const agentList = Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      name: a.name,
      persona: a.persona,
      state: a.state,
      toolCalls: a.toolCalls,
      iterationCount: a.iterationCount,
      createdAt: a.createdAt,
      lastActiveAt: a.lastActiveAt,
      hasResult: a.result !== null,
      hasError: a.error !== null,
      error: a.error,
    }));

    const stateCounts: Record<string, number> = {};
    for (const a of agentList) {
      stateCounts[a.state] = (stateCounts[a.state] || 0) + 1;
    }

    return {
      totalAgents: agentList.length,
      byState: stateCounts,
      agents: agentList,
    };
  }

  /**
   * 获取单个智能体详情
   */
  getAgent(agentId: string): Record<string, unknown> | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    return {
      id: agent.id,
      name: agent.name,
      persona: agent.persona,
      instruction: agent.instruction,
      state: agent.state,
      toolCalls: agent.toolCalls,
      iterationCount: agent.iterationCount,
      createdAt: agent.createdAt,
      lastActiveAt: agent.lastActiveAt,
      result: agent.result,
      error: agent.error,
    };
  }

  /**
   * 智能体思考-行动循环
   */
  async _executeAgentLoop(
    agent: SubAgent,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    let fullResponse = '';

    for (let i = 0; i < this.maxIterations; i++) {
      agent.iterationCount = i + 1;
      agent.state = 'thinking';
      this._broadcastClusterState();

      // 调用 LLM
      let response = '';
      try {
        for await (const chunk of streamChat(messages)) {
          if (chunk.content) {
            response += chunk.content;
          }
        }
      } catch (error: unknown) {
        throw new Error(`LLM 调用失败: ${(error as Error).message}`, { cause: error });
      }

      fullResponse += response;

      // 解析工具调用（复用 tool-parser.js）
      const toolCalls = parseAllToolCalls(response);

      if (toolCalls.length === 0) {
        // 没有工具调用，这就是最终回复
        break;
      }

      // 添加助手回复到消息历史
      messages.push({ role: 'assistant', content: response });

      // 执行工具并收集结果
      agent.state = 'tool_executing';
      const toolResults: string[] = [];

      for (const tc of toolCalls) {
        agent.toolCalls++;
        const registry = TOOL_REGISTRY[tc.tool];

        if (!registry) {
          toolResults.push(`[工具错误 - ${agent.name}]: 未知工具 "${tc.tool}"`);
          continue;
        }

        if (isDangerousOperation(tc.tool)) {
          toolResults.push(`[工具错误 - ${agent.name}]: 子智能体不允许执行危险操作`);
          continue;
        }

        try {
          // 复用 Agent.executeTool 的参数预处理（customArgs/parseJson/jsonParams），
          // 否则依赖 JSON 解析的工具（parallelExecute/pipeline/voting 等）会收到字符串而非对象。
          const processedArgs = preprocessToolArgs(tc.tool, tc.args);
          const result: unknown = await registry.fn(
            ...(Array.isArray(processedArgs) ? processedArgs : [processedArgs]),
          );
          const data =
            (result as Record<string, unknown>)?.data ?? result ?? '执行完成（无返回值）';
          const text = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
          const truncated =
            text.length > this.maxToolOutput
              ? text.slice(0, this.maxToolOutput) + '\n\n... [输出过长，已截断]'
              : text;
          toolResults.push(`[工具结果 - ${agent.name}]: ${truncated}`);
        } catch (error: unknown) {
          toolResults.push(`[工具错误 - ${agent.name}]: ${(error as Error).message}`);
        }
      }

      // 将工具结果作为 user 消息注入
      const resultMessage = `[系统返回的工具执行结果]\n${toolResults.join('\n\n')}\n\n[系统] 请基于以上工具执行结果继续回复。`;
      messages.push({ role: 'user', content: resultMessage });

      this._broadcastClusterState();
    }

    return fullResponse;
  }

  /**
   * 构建子智能体的系统提示词
   */
  async _buildSystemPrompt(agent: SubAgent): Promise<string> {
    // 读取 persona 文件
    let personaContent: string;
    const personaPath = path.resolve(process.cwd(), 'personas', agent.persona, 'persona.md');
    try {
      personaContent = readFileSync(personaPath, 'utf-8');
    } catch {
      personaContent = `# ${agent.persona}\n\n一个专业的智能助手。`;
    }

    // 获取所有工具名
    const toolNames = Object.keys(TOOL_REGISTRY);

    return `${personaContent}

---

## 你的身份
你是 **${agent.name}**，基于 "${agent.persona}" 角色创建的智能体。

${agent.instruction ? `## 角色指令\n${agent.instruction}\n` : ''}
## 可用工具
你拥有以下工具可供使用：
${toolNames.map((t) => `  - \`${t}\``).join('\n')}

## 工作方式
1. 使用 [TOOL] 语法调用工具，例如：\`[TOOL] read(file.txt) [/TOOL]\`
2. 工具执行结果会自动返回给你，你可以基于结果继续思考
3. 完成任务后直接回复最终答案，无需再调用工具
4. 如果工具执行出错，尝试其他方法解决

## 行为规则
- 专注完成分配给你的任务
- 每次回复只调用必要的工具
- 如果信息不足，使用搜索或文件读取工具获取更多信息
- 完成任务后给出清晰、完整的回复`;
  }

  /**
   * 通过 WebSocket 广播集群状态
   */
  _broadcastClusterState(): void {
    try {
      const status = this.getClusterStatus();
      broadcast('cluster-state', status as unknown as Record<string, unknown>);
    } catch {
      // WebSocket 可能未启用，忽略
    }
  }
}

// ============================================
// 单例导出
// ============================================
const orchestrator = new AgentOrchestrator();

export { AgentOrchestrator, SubAgent, orchestrator };
