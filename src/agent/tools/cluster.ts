/**
 * 集群管理工具
 * 供主智能体调用，管理子智能体集群
 */

import { orchestrator } from '../orchestrator.ts';

interface PipelineStep {
  agentId: string;
  task: string;
  name?: string;
}

/**
 * 生成一个新的子智能体
 * @param {string} persona - Persona 名称（如 "Critic", "Programmer"）
 * @param {string} name - 智能体名称
 * @param {string} instruction - 角色指令
 */
export async function spawnAgent(
  persona: string,
  name: string,
  instruction: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return orchestrator.spawnAgent(persona, name, instruction);
}

/**
 * 委托任务给指定的子智能体
 * @param {string} agentId - 智能体 ID
 * @param {string} task - 任务描述
 */
export async function delegateTask(
  agentId: string,
  task: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return orchestrator.delegateTask(agentId, task);
}

/**
 * 获取集群状态
 */
export async function getClusterStatus(): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  return { success: true, data: orchestrator.getClusterStatus() };
}

/**
 * 停止/销毁子智能体
 * @param {string} agentId - 智能体 ID
 */
export async function stopAgent(
  agentId: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return orchestrator.stopAgent(agentId);
}

/**
 * 停止所有智能体
 */
export async function stopAllAgents(): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  return orchestrator.stopAllAgents();
}

/**
 * 并行执行多个任务
 * @param {Array<{agentId: string, task: string}>} tasks
 */
export async function parallelExecute(
  tasks: { agentId: string; task: string }[] | string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  // 如果 tasks 是字符串（JSON格式），尝试解析
  if (typeof tasks === 'string') {
    try {
      tasks = JSON.parse(tasks);
    } catch {
      return { success: false, error: 'tasks 参数必须是 JSON 数组' };
    }
  }
  return {
    success: true,
    data: await orchestrator.parallelExecute(tasks as { agentId: string; task: string }[]),
  };
}

/**
 * 获取单个智能体详情
 * @param {string} agentId
 */
export async function getAgent(
  agentId: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const agent = orchestrator.getAgent(agentId);
  if (!agent) {
    return { success: false, error: `智能体 "${agentId}" 不存在` };
  }
  return { success: true, data: agent };
}

/**
 * Panel Discussion - 多智能体就同一主题展开讨论
 * @param {string} topic - 讨论主题
 * @param {string} agentIds - 参与讨论的智能体 ID 列表（JSON数组字符串）
 * @param {string} moderatorInstruction - 主持人指令（可选）
 */
export async function panelDiscussion(
  topic: string,
  agentIds: string[] | string,
  moderatorInstruction: string = '',
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  let ids: string[];
  try {
    ids = typeof agentIds === 'string' ? JSON.parse(agentIds) : agentIds;
  } catch {
    return { success: false, error: 'agentIds 参数必须是 JSON 数组' };
  }
  return orchestrator.panelDiscussion(topic, ids, moderatorInstruction);
}

/**
 * Pipeline - 智能体流水线
 * @param {string} steps - 流水线步骤（JSON数组字符串）
 */
export async function pipeline(
  steps: unknown[] | string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  let stepsArr: unknown[];
  try {
    stepsArr = typeof steps === 'string' ? JSON.parse(steps) : steps;
  } catch {
    return { success: false, error: 'steps 参数必须是 JSON 数组' };
  }
  return orchestrator.pipeline(stepsArr as PipelineStep[]);
}

/**
 * Voting - 多智能体投票
 * @param {string} question - 投票问题
 * @param {string} agentIds - 参与投票的智能体 ID 列表（JSON数组字符串）
 * @param {string} options - 选项列表（JSON数组字符串，可选）
 */
export async function voting(
  question: string,
  agentIds: string[] | string,
  options: string[] | string = '[]',
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  let ids: string[];
  let opts: unknown[];
  try {
    ids = typeof agentIds === 'string' ? JSON.parse(agentIds) : agentIds;
    opts = typeof options === 'string' ? JSON.parse(options) : options;
  } catch {
    return { success: false, error: 'agentIds 和 options 必须是 JSON 数组' };
  }
  return orchestrator.voting(question, ids, opts as string[]);
}
