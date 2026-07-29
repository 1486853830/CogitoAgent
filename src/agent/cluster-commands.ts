import { println } from '../io/terminal.ts';
import { orchestrator } from './orchestrator.ts';

function printClusterStatus(): void {
  const status = orchestrator.getClusterStatus();

  println('');
  println(`智能体集群 (${status.totalAgents} 个)`, 'claudeBright');
  println('');

  if (status.totalAgents === 0) {
    println('  暂无活跃智能体', 'gray');
    println('');
    println('使用 /spawn <persona> <name> <instruction> 创建新智能体', 'gray');
    println('例如: /spawn Critic "审查官" "你负责审查代码质量"', 'gray');
    println('');
    return;
  }

  const byState = status.byState;
  const stateSummary = Object.entries(byState)
    .map(([s, c]) => `${s}: ${c}`)
    .join(', ');
  println(`状态: ${stateSummary}`, 'yellow');
  println('');

  for (const agent of status.agents) {
    const stateColor = agent.state === 'done' ? 'green'
      : agent.state === 'error' ? 'red'
      : agent.state === 'thinking' ? 'yellow'
      : 'gray';

    println(`${agent.name}`, 'white');
    println(`  ID: ${agent.id}  Persona: ${agent.persona}  状态: ${agent.state}`, 'gray');
    println(`  工具调用: ${agent.toolCalls} 次  迭代: ${agent.iterationCount}`, 'gray');
    if (agent.hasError) {
      println(`  错误: ${agent.error}`, 'red');
    }
    println('');
  }

  println('集群命令:', 'claude');
  println('  /spawn <persona> <name> <instruction>  生成新智能体', 'gray');
  println('  /delegate <agentId> <task>             委托任务', 'gray');
  println('  /agents /cluster                       显示集群状态', 'gray');
  println('  /stop-agent <id>                       停止智能体', 'gray');
  println('  /stop-all-agents                       停止所有智能体', 'gray');
  println('');
}

function handleSpawnCommand(input: string): void {
  const rest = input.slice(7).trim();

  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < rest.length; i++) {
    const char = rest[i];
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current.trim()) {
        args.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current.trim()) args.push(current.trim());

  const persona = args[0] || 'Assistant';
  const name = args[1] || `${persona}_${Date.now().toString(36)}`;
  const instruction = args.slice(2).join(' ') || '';

  println(`正在生成智能体 "${name}" (Persona: ${persona})...`, 'yellow');

  orchestrator.spawnAgent(persona, name, instruction).then(result => {
    if (result.success) {
      println(`智能体已生成:`, 'green');
      println(`  ID: ${result.data.id}`, 'white');
      println(`  名称: ${result.data.name}`, 'white');
      println(`  Persona: ${result.data.persona}`, 'white');
      println(`  指令: ${result.data.instruction}`, 'white');
      println('');
      println(`使用 /delegate ${result.data.id} "任务描述" 来分配任务`, 'gray');
    } else {
      println(`${result.error}`, 'red');
    }
  }).catch((error: any) => {
    println(`生成失败: ${error.message}`, 'red');
  });
}

function handleDelegateCommand(input: string): void {
  const rest = input.slice(10).trim();

  const spaceIdx = rest.indexOf(' ');
  if (spaceIdx === -1) {
    println('请提供任务描述', 'red');
    println('用法: /delegate <agent_id> <任务描述>', 'gray');
    return;
  }

  const agentId = rest.slice(0, spaceIdx).trim();
  const task = rest.slice(spaceIdx + 1).trim();

  if (!agentId || !task) {
    println('请提供智能体 ID 和任务描述', 'red');
    println('用法: /delegate <agent_id> <任务描述>', 'gray');
    return;
  }

  println(`正在委托任务给智能体 "${agentId}"...`, 'yellow');
  println(`任务: ${task}`, 'gray');

  orchestrator.delegateTask(agentId, task).then(result => {
    if (result.success) {
      println(`任务完成!`, 'green');
      println('');
      println('智能体回复:', 'claudeBright');
      const text = result.data || '(无回复)';
      const lines = text.split('\n');
      for (const line of lines) {
        println(`  ${line}`, 'white');
      }
      println('');
    } else {
      println(`任务失败: ${result.error}`, 'red');
    }
  }).catch((error: any) => {
    println(`执行出错: ${error.message}`, 'red');
  });
}

export { printClusterStatus, handleSpawnCommand, handleDelegateCommand };