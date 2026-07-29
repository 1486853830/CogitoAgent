import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { println, printDivider, printTag } from '../io/terminal.ts';
import { loadConfig } from '../config.ts';
import { getToolNames, getToolsByCategory } from './registry.ts';
import * as tools from './tools/index.ts';
import { listSessions, getCurrentSession, createNewSession, switchSession, deleteSession, renameSession, resetConversation, updateSystemPrompt } from './session.ts';
import { orchestrator } from './orchestrator.ts';
import { manualLoginWechat, manualLogoutWechat, getWechatStatus } from './wechat-manager.ts';
import { getSessionStats } from './stats.ts';
import { broadcast } from '../io/ws-server.ts';
import { printClusterStatus, handleSpawnCommand, handleDelegateCommand } from './cluster-commands.ts';

const HELP_TEXT = `
  CogitoAgent 命令

  可用:
    /help           显示此帮助
    /status         显示当前状态
    /clear          清空对话历史
    /persona <name> 切换 Persona
    /personas       列出可用 Persona
    /tools          列出可用工具
    /config         显示当前配置
    /debug          切换调试模式
    /sessions       会话列表
    /new            创建新会话
    /switch <id>    切换会话
    /delete <id>    删除会话
    /rename <name>  重命名当前会话

  集群:
    /spawn <persona> <name> <instruction>  生成新智能体
    /delegate <agentId> <task>             委托任务
    /agents /cluster                       显示集群状态
    /stop-agent <id>                       停止智能体
    /stop-all-agents                       停止所有智能体

  操作:
    ENTER           打断思考，输入消息
    exit            退出程序
`;

function handleCommand(input: string): boolean {
  const trimmed = input.trim();

  if (trimmed === '/help' || trimmed === '/?') {
    printHelp();
    return true;
  }

  if (trimmed === '/status') {
    printStatus();
    return true;
  }

  if (trimmed === '/clear') {
    printClearConfirm();
    return true;
  }

  if (trimmed.startsWith('/persona ')) {
    const personaName = trimmed.slice(9).trim();
    if (personaName) {
      switchPersona(personaName);
      return true;
    } else {
      println('请提供 persona 名称', 'red');
      println('用法: /persona <name>', 'gray');
      return true;
    }
  }

  if (trimmed === '/personas') {
    listPersonas();
    return true;
  }

  if (trimmed === '/tools') {
    listTools();
    return true;
  }

  if (trimmed === '/config') {
    printConfig();
    return true;
  }

  if (trimmed === '/debug') {
    toggleDebug();
    return true;
  }

  if (trimmed === '/sessions') {
    printSessions();
    return true;
  }

  if (trimmed === '/new') {
    createNewSession();
    println('已创建新会话', 'green');
    return true;
  }

  if (trimmed.startsWith('/new ')) {
    const personaName = trimmed.slice(5).trim();
    createNewSession(null, personaName);
    switchPersona(personaName);
    println(`已创建新会话，人设: ${personaName}`, 'green');
    return true;
  }

  if (trimmed.startsWith('/switch ')) {
    const sessionId = trimmed.slice(8).trim();
    if (sessionId) {
      const result = switchSession(sessionId);
      if (result.success) {
        println(`已切换到会话: ${result.session?.name}`, 'green');
        try {
          broadcast('persona-switched', { persona: result.session?.persona || '' });
        } catch {}
      } else {
        println(`${result.error}`, 'red');
      }
      return true;
    } else {
      println('请提供会话 ID', 'red');
      println('用法: /switch <session_id>', 'gray');
      return true;
    }
  }

  if (trimmed.startsWith('/delete ')) {
    const sessionId = trimmed.slice(8).trim();
    if (sessionId) {
      const result = deleteSession(sessionId);
      if (result.success) {
        println('会话已删除', 'green');
      } else {
        println(`${result.error}`, 'red');
      }
      return true;
    } else {
      println('请提供会话 ID', 'red');
      println('用法: /delete <session_id>', 'gray');
      return true;
    }
  }

  if (trimmed.startsWith('/rename ')) {
    const newName = trimmed.slice(8).trim();
    if (newName) {
      const current = getCurrentSession();
      if (current) {
        const result = renameSession(current.id, newName);
        if (result.success) {
          println(`会话已重命名为: ${newName}`, 'green');
        } else {
          println(`${result.error}`, 'red');
        }
      }
      return true;
    } else {
      println('请提供新名称', 'red');
      println('用法: /rename <新名称>', 'gray');
      return true;
    }
  }

  if (trimmed === '/agents') {
    printClusterStatus();
    return true;
  }

  if (trimmed === '/cluster') {
    printClusterStatus();
    return true;
  }

  if (trimmed.startsWith('/spawn ')) {
    handleSpawnCommand(trimmed);
    return true;
  }

  if (trimmed.startsWith('/delegate ')) {
    handleDelegateCommand(trimmed);
    return true;
  }

  if (trimmed.startsWith('/stop-agent ')) {
    const agentId = trimmed.slice(12).trim();
    if (agentId) {
      const result = orchestrator.stopAgent(agentId);
      if (result.success) {
        println(`智能体 "${result.data.name}" 已停止`, 'green');
      } else {
        println(`${result.error}`, 'red');
      }
    } else {
      println('请提供智能体 ID', 'red');
      println('用法: /stop-agent <agent_id>', 'gray');
    }
    return true;
  }

  if (trimmed === '/stop-all-agents') {
    const result = orchestrator.stopAllAgents();
    println(`已停止 ${result.data.stoppedCount} 个智能体`, 'yellow');
    return true;
  }

  if (trimmed === '/wechat/login') {
    manualLoginWechat().catch((e: Error) => console.error('[微信] login 异常:', e.message));
    return true;
  }

  if (trimmed === '/wechat/logout') {
    manualLogoutWechat().catch((e: Error) => console.error('[微信] logout 异常:', e.message));
    return true;
  }

  if (trimmed === '/wechat/status') {
    getWechatStatus().then((status: any) => {
      if (status.success && status.data.loggedIn) {
        println(`已登录账号: ${status.data.accountId}`, 'green');
      } else {
        println('未登录', 'gray');
      }
    });
    return true;
  }

  return false;
}

