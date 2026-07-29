/**
 * 命令处理模块
 * 处理 /help、/status、/config 等特殊命令
 */

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

// 命令帮助文本
const HELP_TEXT = `
  CogitoAgent 命令帮助

  可用命令:
    /help          - 显示此帮助信息
    /status        - 显示当前状态
    /clear         - 清空对话历史
    /persona <name> - 切换 Persona
    /personas      - 列出所有可用 Persona
    /tools         - 列出所有可用工具
    /config        - 显示当前配置
    /debug         - 切换调试模式
    /sessions      - 显示会话列表
    /new           - 创建新会话
    /switch <id>   - 切换会话
    /delete <id>   - 删除会话
    /rename <name> - 重命名当前会话

  集群命令:
    /spawn <persona> <name> <instruction>  - 生成新智能体
    /delegate <agentId> <task>            - 委托任务
    /agents /cluster      - 显示集群状态
    /stop-agent <id>      - 停止智能体
    /stop-all-agents      - 停止所有智能体

  基本操作:
    ENTER          - 打断当前思考，输入消息
    exit           - 退出程序
`;

/**
 * 处理特殊命令
 * @param input 用户输入
 * @returns 是否为特殊命令
 */
function handleCommand(input: string): boolean {
  const trimmed = input.trim();

  // 帮助命令
  if (trimmed === '/help' || trimmed === '/?') {
    printHelp();
    return true;
  }

  // 状态命令
  if (trimmed === '/status') {
    printStatus();
    return true;
  }

  // 清空历史命令
  if (trimmed === '/clear') {
    printClearConfirm();
    return true;
  }

  // Persona切换命令
  if (trimmed.startsWith('/persona ')) {
    const personaName = trimmed.slice(9).trim();
    if (personaName) {
      switchPersona(personaName);
      return true;
    } else {
      println('[错误] 请提供 persona 名称', 'red');
      println('用法: /persona <name>', 'gray');
      return true;
    }
  }

  // 列出可用 personas
  if (trimmed === '/personas') {
    listPersonas();
    return true;
  }

  // 列出可用工具
  if (trimmed === '/tools') {
    listTools();
    return true;
  }

  // 导出配置命令
  if (trimmed === '/config') {
    printConfig();
    return true;
  }

  // 调试模式切换
  if (trimmed === '/debug') {
    toggleDebug();
    return true;
  }

  // 会话管理命令
  if (trimmed === '/sessions') {
    printSessions();
    return true;
  }

  if (trimmed === '/new') {
    createNewSession();
    println('[提示] 已创建新会话，可以开始新的对话', 'green');
    return true;
  }

  if (trimmed.startsWith('/new ')) {
    const personaName = trimmed.slice(5).trim();
    createNewSession(null, personaName);
    // 创建后立即切换到指定人设
    switchPersona(personaName);
    println(`[提示] 已创建新会话，人设: ${personaName}`, 'green');
    return true;
  }

  if (trimmed.startsWith('/switch ')) {
    const sessionId = trimmed.slice(8).trim();
    if (sessionId) {
      const result = switchSession(sessionId);
      if (result.success) {
        println(`[提示] 已切换到会话: ${result.session?.name}`, 'green');
        // 通知前端刷新人设媒体
        try {
          broadcast('persona-switched', { persona: result.session?.persona || '' });
        } catch {}
      } else {
        println(`[错误] ${result.error}`, 'red');
      }
      return true;
    } else {
      println('[错误] 请提供会话 ID', 'red');
      println('用法: /switch <session_id>', 'gray');
      return true;
    }
  }

  if (trimmed.startsWith('/delete ')) {
    const sessionId = trimmed.slice(8).trim();
    if (sessionId) {
      const result = deleteSession(sessionId);
      if (result.success) {
        println('[提示] 会话已删除', 'green');
      } else {
        println(`[错误] ${result.error}`, 'red');
      }
      return true;
    } else {
      println('[错误] 请提供会话 ID', 'red');
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
          println(`[提示] 会话已重命名为: ${newName}`, 'green');
        } else {
          println(`[错误] ${result.error}`, 'red');
        }
      }
      return true;
    } else {
      println('[错误] 请提供新名称', 'red');
      println('用法: /rename <新名称>', 'gray');
      return true;
    }
  }

  // 集群管理命令
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
        println(`[集群] 智能体 "${result.data.name}" 已停止`, 'green');
      } else {
        println(`[错误] ${result.error}`, 'red');
      }
    } else {
      println('[错误] 请提供智能体 ID', 'red');
      println('用法: /stop-agent <agent_id>', 'gray');
    }
    return true;
  }

  if (trimmed === '/stop-all-agents') {
    const result = orchestrator.stopAllAgents();
    println(`[集群] 已停止 ${result.data.stoppedCount} 个智能体`, 'yellow');
    return true;
  }

  // 微信命令
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
        println(`[微信] 已登录账号: ${status.data.accountId}`, 'green');
      } else {
        println('[微信] 未登录', 'gray');
      }
    });
    return true;
  }

  return false;
}

