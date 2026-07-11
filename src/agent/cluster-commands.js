/**
 * 集群命令处理模块
 * 处理 /spawn /delegate /agents /cluster /stop-agent /stop-all-agents 命令
 */

import { println, printDivider, printTag } from '../io/terminal.js';
import { orchestrator } from './orchestrator.js';

/**
 * 打印集群状态
 */
function printClusterStatus() {
  const status = orchestrator.getClusterStatus();

  println('');
  printDivider('=', 'cyan');
  println(`  🤖 智能体集群 (${status.totalAgents} 个)`, 'cyan');
  printDivider('=', 'cyan');
  println('');

  if (status.totalAgents === 0) {
    println('  暂无活跃智能体', 'gray');
    println('');
    println('  使用 /spawn <persona> <name> <instruction> 创建一个新的智能体', 'gray');
    println('  例如: /spawn Critic "审查官" "你负责审查代码质量"', 'gray');
  } else {
    // 状态概览
    const byState = status.byState;
    const stateSummary = Object.entries(byState)
      .map(([s, c]) => `${s}: ${c}`)
      .join(', ');
    println(`  状态概览: ${stateSummary}`, 'yellow');
    println('');

    // 每个智能体详情
    for (const agent of status.agents) {
      const stateColor = agent.state === 'done' ? 'green'
        : agent.state === 'error' ? 'red'
        : agent.state === 'thinking' ? 'yellow'
        : 'gray';

      const stateIcon = agent.state === 'done' ? '✅'
        : agent.state === 'error' ? '❌'
        : agent.state === 'thinking' ? '🧠'
        : agent.state === 'tool_executing' ? '🛠️'
        : '💤';

      println(`  ${stateIcon} ${printTag(agent.name, 'bgBlue')}`, 'white');
      println(`     ID: ${agent.id}`, 'gray');
      println(`     Persona: ${agent.persona}`, 'gray');
      println(`     状态: ${printTag(agent.state, stateColor === 'gray' ? 'bgGray' : stateColor === 'green' ? 'bgGreen' : stateColor === 'red' ? 'bgRed' : 'bgYellow')}`, 'gray');
      println(`     工具调用: ${agent.toolCalls} 次`, 'gray');
      println(`     迭代次数: ${agent.iterationCount}`, 'gray');
      if (agent.hasError) {
        println(`     错误: ${agent.error}`, 'red');
      }
      println('');
    }
  }

  println('  集群命令:', 'yellow');
  println('    /spawn <persona> <name> <instruction>  - 生成新智能体', 'gray');
  println('    /delegate <agentId> <task>            - 委托任务', 'gray');
  println('    /agents                - 显示集群状态', 'gray');
  println('    /cluster               - 显示集群状态', 'gray');
  println('    /stop-agent <id>       - 停止智能体', 'gray');
  println('    /stop-all-agents       - 停止所有智能体', 'gray');
  println('');
  printDivider('=', 'cyan');
  println('');
}

/**
 * 处理 spawn 命令
 */
function handleSpawnCommand(input) {
  // 格式: /spawn <persona> "<name>" "<instruction>"
  // 或: /spawn <persona> <name> <instruction>
  const rest = input.slice(7).trim();

  // 尝试解析引号包裹的参数
  const args = [];
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

  println(`[集群] 正在生成智能体 "${name}" (Persona: ${persona})...`, 'yellow');

  orchestrator.spawnAgent(persona, name, instruction).then(result => {
    if (result.success) {
      println(`[集群] 智能体已生成:`, 'green');
      println(`   ID: ${result.data.id}`, 'white');
      println(`   名称: ${result.data.name}`, 'white');
      println(`   Persona: ${result.data.persona}`, 'white');
      println(`   指令: ${result.data.instruction}`, 'white');
      println('');
      println(`  使用 /delegate ${result.data.id} "任务描述" 来分配任务`, 'gray');
    } else {
      println(`[错误] ${result.error}`, 'red');
    }
  }).catch(error => {
    println(`[错误] 生成失败: ${error.message}`, 'red');
  });
}

/**
 * 处理 delegate 命令
 */
function handleDelegateCommand(input) {
  // 格式: /delegate <agentId> <task>
  const rest = input.slice(10).trim();

  // 第一个空格前的部分是 agentId
  const spaceIdx = rest.indexOf(' ');
  if (spaceIdx === -1) {
    println('[错误] 请提供任务描述', 'red');
    println('用法: /delegate <agent_id> <任务描述>', 'gray');
    return;
  }

  const agentId = rest.slice(0, spaceIdx).trim();
  const task = rest.slice(spaceIdx + 1).trim();

  if (!agentId || !task) {
    println('[错误] 请提供智能体 ID 和任务描述', 'red');
    println('用法: /delegate <agent_id> <任务描述>', 'gray');
    return;
  }

  println(`[集群] 正在委托任务给智能体 "${agentId}"...`, 'yellow');
  println(`[集群] 任务: ${task}`, 'gray');
  println('[集群] 智能体开始思考，请稍候...', 'yellow');

  orchestrator.delegateTask(agentId, task).then(result => {
    if (result.success) {
      println(`[集群] 任务完成!`, 'green');
      println('');
      printDivider('─', 'cyan');
      println('  智能体回复:', 'cyan');
      printDivider('─', 'cyan');
      const text = result.data || '(无回复)';
      const lines = text.split('\n');
      for (const line of lines) {
        println(`  ${line}`, 'white');
      }
      printDivider('─', 'cyan');
      println('');
    } else {
      println(`[集群] 任务失败: ${result.error}`, 'red');
    }
  }).catch(error => {
    println(`[集群] 执行出错: ${error.message}`, 'red');
  });
}

export { printClusterStatus, handleSpawnCommand, handleDelegateCommand };