function printHelp(): void {
  println('');
  println('CogitoAgent 命令', 'claudeBright');
  println('');
  println('可用:', 'claude');
  println('  /help           显示此帮助', 'gray');
  println('  /status         显示当前状态', 'gray');
  println('  /clear          清空对话历史', 'gray');
  println('  /persona <name> 切换 Persona', 'gray');
  println('  /personas       列出可用 Persona', 'gray');
  println('  /tools          列出可用工具', 'gray');
  println('  /config         显示当前配置', 'gray');
  println('  /debug          切换调试模式', 'gray');
  println('');
  println('集群:', 'claude');
  println('  /spawn <persona> <name> <instruction>  生成新智能体', 'gray');
  println('  /delegate <agentId> <task>             委托任务', 'gray');
  println('  /agents /cluster                       显示集群状态', 'gray');
  println('  /stop-agent <id>                       停止智能体', 'gray');
  println('  /stop-all-agents                       停止所有智能体', 'gray');
  println('');
  println('操作:', 'claude');
  println('  ENTER           打断思考，输入消息', 'gray');
  println('  exit            退出程序', 'gray');
  println('');
}

function printStatus(): void {
  const cfg: any = loadConfig();
  const toolNames = getToolNames();

  println('');
  println('当前状态', 'claudeBright');
  println('');
  println(`  Persona: ${cfg.persona || 'default'}`, 'white');
  println(`  模型: ${cfg.api.model || 'N/A'}`, 'white');
  println(`  API: ${cfg.api.baseURL || 'N/A'}`, 'white');
  println(`  工作区: ${tools.getBasePath()}`, 'white');
  println(`  思考间隔: ${cfg.chat?.thinkingInterval || 3000}ms`, 'white');
  println(`  调试模式: ${process.env.DEBUG === 'true' ? '开启' : '关闭'}`, 'white');
  println(`  工具注册数量: ${toolNames.length}`, 'white');

  const clusterStatus = orchestrator.getClusterStatus();
  if (clusterStatus.totalAgents > 0) {
    const byState = Object.entries(clusterStatus.byState)
      .map(([s, c]) => `${s}: ${c}`).join(', ');
    println(`  智能体集群: ${clusterStatus.totalAgents} 个活跃 (${byState})`, 'white');
  }

  const s = getSessionStats();
  println('');
  println('Token 用量', 'claude');
  println(`  累计: 输入 ${s.totalInputTokens.toLocaleString()} / 输出 ${s.totalOutputTokens.toLocaleString()} / 总计 ${s.totalTokens.toLocaleString()}`, 'white');
  println(`  今日: 输入 ${s.todayInputTokens.toLocaleString()} / 输出 ${s.todayOutputTokens.toLocaleString()} / 总计 ${s.todayTokens.toLocaleString()}`, 'white');
  println('');
}

function printClearConfirm(): void {
  println('');
  println('确定要清空对话历史吗？此操作不可撤销', 'yellow');
  println(`输入 y 确认清空, n 取消`, 'yellow');
  println('');
}