/**
 * 打印帮助信息
 */
function printHelp(): void {
  println('');
  printDivider('━', 'claude');
  println('  CogitoAgent 命令帮助', 'claudeBright');
  printDivider('━', 'claude');
  println('');
  println('  可用命令:', 'claude');
  println('    /help          - 显示此帮助信息', 'gray');
  println('    /status        - 显示当前状态', 'gray');
  println('    /clear         - 清空对话历史', 'gray');
  println('    /persona <name> - 切换 Persona', 'gray');
  println('    /personas      - 列出所有可用 Persona', 'gray');
  println('    /tools         - 列出所有可用工具', 'gray');
  println('    /config        - 显示当前配置', 'gray');
  println('    /debug         - 切换调试模式', 'gray');
  println('');
  println('  集群命令:', 'claude');
  println('    /spawn <persona> <name> <instruction>  - 生成新智能体', 'gray');
  println('    /delegate <agentId> <task>            - 委托任务', 'gray');
  println('    /agents /cluster      - 显示集群状态', 'gray');
  println('    /stop-agent <id>      - 停止智能体', 'gray');
  println('    /stop-all-agents      - 停止所有智能体', 'gray');
  println('');
  println('  基本操作:', 'claude');
  println('    ENTER          - 打断当前思考，输入消息', 'gray');
  println('    exit           - 退出程序', 'gray');
  println('');
  printDivider('━', 'claude');
  println('');
}

/**
 * 打印当前状态
 */
function printStatus(): void {
  const cfg: any = loadConfig();
  const toolNames = getToolNames();

  println('');
  printDivider('━', 'claude');
  println('  CogitoAgent 当前状态', 'claudeBright');
  printDivider('━', 'claude');
  println('');
  println(`  Persona: ${printTag(cfg.persona || 'default', 'bgClaude')}`, 'white');
  println(`  模型: ${cfg.api.model || 'N/A'}`, 'white');
  println(`  API: ${cfg.api.baseURL || 'N/A'}`, 'white');
  println(`  工作区: ${tools.getBasePath()}`, 'white');
  println(`  思考间隔: ${cfg.chat?.thinkingInterval || 3000}ms`, 'white');
  println(`  调试模式: ${process.env.DEBUG === 'true' ? '开启' : '关闭'}`, 'white');
  println(`  工具注册数量: ${toolNames.length}`, 'white');

  // 集群状态
  const clusterStatus = orchestrator.getClusterStatus();
  if (clusterStatus.totalAgents > 0) {
    const byState = Object.entries(clusterStatus.byState)
      .map(([s, c]) => `${s}: ${c}`).join(', ');
    println(`  智能体集群: ${clusterStatus.totalAgents} 个活跃 (${byState})`, 'white');
  }

  // Token 用量统计
  const s = getSessionStats();
  println('');
  printDivider('-', 'claude');
  println('  Token 用量', 'claude');
  println(`    累计: 输入 ${s.totalInputTokens.toLocaleString()} / 输出 ${s.totalOutputTokens.toLocaleString()} / 总计 ${s.totalTokens.toLocaleString()}`, 'white');
  println(`    今日: 输入 ${s.todayInputTokens.toLocaleString()} / 输出 ${s.todayOutputTokens.toLocaleString()} / 总计 ${s.todayTokens.toLocaleString()}`, 'white');

  println('');
  printDivider('━', 'claude');
  println('');
}

/**
 * 打印清空确认提示
 */
function printClearConfirm(): void {
  println('');
  println('  ⚠️  确定要清空对话历史吗？此操作不可撤销', 'yellow');
  println(`  输入 ${printTag('y', 'bgGreen')} 确认清空, ${printTag('n', 'bgRed')} 取消`, 'yellow');
  println('');
}

/**
 * 切换 Persona（将 persona 文件复制为 persona.md 并重置对话）
 */
