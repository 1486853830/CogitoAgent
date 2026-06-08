/**
 * 核心智能体模块
 */

import { streamChat } from '../api/client.js';
import {
  ls,
  read,
  copy,
  mkdir,
  create,
  search,
  browse,
  fetchPage,
  listApps,
  openApp,
  closeApp,
  getBasePath,
  initBrowser,
  clickElement,
  fillField,
  selectOption,
  viewChanges,
  getPageContent,
  takeScreenshot,
  closeBrowser,
  searchOnPage,
  findElements,
  searchOnEngine
} from './tools/index.js';
import { getMessages, addUserMessage, addAssistantMessage, shouldCompress, compressHistory } from './prompt.js';
import { init, println, printBlank, printBanner, printDivider, printTag, printReasoning, resetReasoningTag, closeReasoning, printContent, resetContentTag, printToolBlock, exit } from '../io/terminal.js';

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

/**
 * 解析并打印完整响应，分离正文和工具块
 */
function parseAndPrintResponse(text) {
  // 正则匹配 [TOOL] ... [/TOOL] 块
  const regex = /\[TOOL\]([\s\S]*?)\[\/TOOL\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 打印 [TOOL] 前面的普通文本
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      // 跳过 [工具结果] 和 [工具错误] 的内容
      const cleaned = before.split('\n').filter(line => 
        !line.trim().startsWith('[工具结果]:') && 
        !line.trim().startsWith('[工具错误]:')
      ).join('\n');
      if (cleaned.trim()) {
        printContent(cleaned);
      }
    }

    // 打印工具块（不显眼）
    const toolContent = match[1].trim();
    printToolBlock(`[TOOL] ${toolContent} [/TOOL]`);

    lastIndex = match.index + match[0].length;
  }

  // 打印最后剩余的普通文本
  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    // 跳过 [工具结果] 和 [工具错误] 的内容
    const cleaned = remaining.split('\n').filter(line => 
      !line.trim().startsWith('[工具结果]:') && 
      !line.trim().startsWith('[工具错误]:')
    ).join('\n');
    if (cleaned.trim()) {
      printContent(cleaned);
    }
  }
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
    case 'browse':
      // 在浏览器中打开 URL
      return await browse(args[0]);
    case 'fetchPage':
      // 抓取网页内容
      return await fetchPage(args[0]);
    case 'listApps':
      // 列出已安装软件
      return await listApps();
    case 'openApp':
      // 打开指定软件
      return await openApp(args[0]);
    case 'closeApp':
      // 关闭指定软件
      return await closeApp(args[0]);
    case 'initBrowser':
      // 初始化浏览器并打开网页
      return await initBrowser(args[0]);
    case 'clickElement':
      // 点击网页元素
      return await clickElement(args[0], args[1]);
    case 'fillField':
      // 填写表格字段
      return await fillField(args[0], args[1], args[2]);
    case 'selectOption':
      // 选择下拉框选项
      return await selectOption(args[0], args[1]);
    case 'viewChanges':
      // 查看页面变化
      return await viewChanges();
    case 'getPageContent':
      // 获取页面内容
      return await getPageContent();
    case 'takeScreenshot':
      // 截图页面
      return await takeScreenshot(args[0]);
    case 'closeBrowser':
      // 关闭浏览器
      return await closeBrowser();
    case 'searchOnPage':
      // 在页面内搜索文本内容
      return await searchOnPage(args[0], args[1]);
    case 'findElements':
      // 查找页面元素
      return await findElements(args[0], args[1]);
    case 'searchOnEngine':
      // 在搜索引擎中搜索
      return await searchOnEngine(args[0], args[1]);
    default:
      return { success: false, error: `未知工具：${tool}` };
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

    // 重置标签状态
    resetReasoningTag();
    resetContentTag();

    for await (const chunk of streamChat(messages)) {
      if (shouldStop) {
        shouldStop = false;
        printBlank();
        return;
      }
      if (chunk.reasoning) {
        printReasoning(chunk.reasoning);
      }
      if (chunk.content) {
        fullResponse += chunk.content;
      }
    }

    // 收尾：关闭思考区标签
    closeReasoning();
    resetContentTag();

    if (shouldStop) {
      shouldStop = false;
      printBlank();
      return;
    }

    // 解析并打印完整响应（分离正文和工具块）
    parseAndPrintResponse(fullResponse);

    printBlank();

    if (fullResponse.includes('[WAIT]')) {
      wantsToWait = true;
      println('[等待] 我先不说了，等你说～', 'gray');
    }

    // 循环处理所有工具调用
    const toolCalls = parseAllToolCalls(fullResponse);

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const result = await executeTool(toolCall.tool, toolCall.args);
        if (result.success) {
          // 把工具结果也显示成灰色小框
          const resultText = formatToolResult(toolCall.tool, result.data);
          printToolBlock(resultText, '工具结果');
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
  println('  活动范围: ' + printTag(getBasePath(), 'bgBlue') + '  思考间隔: ' + printTag(`${THOUGHT_INTERVAL / 1000}秒`, 'bgCyan'));
  printDivider('─', 'cyan');
  println('  按 ' + printTag('Enter', 'bgBlue') + ' 打断思考，输入 ' + printTag('exit', 'bgBlue') + ' 退出\n', 'gray');

  init(handleUserInput);

  addUserMessage('你好，我启动了');
  await thinkCycle();
  scheduleNextCycle();
}

export { start };