function switchPersona(personaName: string): void {
  const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
  const personaPath = path.resolve(process.cwd(), 'personas', personaName, 'persona.md');
  const targetPath = path.resolve(DATA_DIR, 'persona.md');

  if (!existsSync(personaPath)) {
    println(`Persona "${personaName}" 不存在`, 'red');
    println('可用 Persona 列表:', 'gray');
    const dirs = readdirSync(path.resolve(process.cwd(), 'personas'), { withFileTypes: true })
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name);
    dirs.forEach(d => println(`  ${d}`, 'gray'));
    return;
  }

  let content: string;
  try {
    content = readFileSync(personaPath, 'utf-8');
  } catch (err: any) {
    println(`无法读取 Persona 文件: ${err.message}`, 'red');
    return;
  }

  try {
    writeFileSync(targetPath, content, 'utf-8');
  } catch (err: any) {
    println(`无法写入 persona.md: ${err.message}`, 'red');
    return;
  }

  updateSystemPrompt();
  println(`Persona 已切换为: ${personaName}`, 'green');
  println('新 Persona 已生效，对话历史保留', 'yellow');

  try {
    broadcast('persona-switched', { persona: personaName });
  } catch {}
}

function listPersonas(): void {
  const personasDir = path.resolve(process.cwd(), 'personas');
  const dirs = readdirSync(personasDir, { withFileTypes: true })
    .filter(dir => dir.isDirectory())
    .map(dir => dir.name);

  println('');
  println(`可用 Persona (${dirs.length} 个)`, 'claudeBright');
  println('');

  for (const dir of dirs) {
    const personaPath = path.join(personasDir, dir, 'persona.md');
    let firstLine = '(无描述)';
    if (existsSync(personaPath)) {
      const content = readFileSync(personaPath, 'utf-8');
      firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim() || '(无描述)';
    }
    println(`  ${dir}  ${firstLine}`, 'gray');
  }
  println('');
  println(`使用 /persona <name> 切换`, 'gray');
  println('');
}

function listTools(): void {
  const categories = getToolsByCategory();
  const totalCount = getToolNames().length;

  println('');
  println(`可用工具 (共 ${totalCount} 个)`, 'claudeBright');
  println('');

  for (const [category, toolList] of Object.entries(categories)) {
    println(`${category.toUpperCase()}:`, 'claude');
    println(`  ${toolList.join(', ')}`, 'gray');
    println('');
  }
}

function printConfig(): void {
  const cfg: any = loadConfig();

  println('');
  println('当前配置', 'claudeBright');
  println('');
  println(`  Persona: ${cfg.persona || 'default'}`, 'white');
  println(`  工作区: ${cfg.workspace || './'}`, 'white');
  println(`  模型: ${cfg.api.model || 'N/A'}`, 'white');
  println(`  API Base: ${cfg.api.baseURL || 'N/A'}`, 'white');
  println(`  API Key: ${cfg.api.apiKey ? '***' + cfg.api.apiKey.slice(-4) : '未设置'}`, 'white');
  println(`  思考间隔: ${cfg.chat?.thinkingInterval || 3000}ms`, 'white');
  println(`  数据库: ${cfg.database?.path || '未设置'}`, 'white');
  println(`  邮件: ${cfg.email?.smtpHost || '未配置'}`, 'white');
  println(`  调试模式: ${process.env.DEBUG === 'true' ? '开启' : '关闭'}`, 'white');
  println('');
}

function toggleDebug(): void {
  const current = process.env.DEBUG === 'true';
  process.env.DEBUG = (!current).toString();
  println(`调试模式已${current ? '关闭' : '开启'}`, 'yellow');

  if (!current) {
    println('提示: 开启调试模式后会显示详细的错误堆栈', 'gray');
  }
}

function printSessions(): void {
  const sessions = listSessions();
  const current = getCurrentSession();

  println('');
  println('会话列表', 'claudeBright');
  println('');

  if (sessions.length === 0) {
    println('  暂无会话', 'gray');
  } else {
    for (const s of sessions) {
      const marker = s.isActive ? '[当前]' : '     ';
      const date = new Date(s.lastActiveAt).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      println(`  ${marker} ${s.name}`, 'white');
      println(`         ID: ${s.id}  最后活跃: ${date}`, 'gray');
    }
  }

  println('');
  println('会话命令:', 'claude');
  println('  /sessions       显示会话列表', 'gray');
  println('  /new           创建新会话', 'gray');
  println('  /new <人设>    创建新会话并指定人设', 'gray');
  println('  /switch <id>   切换到指定会话', 'gray');
  println('  /delete <id>   删除指定会话', 'gray');
  println('  /rename <name> 重命名当前会话', 'gray');
  println('');
}

export {
  handleCommand,
  printHelp,
  printStatus,
  printClearConfirm,
  switchPersona,
  listPersonas,
  listTools,
  printConfig,
  toggleDebug,
  printSessions,
  printClusterStatus,
  HELP_TEXT
};