function switchPersona(personaName: string): void {
  const DATA_DIR = process.env.COGITO_USER_DATA_DIR || process.cwd();
  const personaPath = path.resolve(process.cwd(), 'personas', personaName, 'persona.md');
  const targetPath = path.resolve(DATA_DIR, 'persona.md');

  if (!existsSync(personaPath)) {
    println(`[错误] Persona "${personaName}" 不存在`, 'red');
    println(`  可用 Persona 列表:`, 'gray');
    const dirs = readdirSync(path.resolve(process.cwd(), 'personas'), { withFileTypes: true })
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name);
    dirs.forEach(d => println(`    ${d}`, 'gray'));
    return;
  }

  let content: string;
  try {
    content = readFileSync(personaPath, 'utf-8');
  } catch (err: any) {
    println(`[错误] 无法读取 Persona 文件: ${err.message}`, 'red');
    return;
  }

  // 写入 persona 文件
  try {
    writeFileSync(targetPath, content, 'utf-8');
  } catch (err: any) {
    println(`[错误] 无法写入 persona.md: ${err.message}`, 'red');
    return;
  }

  // 更新当前对话的 system prompt，不重置对话历史
  updateSystemPrompt();
  println(`[成功] Persona 已切换为: ${printTag(personaName, 'bgGreen')}`, 'green');
  println(`[提示] 新 Persona 已生效，对话历史保留`, 'yellow');

  // 广播人设切换事件，通知前端更新媒体资源
  try {
    broadcast('persona-switched', { persona: personaName });
  } catch {
    // WebSocket 未就绪时忽略
  }
}

/**
 * 列出所有可用 Persona
 */
function listPersonas(): void {
  const personasDir = path.resolve(process.cwd(), 'personas');
  const dirs = readdirSync(personasDir, { withFileTypes: true })
    .filter(dir => dir.isDirectory())
    .map(dir => dir.name);

  println('');
  printDivider('─', 'claude');
  println(`  可用 Persona (${dirs.length} 个)`, 'claudeBright');
  printDivider('─', 'claude');

  for (const dir of dirs) {
    const personaPath = path.join(personasDir, dir, 'persona.md');
    let firstLine = '(无描述)';
    if (existsSync(personaPath)) {
      const content = readFileSync(personaPath, 'utf-8');
      firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim() || '(无描述)';
    }
    println(`  ${printTag(dir, 'bgClaude')} ${firstLine}`, 'gray');
  }
  println('');
  println(`  使用 ${printTag('/persona <name>', 'bgClaude')} 切换`, 'gray');
  println('');
}

/**
 * 列出所有可用工具
 */
function listTools(): void {
  const categories = getToolsByCategory();
  const totalCount = getToolNames().length;

  println('');
  printDivider('━', 'claude');
  println(`  可用工具列表 (共 ${totalCount} 个)`, 'claudeBright');
  printDivider('━', 'claude');
  println('');

  for (const [category, toolList] of Object.entries(categories)) {
    println(`  ${category.toUpperCase()}:`, 'claude');
    println(`    ${toolList.join(', ')}`, 'gray');
    println('');
  }

  printDivider('━', 'claude');
  println('');
}

/**
 * 打印当前配置
 */
function printConfig(): void {
  const cfg: any = loadConfig();

  println('');
  printDivider('━', 'claude');
  println('  当前配置', 'claudeBright');
  printDivider('━', 'claude');
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
  printDivider('━', 'claude');
  println('');
}

/**
 * 切换调试模式
 */
function toggleDebug(): void {
  const current = process.env.DEBUG === 'true';
  process.env.DEBUG = (!current).toString();
  println(`[调试] 调试模式已${current ? '关闭' : '开启'}`, 'yellow');

  if (!current) {
    println('  提示: 开启调试模式后会显示详细的错误堆栈', 'gray');
  }
}

/**
 * 打印会话列表
 */
function printSessions(): void {
  const sessions = listSessions();
  const current = getCurrentSession();

  println('');
  printDivider('━', 'claude');
  println('  会话列表', 'claudeBright');
  printDivider('━', 'claude');
  println('');

  if (sessions.length === 0) {
    println('  暂无会话', 'gray');
  } else {
    for (const s of sessions) {
      const marker = s.isActive ? printTag('当前', 'bgSuccess') : '     ';
      const date = new Date(s.lastActiveAt).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      println(`  ${marker}  ${s.name}`, 'white');
      println(`         ID: ${s.id}`, 'gray');
      println(`         最后活跃: ${date}`, 'gray');
      println('');
    }
  }

  println('  会话命令:', 'claude');
  println('    /sessions       - 显示会话列表', 'gray');
  println('    /new           - 创建新会话', 'gray');
  println('    /new <人设>    - 创建新会话并指定人设', 'gray');
  println('    /switch <id>    - 切换到指定会话', 'gray');
  println('    /delete <id>    - 删除指定会话', 'gray');
  println('    /rename <name>  - 重命名当前会话', 'gray');

  println('');
  printDivider('━', 'claude');
  println('');
}

// printClusterStatus / handleSpawnCommand / handleDelegateCommand 已移动到 cluster-commands.ts

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
