/**
 * Agent Orchestrator - 智能体编排器
 * 管理子智能体集群的生命周期、任务调度和通信
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { streamChat } from '../api/client.js';
import { TOOL_REGISTRY } from './registry.js';
import { broadcast } from '../io/ws-server.js';

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

      // 解析工具调用
      const toolCalls = this._parseToolCalls(response);

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
   * 解析工具调用（与 Agent.js 相同格式）
   */
  _parseToolCalls(text) {
    const results = [];
    const regex = /\[TOOL\]\s*(\w+)\s*\(([\s\S]*?)\)\s*\[\/TOOL\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      results.push({ tool: match[1], args: this._parseArgs(match[2]) });
    }
    return results;
  }

  /**
   * 解析工具参数（与 Agent.js 相同逻辑）
   */
  _parseArgs(argsStr) {
    if (!argsStr || argsStr.trim() === '') return [];
    const trimmed = argsStr.trim();

    // JSON 格式
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return { isJson: true, data: JSON.parse(trimmed) };
      } catch { /* fall through */ }
    }

    // 引号包裹的参数
    if (trimmed.includes('"') || trimmed.includes("'")) {
      try {
        const args = [];
        let current = '';
        let inQuote = false;
        let quoteChar = '';

        for (let i = 0; i < trimmed.length; i++) {
          const char = trimmed[i];
          if ((char === '"' || char === "'") && !inQuote) {
            inQuote = true;
            quoteChar = char;
            current += char;
          } else if (char === quoteChar && inQuote) {
            inQuote = false;
            current += char;
          } else if (char === ',' && !inQuote) {
            args.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        if (current.trim()) args.push(current.trim());

        return args.map(a => {
          const p = a.trim();
          if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
            return p.slice(1, -1);
          }
          return p;
        });
      } catch { /* fall through */ }
    }

    // 简单逗号分隔
    return trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
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