/**
 * 核心智能体模块
 */

import { streamChat } from '../api/client.js';
import { ls, read, copy, mkdir, create, search } from './tools.js';
import { getMessages, addUserMessage, addAssistantMessage, shouldCompress, compressHistory } from './prompt.js';
import { init, print, println, printBlank, printBanner, printDivider, printTag, exit } from '../io/terminal.js';

const THOUGHT_INTERVAL = 3000;

const STATE = {
  THINKING: 'THINKING',
  AWAITING_INPUT: 'AWAITING_INPUT',
};

let state = STATE.THINKING;
let thinkingTimer = null;
let shouldStop = false;

function parseToolCall(text) {
  const fullMatch = text.match(/\[TOOL\]\s*(\w+)\s*\(([^)]*)\)\s*\[\/TOOL\]/);
  if (fullMatch) {
    const tool = fullMatch[1];
    const argsStr = fullMatch[2];
    const args = parseArgs(argsStr);
    return { tool, args };
  }
  return null;
}

function parseAllToolCalls(text) {
  const results = [];
  const regex = /\[TOOL\]\s*(\w+)\s*\(([^)]*)\)\s*\[\/TOOL\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tool = match[1];
    const argsStr = match[2];
    const args = parseArgs(argsStr);
    results.push({ tool, args });
  }
  return results;
}

function parseArgs(argsStr) {
  const result = [];
  const parts = argsStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      result.push(trimmed.slice(1, -1));
    } else {
      result.push(trimmed);
    }
  }
  return result;
}

function formatLsResult(data) {
  const dirs = data.filter(i => i.type === 'dir').map(i => `  ${i.name}/`);
  const files = data.filter(i => i.type === 'file').map(i => `  ${i.name}`);
  let lines = [];
  if (dirs.length) lines.push('  [目录]');
  lines = lines.concat(dirs.slice(0, 20));
  if (dirs.length > 20) lines.push(`  ... 还有 ${dirs.length - 20} 个目录`);
  if (files.length) lines.push('  [文件]');
  lines = lines.concat(files.slice(0, 20));
  if (files.length > 20) lines.push(`  ... 还有 ${files.length - 20} 个文件`);
  return lines.join('\n');
}

function formatToolResult(tool, data) {
  if (tool === 'ls' && Array.isArray(data)) {
    return formatLsResult(data);
  }
  return String(data);
}

async function executeTool(tool, args) {
  switch (tool) {
    case 'ls':
      return await ls(args[0]);
    case 'read':
      return await read(args[0]);
    case 'copy':
      return await copy(args[0], args[1]);
    case 'mkdir':
      return await mkdir(args[0]);
    case 'create':
      const createContent = args.slice(1).join(',');
      return await create(args[0], createContent);
    case 'search':
      // 参数可能是用逗号分隔的字符串；搜索词本身可能含逗号，因此取整个原始字符串
      const searchQuery = args.join(',').trim();
      return await search(searchQuery);
    default:
      return { success: false, error: `未知工具: ${tool}` };
  }
}

function handleUserInput(input) {
  if (input.toLowerCase() === 'exit') {
    exit();
    return;
  }

  if (state === STATE.THINKING) {
    shouldStop = true;
    clearTimeout(thinkingTimer);
    println('\n[中断] 思考已停止，请输入消息...', 'yellow');
    state = STATE.AWAITING_INPUT;
    return;
  }

  if (state === STATE.AWAITING_INPUT) {
    if (input) {
      println(`[消息] ${input}`, 'yellow');
      addUserMessage(input);
      state = STATE.THINKING;
      scheduleNextCycle();
    } else {
      println('[取消] 没有消息，继续思考', 'gray');
      state = STATE.THINKING;
      scheduleNextCycle();
    }
    return;
  }
}

async function thinkCycle() {
  if (state !== STATE.THINKING) return;

  try {
    const messages = getMessages();
    let fullResponse = '';
    let wantsToWait = false;

    for await (const chunk of streamChat(messages)) {
      if (shouldStop) {
        shouldStop = false;
        printBlank();
        return;
      }
      if (chunk.reasoning) {
        print(chunk.reasoning, 'gray');
      }
      if (chunk.content) {
        fullResponse += chunk.content;
        print(chunk.content);
      }
    }

    if (shouldStop) {
      shouldStop = false;
      printBlank();
      return;
    }

    printBlank();

    if (fullResponse.includes('[WAIT]')) {
      wantsToWait = true;
      println('[等待] 我先不说了，等你说～', 'gray');
    }

    // 循环处理所有工具调用
    const toolCalls = parseAllToolCalls(fullResponse);

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        println(`[执行] ${toolCall.tool}("${toolCall.args.join('", "')}")`, 'green');
        const result = await executeTool(toolCall.tool, toolCall.args);
        if (result.success) {
          println(`[结果]\n${formatToolResult(toolCall.tool, result.data)}`, 'green');
          addAssistantMessage(fullResponse + `\n\n[工具结果]: ${JSON.stringify(result.data)}`);
        } else {
          println(`[失败] ${result.error}`, 'red');
          addAssistantMessage(fullResponse + `\n\n[工具错误]: ${result.error}`);
        }
      }
    } else {
      addAssistantMessage(fullResponse);
    }

    if (shouldCompress()) {
      println('[系统] 正在压缩对话历史...', 'gray');
      compressHistory();
      println('[系统] 压缩完成', 'gray');
    }

    if (wantsToWait || (toolCalls.length === 0 && state === STATE.THINKING)) {
      state = STATE.AWAITING_INPUT;
    }

  } catch (error) {
    if (shouldStop) {
      shouldStop = false;
      return;
    }
    println(`[错误] ${error.message}`, 'red');
  }
}

function scheduleNextCycle() {
  clearTimeout(thinkingTimer);
  thinkingTimer = setTimeout(async () => {
    if (state === STATE.THINKING) {
      await thinkCycle();
      scheduleNextCycle();
    }
  }, THOUGHT_INTERVAL);
}

async function start() {
  printBanner();
  printDivider('─', 'cyan');
  println('  活动范围: ' + printTag('D:\\', 'bgBlue') + '  思考间隔: ' + printTag(`${THOUGHT_INTERVAL / 1000}秒`, 'bgCyan'));
  printDivider('─', 'cyan');
  println('  按 ' + printTag('Enter', 'bgBlue') + ' 打断思考，输入 ' + printTag('exit', 'bgBlue') + ' 退出\n', 'gray');

  init(handleUserInput);

  addUserMessage('你好，我启动了');
  await thinkCycle();
  scheduleNextCycle();
}

export { start };
