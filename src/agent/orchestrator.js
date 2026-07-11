/**
 * Agent Orchestrator - 智能体编排器
 * 管理子智能体集群的生命周期、任务调度和通信
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { streamChat } from '../api/client.js';
import { TOOL_REGISTRY } from './registry.js';
import { broadcast } from '../io/ws-server.js';
import { parseAllToolCalls } from './tool-parser.js';

// ============================================
// SubAgent 类 - 子智能体实例
// ============================================
class SubAgent {
  constructor(id, persona, name, instruction) {
    this.id = id;
    this.persona = persona;
    this.name = name;
    this.instruction = instruction;
    this.state = 'idle';        // idle | thinking | tool_executing | done | error
    this.messages = [];          // 对话历史
    this.result = null;          // 最终结果
    this.createdAt = new Date().toISOString();
    this.lastActiveAt = this.createdAt;
    this.toolCalls = 0;          // 工具调用次数
    this.error = null;           // 错误信息
    this.iterationCount = 0;     // 思考迭代次数
  }
}

// ============================================
// AgentOrchestrator 类 - 智能体编排器
// ============================================
class AgentOrchestrator {
  constructor() {
    this.agents = new Map();
    this.counter = 0;
    this.maxIterations = 5;      // 单个任务最大迭代次数
    this.maxToolOutput = 5000;   // 工具输出最大长度
  }

  /**
   * 生成一个新的子智能体
   * @param {string} personaName - Persona 名称（如 "Critic", "Programmer"）
   * @param {string} name - 智能体显示名称
   * @param {string} instruction - 角色指令/职责描述
   */
  async spawnAgent(personaName, name, instruction) {
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
        createdAt: agent.createdAt
      }
    };
  }

  /**
   * 委托任务给指定子智能体
   * @param {string} agentId - 智能体 ID
   * @param {string} task - 任务描述
   */
  async delegateTask(agentId, task) {
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
        { role: 'user', content: `## 你的任务\n\n${task}\n\n请根据你的角色定位和可用工具，完成上述任务。` }
      ];

      // 执行智能体的思考-行动循环
      const result = await this._executeAgentLoop(agent, messages);

      agent.state = 'done';
      agent.result = result;
      this._broadcastClusterState();

      return { success: true, data: result };

    } catch (error) {
      agent.state = 'error';
      agent.error = error.message;
      this._broadcastClusterState();
      return { success: false, error: error.message };
    }
  }

  /**
   * 并行执行多个任务（使用不同智能体）
   * @param {Array<{agentId: string, task: string}>} tasks
   */
  async parallelExecute(tasks) {
    const results = await Promise.allSettled(
      tasks.map(t => this.delegateTask(t.agentId, t.task))
    );
    return results.map((r, i) => ({
      agentId: tasks[i].agentId,
      task: tasks[i].task,
      success: r.status === 'fulfilled' && r.value.success,
      result: r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
    }));
  }

  /**
   * Panel Discussion - 多智能体就同一主题展开讨论
   * @param {string} topic - 讨论主题
   * @param {Array<string>} agentIds - 参与讨论的智能体 ID 列表
   * @param {string} moderatorInstruction - 主持人指令（可选）
   */
  async panelDiscussion(topic, agentIds, moderatorInstruction = '') {
    if (!agentIds || agentIds.length === 0) {
      return { success: false, error: '请至少指定一个智能体参与讨论' };
    }

    // 验证所有智能体存在
    const invalidIds = agentIds.filter(id => !this.agents.has(id));
    if (invalidIds.length > 0) {
      return { success: false, error: `智能体不存在: ${invalidIds.join(', ')}` };
    }

    // 收集每个智能体的观点
    const opinions = [];
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      agent.state = 'thinking';
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
          response: result.success ? result.data : result.error
        });
      } catch (error) {
        opinions.push({
          agentId: agent.id,
          agentName: agent.name,
          persona: agent.persona,
          success: false,
          response: error.message
        });
      }
    }

    return {
      success: true,
      data: {
        topic,
        participantCount: agentIds.length,
        opinions
      }
    };
  }

  /**
   * Pipeline - 智能体流水线，A 的输出自动成为 B 的输入
   * @param {Array<{agentId: string, task: string, name?: string}>} steps
   */
  async pipeline(steps) {
    if (!steps || steps.length === 0) {
      return { success: false, error: '请至少指定一个流水线步骤' };
    }

    // 验证所有智能体存在
    const invalidIds = steps.filter(s => !this.agents.has(s.agentId));
    if (invalidIds.length > 0) {
      return { success: false, error: `智能体不存在: ${invalidIds.map(s => s.agentId).join(', ')}` };
    }

    const pipelineResults = [];
    let context = '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const agent = this.agents.get(step.agentId);
      const stepName = step.name || `步骤 ${i + 1} (${agent.name})`;

      const taskWithContext = context
        ? `${step.task}\n\n---\n[上一步结果]\n${context}`
        : step.task;

      try {
        const result = await this.delegateTask(step.agentId, taskWithContext);
        const stepResult = {
          step: i + 1,
          stepName,
          agentId: step.agentId,
          agentName: agent.name,
          success: result.success
        };

        if (result.success) {
          stepResult.result = result.data;
          context = result.data; // 传递给下一步
        } else {
          stepResult.error = result.error;
          pipelineResults.push(stepResult);
          return { success: false, data: { step: i + 1, error: result.error, pipelineResults } };
        }

        pipelineResults.push(stepResult);
      } catch (error) {
        pipelineResults.push({
          step: i + 1,
          stepName,
          agentId: step.agentId,
          agentName: agent.name,
          success: false,
          error: error.message
        });
        return { success: false, data: { step: i + 1, error: error.message, pipelineResults } };
      }
    }

    return {
      success: true,
      data: {
        totalSteps: steps.length,
        finalResult: context,
        pipelineResults
      }
    };
  }

  /**
   * Voting - 多智能体对决策投票
   * @param {string} question - 投票问题
   * @param {Array<string>} agentIds - 参与投票的智能体 ID 列表
   * @param {Array<string>} options - 选项列表（可选）
   */
  async voting(question, agentIds, options = []) {
    if (!agentIds || agentIds.length === 0) {
      return { success: false, error: '请至少指定一个智能体参与投票' };
    }

    const invalidIds = agentIds.filter(id => !this.agents.has(id));
    if (invalidIds.length > 0) {
      return { success: false, error: `智能体不存在: ${invalidIds.join(', ')}` };
    }

    const optionsText = options.length > 0
      ? `\n\n选项：\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n请从以上选项中选择一个，并说明理由。`
      : '';

    const votes = [];
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      agent.state = 'thinking';
      this._broadcastClusterState();

      try {
        const result = await this.delegateTask(
          agentId,
          `## 投票\n\n问题：${question}${optionsText}\n\n请给出你的投票和理由。格式：\n投票：[你的选择]\n理由：...`
        );

        // 从结果中提取投票
        let vote = '';
        let reasoning = '';
        if (result.success) {
          const response = result.data;
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
          reasoning: reasoning || (result.success ? result.data : result.error)
        });
      } catch (error) {
        votes.push({
          agentId: agent.id,
          agentName: agent.name,
          persona: agent.persona,
          success: false,
          vote: '错误',
          reasoning: error.message
        });
      }
    }

    // 统计投票结果
    const tally = {};
    for (const v of votes) {
      if (v.vote && v.vote !== '未明确投票' && v.vote !== '错误') {
        tally[v.vote] = (tally[v.vote] || 0) + 1;
      }
    }

    return {
      success: true,
      data: {
        question,
        totalVotes: votes.length,
        tally,
        votes
      }
    };
  }

  /**
   * 停止/销毁一个子智能体
   */
  stopAgent(agentId) {
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
  stopAllAgents() {
    const count = this.agents.size;
    this.agents.clear();
    this._broadcastClusterState();
    return { success: true, data: { stoppedCount: count } };
  }

  /**
   * 获取集群状态
   */
  getClusterStatus() {
    const agentList = Array.from(this.agents.values()).map(a => ({
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
      error: a.error
    }));

    const stateCounts = {};
    for (const a of agentList) {
      stateCounts[a.state] = (stateCounts[a.state] || 0) + 1;
    }

    return {
      totalAgents: agentList.length,
      byState: stateCounts,
      agents: agentList
    };
  }

  /**
   * 获取单个智能体详情
   */
  getAgent(agentId) {
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
      error: agent.error
    };
  }

  /**
   * 智能体思考-行动循环
   */
  async _executeAgentLoop(agent, messages) {
    let fullResponse = '';

    for (let i = 0; i < this.maxIterations; i++) {
      agent.iterationCount = i + 1;
      this._broadcastClusterState();

      // 调用 LLM
      let response = '';
      try {
        for await (const chunk of streamChat(messages)) {
          if (chunk.content) {
            response += chunk.content;
          }
        }
      } catch (error) {
        throw new Error(`LLM 调用失败: ${error.message}`);
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
      const toolResults = [];

      for (const tc of toolCalls) {
        agent.toolCalls++;
        const registry = TOOL_REGISTRY[tc.tool];

        if (!registry) {
          toolResults.push(`[工具错误 - ${agent.name}]: 未知工具 "${tc.tool}"`);
          continue;
        }

        try {
          const result = await registry.fn(...(Array.isArray(tc.args) ? tc.args : [tc.args]));
          const data = result?.data ?? result ?? '执行完成（无返回值）';
          const text = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
          const truncated = text.length > this.maxToolOutput
            ? text.slice(0, this.maxToolOutput) + '\n\n... [输出过长，已截断]'
            : text;
          toolResults.push(`[工具结果 - ${agent.name}]: ${truncated}`);
        } catch (error) {
          toolResults.push(`[工具错误 - ${agent.name}]: ${error.message}`);
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
  async _buildSystemPrompt(agent) {
    // 读取 persona 文件
    let personaContent = '';
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
${toolNames.map(t => `  - \`${t}\``).join('\n')}

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
  _broadcastClusterState() {
    try {
      const status = this.getClusterStatus();
      broadcast('cluster-state', status);
    } catch {
      // WebSocket 可能未启用，忽略
    }
  }
}

// ============================================
// 单例导出
// ============================================
const orchestrator = new AgentOrchestrator();

export {
  AgentOrchestrator,
  SubAgent,
  orchestrator
};