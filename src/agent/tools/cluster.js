/**
 * 集群管理工具
 * 供主智能体调用，管理子智能体集群
 */

import { orchestrator } from '../orchestrator.js';

/**
 * 生成一个新的子智能体
 * @param {string} persona - Persona 名称（如 "Critic", "Programmer"）
 * @param {string} name - 智能体名称
 * @param {string} instruction - 角色指令
 */
export async function spawnAgent(persona, name, instruction) {
  return orchestrator.spawnAgent(persona, name, instruction);
}

/**
 * 委托任务给指定的子智能体
 * @param {string} agentId - 智能体 ID
 * @param {string} task - 任务描述
 */
export async function delegateTask(agentId, task) {
  return orchestrator.delegateTask(agentId, task);
}

/**
 * 获取集群状态
 */
export async function getClusterStatus() {
  return { success: true, data: orchestrator.getClusterStatus() };
}

/**
 * 停止/销毁子智能体
 * @param {string} agentId - 智能体 ID
 */
export async function stopAgent(agentId) {
  return orchestrator.stopAgent(agentId);
}

/**
 * 停止所有智能体
 */
export async function stopAllAgents() {
  return orchestrator.stopAllAgents();
}

/**
 * 并行执行多个任务
 * @param {Array<{agentId: string, task: string}>} tasks
 */
export async function parallelExecute(tasks) {
  // 如果 tasks 是字符串（JSON格式），尝试解析
  if (typeof tasks === 'string') {
    try {
      tasks = JSON.parse(tasks);
    } catch {
      return { success: false, error: 'tasks 参数必须是 JSON 数组' };
    }
  }
  return orchestrator.parallelExecute(tasks);
}

/**
 * 获取单个智能体详情
 * @param {string} agentId
 */
export async function getAgent(agentId) {
  const agent = orchestrator.getAgent(agentId);
  if (!agent) {
    return { success: false, error: `智能体 "${agentId}" 不存在` };
  }
  return { success: true, data: agent };
}