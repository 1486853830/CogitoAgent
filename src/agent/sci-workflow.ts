/**
 * 科学工作流加载器
 * 读取 workflows/scientific-workflows.json 中的预设工作流配置，
 * 通过集群 API 编排多智能体执行科研任务
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 下 __dirname 未定义，import.meta.dirname 是 Node 20.11+ 特性；
// engines.node 声明 >=18，故用 fileURLToPath 兜底，避免在 18.x 抛 ReferenceError。
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WorkflowStep {
  agentId: string;
  persona?: string;
  name?: string;
  instruction?: string;
  task: string;
}

interface WorkflowAgent {
  id: string;
  persona: string;
  name: string;
  instruction: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  mode: 'pipeline' | 'parallel' | 'panel';
  steps?: WorkflowStep[];
  agents?: WorkflowAgent[];
  moderatorInstruction?: string;
}

interface WorkflowCollection {
  workflows: Workflow[];
}

/**
 * 加载所有预设科学工作流
 */
function loadWorkflows(): WorkflowCollection {
  const workflowsPath = path.resolve(__dirname, '../../workflows/scientific-workflows.json');

  try {
    if (existsSync(workflowsPath)) {
      const data = readFileSync(workflowsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn(`[科学工作流] 加载工作流配置失败: ${(e as Error).message}`);
  }

  return { workflows: [] };
}

/**
 * 获取所有工作流列表
 */
function getWorkflowList(): Array<{ id: string; name: string; description: string }> {
  const collection = loadWorkflows();
  return collection.workflows.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
  }));
}

/**
 * 根据 ID 获取工作流
 */
function getWorkflow(id: string): Workflow | null {
  const collection = loadWorkflows();
  return collection.workflows.find((w) => w.id === id) || null;
}

interface WorkflowResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * 执行 Pipeline 模式工作流
 * 按顺序执行步骤，每个步骤的输出可作为下一步的输入
 */
async function executePipeline(workflow: Workflow): Promise<WorkflowResult> {
  if (!workflow.steps || workflow.steps.length === 0) {
    return { success: false, error: '工作流没有定义步骤' };
  }

  const results: { step: number; agentId: string; task: string; status: string }[] = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];

    results.push({
      step: i + 1,
      agentId: step.agentId,
      task: step.task,
      status: 'planned',
    });
  }

  return {
    success: true,
    data: {
      workflow: workflow.name,
      mode: 'pipeline',
      steps: results.map((r) => ({
        step: r.step,
        agentId: r.agentId,
        task: r.task,
        suggestedPersona: workflow.steps![r.step - 1].persona || 'Assistant',
      })),
    },
  };
}

/**
 * 执行 Parallel 模式工作流
 * 并行执行多个独立任务
 */
async function executeParallel(workflow: Workflow): Promise<WorkflowResult> {
  if (!workflow.steps || workflow.steps.length === 0) {
    return { success: false, error: '工作流没有定义步骤' };
  }

  return {
    success: true,
    data: {
      workflow: workflow.name,
      mode: 'parallel',
      tasks: workflow.steps.map((step) => ({
        agentId: step.agentId,
        task: step.task,
        suggestedPersona: step.persona || 'Assistant',
      })),
      description: '将在 parallelExecute 中并行执行',
    },
  };
}

/**
 * 执行 Panel 模式工作流
 * 多智能体讨论
 */
async function executePanel(workflow: Workflow): Promise<WorkflowResult> {
  if (!workflow.agents || workflow.agents.length === 0) {
    return { success: false, error: '工作流没有定义参与者' };
  }

  return {
    success: true,
    data: {
      workflow: workflow.name,
      mode: 'panel',
      agents: workflow.agents.map((a) => ({
        id: a.id,
        name: a.name,
        persona: a.persona,
        instruction: a.instruction,
      })),
      moderatorInstruction: workflow.moderatorInstruction || '',
      description: '将在 panelDiscussion 中执行圆桌讨论',
    },
  };
}

/**
 * 执行科学工作流
 */
async function executeWorkflow(id: string): Promise<WorkflowResult> {
  const workflow = getWorkflow(id);
  if (!workflow) {
    return {
      success: false,
      error: `未找到工作流: ${id}。可用工作流: ${getWorkflowList()
        .map((w) => w.id)
        .join(', ')}`,
    };
  }

  console.log(`[科学工作流] 开始执行: ${workflow.name}`);

  switch (workflow.mode) {
    case 'pipeline':
      return executePipeline(workflow);
    case 'parallel':
      return executeParallel(workflow);
    case 'panel':
      return executePanel(workflow);
    default:
      return { success: false, error: `不支持的工作流模式: ${workflow.mode}` };
  }
}

export { loadWorkflows, getWorkflowList, getWorkflow, executeWorkflow };
export type { Workflow, WorkflowCollection };
