/**
 * 命令处理模块
 * 处理 /help、/status、/config 等特殊命令
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { println, printDivider, printTag } from '../io/terminal.js';
import { loadConfig } from '../config.js';
import { getToolNames, getToolsByCategory } from './registry.js';
import * as tools from './tools/index.js';
import { listSessions, getCurrentSession, createNewSession, switchSession, deleteSession, renameSession, resetConversation } from './session.js';

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
  
  基本操作:
    ENTER          - 打断当前思考，输入消息
    exit           - 退出程序
`;

/**
 * 处理特殊命令
 * @param {string} input 用户输入
 * @returns {boolean} 是否为特殊命令
 */
function handleCommand(input) {
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
  
  if (trimmed.startsWith('/switch ')) {
    const sessionId = trimmed.slice(8).trim();
    if (sessionId) {
      const result = switchSession(sessionId);
      if (result.success) {
        println(`[提示] 已切换到会话: ${result.session.name}`, 'green');
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
  
  return false;
}

/**
 * 打印帮助信息
 */
function printHelp() {
  println('');
  printDivider('=', 'cyan');
  println('  CogitoAgent 命令帮助', 'cyan');
  printDivider('=', 'cyan');
  println('');
  println('  可用命令:', 'yellow');
  println('    /help          - 显示此帮助信息', 'gray');
  println('    /status        - 显示当前状态', 'gray');
  println('    /clear         - 清空对话历史', 'gray');
  println('    /persona <name> - 切换 Persona', 'gray');
  println('    /personas      - 列出所有可用 Persona', 'gray');
  println('    /tools         - 列出所有可用工具', 'gray');
  println('    /config        - 显示当前配置', 'gray');
  println('    /debug         - 切换调试模式', 'gray');
  println('');
  println('  基本操作:', 'yellow');
  println('    ENTER          - 打断当前思考，输入消息', 'gray');
  println('    exit           - 退出程序', 'gray');
  println('');
  printDivider('=', 'cyan');
  println('');
}

/**
 * 打印当前状态
 */
function printStatus() {
  const cfg = loadConfig();
  const toolNames = getToolNames();
  
  println('');
  printDivider('=', 'cyan');
  println('  CogitoAgent 当前状态', 'cyan');
  printDivider('=', 'cyan');
  println('');
  println(`  Persona: ${printTag(cfg.persona || 'default', 'bgBlue')}`, 'white');
  println(`  模型: ${cfg.api.model || 'N/A'}`, 'white');
  println(`  API: ${cfg.api.baseURL || 'N/A'}`, 'white');
  println(`  工作区: ${tools.getBasePath()}`, 'white');
  println(`  思考间隔: ${cfg.chat?.thinkingInterval || 3000}ms`, 'white');
  println(`  调试模式: ${process.env.DEBUG === 'true' ? '开启' : '关闭'}`, 'white');
  println(`  工具注册数量: ${toolNames.length}`, 'white');
  println('');
  printDivider('=', 'cyan');
  println('');
}

/**
 * 打印清空确认提示
 */
function printClearConfirm() {
  println('');
  println('  ⚠️  确定要清空对话历史吗？此操作不可撤销', 'yellow');
  println(`  输入 ${printTag('y', 'bgGreen')} 确认清空, ${printTag('n', 'bgRed')} 取消`, 'yellow');
  println('');
}

/**
 * 切换 Persona（将 persona 文件复制为 persona.md 并重置对话）
 */
function switchPersona(personaName) {
  const personaPath = path.resolve(process.cwd(), 'personas', personaName, 'persona.md');
  const targetPath = path.resolve(process.cwd(), 'persona.md');

  if (!existsSync(personaPath)) {
    println(`[错误] Persona "${personaName}" 不存在`, 'red');
    println(`  可用 Persona 列表:`, 'gray');
    const dirs = readdirSync(path.resolve(process.cwd(), 'personas'), { withFileTypes: true })
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name);
    dirs.forEach(d => println(`    ${d}`, 'gray'));
    return;
  }

  let content;
  try {
    content = readFileSync(personaPath, 'utf-8');
  } catch (err) {
    println(`[错误] 无法读取 Persona 文件: ${err.message}`, 'red');
    return;
  }

  try {
    writeFileSync(targetPath, content, 'utf-8');
  } catch (err) {
    println(`[错误] 无法写入 persona.md: ${err.message}`, 'red');
    return;
  }

  // 重置对话历史，让新 persona 生效
  resetConversation();
  println(`[成功] Persona 已切换为: ${printTag(personaName, 'bgGreen')}`, 'green');
  println(`[提示] 对话历史已重置，新 Persona 已生效`, 'yellow');
}

/**
 * 列出所有可用 Persona
 */
function listPersonas() {
  const personasDir = path.resolve(process.cwd(), 'personas');
  const dirs = readdirSync(personasDir, { withFileTypes: true })
    .filter(dir => dir.isDirectory())
    .map(dir => dir.name);

  println('');
  printDivider('─', 'cyan');
  println(`  可用 Persona (${dirs.length} 个)`, 'cyan');
  printDivider('─', 'cyan');

  for (const dir of dirs) {
    const personaPath = path.join(personasDir, dir, 'persona.md');
    let firstLine = '(无描述)';
    if (existsSync(personaPath)) {
      const content = readFileSync(personaPath, 'utf-8');
      firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim() || '(无描述)';
    }
    println(`  ${printTag(dir, 'bgBlue')} ${firstLine}`, 'gray');
  }
  println('');
  println(`  使用 ${printTag('/persona <name>', 'bgBlue')} 切换`, 'gray');
  println('');
}

/**
 * 列出所有可用工具
 */
function listTools() {
  const categories = getToolsByCategory();
  const totalCount = getToolNames().length;
  
  println('');
  printDivider('=', 'cyan');
  println(`  可用工具列表 (共 ${totalCount} 个)`, 'cyan');
  printDivider('=', 'cyan');
  println('');
  
  for (const [category, toolList] of Object.entries(categories)) {
    println(`  ${category.toUpperCase()}:`, 'yellow');
    println(`    ${toolList.join(', ')}`, 'gray');
    println('');
  }
  
  printDivider('=', 'cyan');
  println('');
}

/**
 * 打印当前配置
 */
function printConfig() {
  const cfg = loadConfig();
  
  println('');
  printDivider('=', 'cyan');
  println('  当前配置', 'cyan');
  printDivider('=', 'cyan');
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
  printDivider('=', 'cyan');
  println('');
}

/**
 * 切换调试模式
 */
function toggleDebug() {
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
function printSessions() {
  const sessions = listSessions();
  const current = getCurrentSession();
  
  println('');
  printDivider('=', 'cyan');
  println('  会话列表', 'cyan');
  printDivider('=', 'cyan');
  println('');
  
  if (sessions.length === 0) {
    println('  暂无会话', 'gray');
  } else {
    for (const s of sessions) {
      const marker = s.isActive ? printTag('当前', 'bgGreen') : '     ';
      const date = new Date(s.lastActiveAt).toLocaleString('zh-CN', { 
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
      });
      println(`  ${marker}  ${s.name}`, 'white');
      println(`         ID: ${s.id}`, 'gray');
      println(`         最后活跃: ${date}`, 'gray');
      println('');
    }
  }
  
  println('  会话命令:', 'yellow');
  println('    /sessions       - 显示会话列表', 'gray');
  println('    /new            - 创建新会话', 'gray');
  println('    /switch <id>    - 切换到指定会话', 'gray');
  println('    /delete <id>    - 删除指定会话', 'gray');
  println('    /rename <name>  - 重命名当前会话', 'gray');
  println('');
  printDivider('=', 'cyan');
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
  HELP_TEXT
};
