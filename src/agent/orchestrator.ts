/**
 * Agent Orchestrator - 智能体编排器
 * 管理子智能体集群的生命周期、任务调度和通信
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { streamChatNative, isAbortError } from '../api/client.ts';
import type { NativeStreamReturn, NativeStreamChunk } from '../api/client.ts';
import { TOOL_REGISTRY, isDangerousOperation, getEnabledToolNames } from './registry.ts';
import { broadcast } from '../io/ws-server.ts';
import { buildOpenAITools, objectArgsToPositional } from './tool-schema.ts';
import { safeParseJSON } from '../utils/llm-validator.ts';
import { isValidPersonaName } from './persona.ts';
import { getToolPermission } from './plugin.ts';

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
  /** 当前任务的中断句柄；无任务时为 null。 */
  abortController: AbortController | null;
  /** 是否已被请求停止（stopAgent / 硬超时 / 从集群移除）。 */
  stopRequested: boolean;
  /** 中断原因，用于回传给调用方而不是笼统地报"失败"。 */
  interruptReason: string | null;
  /** 任务硬超时时间戳（epoch ms）；无任务时为 null。 */
  deadlineAt: number | null;

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
    this.abortController = null;
    this.stopRequested = false;
    this.interruptReason = null;
    this.deadlineAt = null;
  }

  /**
   * 请求停止本智能体：置停止标志并 abort 正在进行的 LLM 流。
   * 仅置标志是不够的——不 abort 的话已发出的请求会继续把整段回复读完，
   * 表面上智能体已被删除，实际仍在消耗 token 并占用连接（僵尸子智能体）。
   */
  requestStop(reason: string): void {
    if (!this.stopRequested) {
      this.stopRequested = true;
      this.interruptReason = reason;
    }
    try {
      this.abortController?.abort();
    } catch {
      /* abort 失败不影响停止语义 */
    }
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
  maxSubAgents: number; // 子智能体数量上限
  maxParallelTasks: number; // 并行/讨论/流水线任务数量上限
  taskTimeoutMs: number; // 单个任务硬超时（防止 LLM/工具卡死导致任务永不结束）

  constructor() {
    this.agents = new Map();
    this.counter = 0;
    this.maxIterations = 5;
    this.maxToolOutput = 5000;
    this.maxSubAgents = 12;
    this.maxParallelTasks = 8;
    this.taskTimeoutMs = 10 * 60 * 1000;
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

    // 校验人设名称，防止路径穿越读取任意目录 persona.md
    if (!isValidPersonaName(personaName)) {
      return { success: false, error: `非法的人设名称: "${personaName}"` };
    }

    // 限制集群规模，防止子智能体数量无限膨胀
    if (this.agents.size >= this.maxSubAgents) {
      return { success: false, error: `子智能体数量已达上限（${this.maxSubAgents}）` };
    }

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
    // 每次委托都是全新任务：重置上一轮遗留的中断状态与错误，
    // 并建立本轮的中断句柄 + 硬超时截止时间。
    agent.stopRequested = false;
    agent.interruptReason = null;
    agent.error = null;
    agent.abortController = new AbortController();
    agent.deadlineAt = Date.now() + this.taskTimeoutMs;
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

      // 被 stopAgent / 硬超时 / 移出集群中断的任务不能算成功，
      // 否则 pipeline 会拿半截结果继续往下走。
      if (agent.stopRequested) {
        const reason = agent.interruptReason ?? '任务已被中断';
        agent.state = 'stopped';
        agent.error = reason;
        agent.result = result;
        this._broadcastClusterState();
        return { success: false, error: reason, data: result };
      }

      agent.state = 'done';
      agent.result = result;
      this._broadcastClusterState();

      return { success: true, data: result };
    } catch (error: unknown) {
      if (isAbortError(error) || agent.stopRequested) {
        const reason = agent.interruptReason ?? '任务已被中断';
        agent.state = 'stopped';
        agent.error = reason;
        this._broadcastClusterState();
        return { success: false, error: reason };
      }
      agent.state = 'error';
      agent.error = (error as Error).message;
      this._broadcastClusterState();
      return { success: false, error: (error as Error).message };
    } finally {
      agent.abortController = null;
      agent.deadlineAt = null;
      agent.lastActiveAt = new Date().toISOString();
    }
  }

  /**
   * 检查智能体是否应当中断当前任务，返回中断原因（无需中断时返回 null）。
   * 三种情况：显式 stopAgent、任务硬超时、智能体已被移出集群。
   * 后两种会顺带触发 requestStop 以 abort 正在进行的 LLM 流。
   */
  _checkInterrupt(agent: SubAgent): string | null {
    if (agent.stopRequested) return agent.interruptReason ?? '任务已被停止';
    if (agent.deadlineAt !== null && Date.now() > agent.deadlineAt) {
      agent.requestStop(`任务执行超过 ${Math.round(this.taskTimeoutMs / 1000)} 秒上限，已强制中断`);
      return agent.interruptReason;
    }
    if (!this.agents.has(agent.id)) {
      agent.requestStop('智能体已从集群中移除');
      return agent.interruptReason;
    }
    return null;
  }

  /**
   * 并行执行多个任务（使用不同智能体）
   */
  async parallelExecute(tasks: ParallelTask[]): Promise<OperationResult[]> {
    const limited = Array.isArray(tasks) ? tasks.slice(0, this.maxParallelTasks) : [];
    if (limited.length === 0) {
      return [{ success: false, error: '请至少指定一个任务' }];
    }
    const results = await Promise.allSettled(
      limited.map((t) => this.delegateTask(t.agentId, t.task)),
    );
    return results.map((r, i) => ({
      agentId: limited[i].agentId,
      task: limited[i].task,
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
    const ids = agentIds.slice(0, this.maxParallelTasks);

    // 验证所有智能体存在
    const invalidIds = ids.filter((id) => !this.agents.has(id));
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
    for (const agentId of ids) {
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
        participantCount: ids.length,
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
    const limitedSteps = steps.slice(0, this.maxParallelTasks);

    // 验证所有智能体存在
    const invalidIds = limitedSteps.filter((s) => !this.agents.has(s.agentId));
    if (invalidIds.length > 0) {
      return {
        success: false,
        error: `智能体不存在: ${invalidIds.map((s) => s.agentId).join(', ')}`,
      };
    }

    const pipelineResults: Array<Record<string, unknown>> = [];
    let context = '';

    for (let i = 0; i < limitedSteps.length; i++) {
      const step = limitedSteps[i];
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
          // 子智能体可能返回对象/数组，不能直接作字符串拼接（会变成 [object Object]），
          // 统一序列化为可读文本后再作为下一步的上下文。
          context =
            typeof result.data === 'string'
              ? result.data
              : typeof result.data === 'object' && result.data !== null
                ? JSON.stringify(result.data, null, 2)
                : String(result.data);
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
        totalSteps: limitedSteps.length,
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
    const ids = agentIds.slice(0, this.maxParallelTasks);

    const invalidIds = ids.filter((id) => !this.agents.has(id));
    if (invalidIds.length > 0) {
      return { success: false, error: `智能体不存在: ${invalidIds.join(', ')}` };
    }

    const optionsText =
      options.length > 0
        ? `\n\n选项：\n${options
            .slice(0, 20)
            .map((o, i) => `${i + 1}. ${o}`)
            .join('\n')}\n\n请从以上选项中选择一个，并说明理由。`
        : '';

    const votes: Array<Record<string, unknown>> = [];
    for (const agentId of ids) {
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

    // 先 abort 正在进行的 LLM 流，再从集群摘除。
    // 只 delete 不 abort 会留下"看不见但仍在跑"的僵尸子智能体：
    // 它会继续读完整个流、继续执行剩余工具调用、继续烧 token。
    agent.requestStop('智能体已被停止');
    agent.state = 'stopped';
    this.agents.delete(agentId);
    this._broadcastClusterState();

    return { success: true, data: { id: agentId, name: agent.name, state: 'stopped' } };
  }

  /**
   * 停止所有智能体
   */
  stopAllAgents(): OperationResult {
    const count = this.agents.size;
    for (const agent of this.agents.values()) {
      agent.requestStop('集群已被整体停止');
      agent.state = 'stopped';
    }
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
   * 智能体思考-行动循环（原生 function calling 协议）
   */
  async _executeAgentLoop(
    agent: SubAgent,
    messages: Array<Record<string, unknown>>,
  ): Promise<string> {
    let fullResponse = '';
    // 连续两轮调用「相同方法签名」的工具说明模型在截断的工具输出下无法取得进展，
    // 继续循环只会重复执行同一动作，直接终止避免死循环。
    let previousToolSignatures = '';
    // 是否已产出纯文本的最终回复（无工具调用）。
    // 只有「无工具调用」或「重复调用被掐断后的收尾」才算真正完成；
    // 若因迭代次数上限耗尽仍停留在工具调用，则循环体会被强行唤醒完成，
    // 否则任务会被标记为 done 却没有拿到最终结果。
    let hasFinalAnswer = false;

    // 子智能体禁用集群工具：cluster 分类含 spawnAgent / delegateTask /
    // parallelExecute / pipeline / stopAllAgents。这些工具既不在
    // DANGEROUS_OPERATIONS、权限又默认 allow，两道门都会放行，子智能体因此
    // 可以再 spawn 子智能体并 parallelExecute，形成指数级 LLM 调用；
    // 也能调 stopAllAgents 把整个集群清空。集群编排必须只由主 Agent 发起。
    const tools = buildOpenAITools(
      getEnabledToolNames().filter((name) => TOOL_REGISTRY[name]?.category !== 'cluster'),
      { strict: false },
    );

    for (let i = 0; i < this.maxIterations; i++) {
      // 每轮开始先判定中断：stopAgent / 硬超时 / 已被移出集群时立刻收手。
      const preReason = this._checkInterrupt(agent);
      if (preReason) {
        fullResponse += `\n\n[系统] ${preReason}`;
        return fullResponse;
      }

      agent.iterationCount = i + 1;
      agent.state = 'thinking';
      this._broadcastClusterState();

      // 调用 LLM（原生工具协议）
      let content = '';
      let result: NativeStreamReturn | null = null;
      let interrupted = false;
      const stream = streamChatNative(messages, {
        tools,
        signal: agent.abortController?.signal,
      });
      try {
        while (true) {
          if (this._checkInterrupt(agent)) {
            interrupted = true;
            // 必须走 stream.return() 让生成器的 finally 取消 reader，
            // 裸 break 会把底层 TCP 连接泄漏在连接池里。
            await stream.return({ input: 0, output: 0, stopReason: 'aborted', toolCalls: [] });
            break;
          }
          const iterResult = await stream.next();
          if (iterResult.done) {
            result = iterResult.value;
            break;
          }
          const chunk = iterResult.value as NativeStreamChunk;
          if (chunk.content) content += chunk.content;
        }
      } catch (error: unknown) {
        if (isAbortError(error) || agent.stopRequested) {
          interrupted = true;
        } else {
          throw new Error(`LLM 调用失败: ${(error as Error).message}`, { cause: error });
        }
      }

      fullResponse += content;

      if (interrupted) {
        fullResponse += `\n\n[系统] ${agent.interruptReason ?? '任务已被中断'}`;
        return fullResponse;
      }

      const toolCalls = result?.toolCalls || [];

      if (toolCalls.length === 0) {
        // 没有工具调用，这就是最终回复
        hasFinalAnswer = true;
        break;
      }

      const signatures = toolCalls
        .map((tc) => `${tc.name}(${tc.arguments})`)
        .sort()
        .join('|');
      if (previousToolSignatures !== '' && signatures === previousToolSignatures) {
        fullResponse += '\n\n[系统] 检测到重复调用相同工具，无法取得进展，已终止循环。';
        break;
      }
      previousToolSignatures = signatures;

      // 添加带 tool_calls 的助手回复到消息历史
      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      // 执行工具并把结果以 role=tool 消息注入
      agent.state = 'tool_executing';

      let toolLoopInterrupted = false;
      for (const tc of toolCalls) {
        // 工具是顺序执行的，一次调用可能很慢；每个工具前都要重新判定中断，
        // 否则 stopAgent 之后剩余工具仍会全部跑完（写文件、发请求等副作用照做）。
        const interruptReason = this._checkInterrupt(agent);
        if (interruptReason) {
          toolLoopInterrupted = true;
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `[工具跳过 - ${agent.name}]: ${interruptReason}`,
          });
          continue;
        }

        agent.toolCalls++;
        const registry = TOOL_REGISTRY[tc.name];

        if (!registry) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `[工具错误 - ${agent.name}]: 未知工具 "${tc.name}"`,
          });
          continue;
        }

        if (isDangerousOperation(tc.name)) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `[工具错误 - ${agent.name}]: 子智能体不允许执行危险操作`,
          });
          continue;
        }

        // 集群工具对子智能体一律禁止：工具表已过滤掉 cluster 分类，此处是
        // 执行侧兜底，防止模型凭记忆硬编码工具名绕过工具表，递归 spawn 出
        // 指数级子智能体或调用 stopAllAgents 摧毁集群。
        if (registry.category === 'cluster') {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `[工具错误 - ${agent.name}]: 子智能体不允许调用集群管理工具 "${tc.name}"，集群编排只能由主智能体发起`,
          });
          continue;
        }

        // R5.2 权限门禁：子智能体直接调 registry.fn，绕过了主 Agent 的 executeTool，
        // 因此必须在此独立校验，否则 deny 规则对子智能体形同虚设。
        // 子智能体无交互通道，无法发起授权询问，故 ask 与 deny 一并拒绝。
        const permission = getToolPermission(tc.name);
        if (permission !== 'allow') {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content:
              permission === 'deny'
                ? `[工具错误 - ${agent.name}]: 工具 ${tc.name} 已被权限策略禁用`
                : `[工具错误 - ${agent.name}]: 工具 ${tc.name} 需要用户授权，子智能体无法执行`,
          });
          continue;
        }

        try {
          const parsed = safeParseJSON<Record<string, unknown>>(tc.arguments);
          const args = parsed.success && parsed.data ? parsed.data : {};
          // 与主 Agent 原生路径一致：先做 JSON Schema 顺序换算为位置参数，
          // 再交给工具执行，避免依赖 JSON 解析的工具收到字符串而非对象。
          const processedArgs = objectArgsToPositional(tc.name, args);
          const resultValue: unknown = await registry.fn(
            ...(Array.isArray(processedArgs) ? processedArgs : [processedArgs]),
          );
          const data =
            (resultValue as Record<string, unknown>)?.data ?? resultValue ?? '执行完成（无返回值）';
          const text = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
          const truncated =
            text.length > this.maxToolOutput
              ? text.slice(0, this.maxToolOutput) + '\n\n... [输出过长，已截断]'
              : text;
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `[工具结果 - ${agent.name}]: ${truncated}`,
          });
        } catch (error: unknown) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `[工具错误 - ${agent.name}]: ${(error as Error).message}`,
          });
        }
      }

      if (toolLoopInterrupted) {
        fullResponse += `\n\n[系统] ${agent.interruptReason ?? '任务已被中断'}`;
        return fullResponse;
      }

      this._broadcastClusterState();
    }

    // 循环因迭代次数耗尽或重复工具调用被提前终止，但没有产出纯文本最终答复：
    // 追加一次收尾调用，让模型基于已收集的信息直接给出最终结果。
    // （缺失此步骤时任务会在没完成的情况下被标记 done，返回的只是中间推理片段。）
    if (!hasFinalAnswer) {
      // 中断状态下不再补发收尾请求——那会在"已停止"之后又打一次 LLM。
      const wrapUpReason = this._checkInterrupt(agent);
      if (wrapUpReason) {
        return `${fullResponse}\n\n[系统] ${wrapUpReason}`;
      }

      agent.state = 'thinking';
      this._broadcastClusterState();
      messages.push({
        role: 'user',
        content:
          '[系统] 你已用尽本次任务的思考迭代次数。请基于上面已经取得的工具结果，立刻给出你的最终结果和结论，不要再调用任何工具。',
      });
      const stream = streamChatNative(messages, { signal: agent.abortController?.signal });
      try {
        while (true) {
          if (this._checkInterrupt(agent)) {
            await stream.return({ input: 0, output: 0, stopReason: 'aborted', toolCalls: [] });
            fullResponse += `\n\n[系统] ${agent.interruptReason ?? '任务已被中断'}`;
            break;
          }
          const iterResult = await stream.next();
          if (iterResult.done) break;
          const chunk = iterResult.value as NativeStreamChunk;
          if (chunk.content) fullResponse += chunk.content;
        }
      } catch (error: unknown) {
        if (isAbortError(error) || agent.stopRequested) {
          fullResponse += `\n\n[系统] ${agent.interruptReason ?? '任务已被中断'}`;
        } else {
          throw new Error(`LLM 调用失败: ${(error as Error).message}`, { cause: error });
        }
      }
    }

    return fullResponse;
  }

  /**
   * 构建子智能体的系统提示词
   */
  async _buildSystemPrompt(agent: SubAgent): Promise<string> {
    // 读取 persona 文件（名称先做安全校验，避免路径穿越读取任意目录）
    let personaContent: string;
    if (!isValidPersonaName(agent.persona)) {
      personaContent = `# ${agent.persona}\n\n一个专业的智能助手。`;
    } else {
      const personaPath = path.resolve(process.cwd(), 'personas', agent.persona, 'persona.md');
      try {
        personaContent = readFileSync(personaPath, 'utf-8');
      } catch {
        personaContent = `# ${agent.persona}\n\n一个专业的智能助手。`;
      }
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
1. 通过原生 function calling 发送 tool_calls 来调用工具（工具名与参数以系统提供的 JSON Schema 为准）
2. 工具执行结果会自动以 role: tool 消息返回，你可以基于结果继续思考
3. 完成任务后直接回复最终答案，无需再调用工具
4. 如果工具执行出错，尝试其他方法解决

## 行为规则
- 专注完成分配给你的任务
- 每次回复只调用必要的工具
- 如果信息不足，使用搜索或文件读取工具获取更多信息
- 完成任务后给出清晰、完整的回复
- 使用用户输入的语言来回复，保持语言一致`;
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
