/**
 * 命令行交互模块 - 美化版
 */

import readline from 'readline';
import process from 'process';

let rl: readline.Interface | null = null;
let userInputCallback: ((input: string) => void) | null = null;
let cleanupCallback: (() => void | Promise<void>) | null = null; // 清理回调

// ANSI 颜色代码
const COLORS: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  red: '\x1b[91m',
  green: '\x1b[92m',
  darkGreen: '\x1b[32m',
  yellow: '\x1b[93m',
  blue: '\x1b[94m',
  magenta: '\x1b[95m',
  cyan: '\x1b[96m',
  white: '\x1b[97m',
  // 渐变相关
  bgBlack: '\x1b[40m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

// 去除 ANSI 码
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// 打印彩虹渐变文字（用于 ASCII art）
function rainbow(text: string): string {
  const colors = [
    COLORS.red,
    COLORS.yellow,
    COLORS.green,
    COLORS.cyan,
    COLORS.blue,
    COLORS.magenta,
  ];
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += colors[i % colors.length] + text[i];
  }
  return result + COLORS.reset;
}

// 打印带样式的分隔线
function printDivider(char = '─', color: string | null = 'gray'): void {
  const width = process.stdout.columns || 80;
  const colorCode = COLORS[color as string] || COLORS.reset;
  console.log(colorCode + char.repeat(width) + COLORS.reset);
}

// 打印标题（带装饰）
function printTitle(text: string, color: string | null = 'cyan'): void {
  const colorCode = COLORS[color as string] || COLORS.reset;
  const width = process.stdout.columns || 80;
  const padding = Math.max(0, Math.floor((width - stripAnsi(text).length - 4) / 2));
  console.log();
  console.log(
    colorCode +
      '╭' +
      '─'.repeat(padding) +
      ' ' +
      text +
      ' ' +
      '─'.repeat(padding) +
      '╮' +
      COLORS.reset,
  );
}

// 打印状态标签
function printTag(
  text: string,
  bgColor: string | null = 'bgBlue',
  textColor: string | null = 'white',
): string {
  const bg = COLORS[bgColor as string] || COLORS.bgBlack;
  const tc = COLORS[textColor as string] || COLORS.white;
  return `${bg}${tc} ${text} ${COLORS.reset}`;
}

/**
 * 初始化命令行界面
 */
function init(onUserInput: (input: string) => void): void {
  userInputCallback = onUserInput;

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // 在 Pipe 模式（Electron 子进程）下保持 stdin 流动，防止事件循环退出
  if (typeof process.stdin.isTTY === 'undefined' || !process.stdin.isTTY) {
    process.stdin.resume();
  }

  rl.on('line', (input: string) => {
    if (userInputCallback) {
      userInputCallback(input.trim());
    }
  });

  rl.setPrompt('');
  rl.prompt();
}

/**
 * 输出文字到终端（支持颜色）
 */
function print(text: string, color: string | null = null): void {
  if (color && COLORS[color]) {
    process.stdout.write(COLORS[color] + text + COLORS.reset);
  } else {
    process.stdout.write(text);
  }
}

/**
 * 打印一行
 */
function println(text: string, color: string | null = null): void {
  print(text, color);
  process.stdout.write('\n');
}

/**
 * 打印空行
 */
function printBlank(): void {
  print('\n');
}

/**
 * 打印思考内容（带标签，灰色，仅首行加标签）
 */
let reasoningTagPrinted = false;
function printReasoning(text: string): void {
  if (!reasoningTagPrinted) {
    print('\n');
    println('┌─ 思考过程 ─────────────────────────────', 'darkGreen');
    reasoningTagPrinted = true;
  }
  print(text, 'darkGreen');
}
function resetReasoningTag(): void {
  reasoningTagPrinted = false;
}
function closeReasoning(): void {
  if (reasoningTagPrinted) {
    print('\n');
    println('└──────────────────────────────────────────', 'darkGreen');
    reasoningTagPrinted = false;
  }
}

/**
 * 打印正文内容（带标签，正常颜色，仅首行加标签）
 */
let contentTagPrinted = false;
function printContent(text: string): void {
  if (!contentTagPrinted) {
    // 如果之前有思考内容，先收尾
    if (reasoningTagPrinted) {
      print('\n');
      println('└──────────────────────────────────────────', 'dim');
      resetReasoningTag();
    }
    print('\n');
    println('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    println('           ▼ 回复内容 ▼', 'bold');
    println('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    contentTagPrinted = true;
  }
  print(text);
}
function resetContentTag(): void {
  contentTagPrinted = false;
}

/**
 * 打印工具调用块（简洁标签样式）
 */
function printToolBlock(content: string, title = '工具调用'): void {
  if (title === '工具结果') {
    // 工具结果显示
    print('\n');
    println('┌─ 工具结果 ─────────────────────────────', 'green');
    print(content, 'green');
    println('\n└──────────────────────────────────────────', 'green');
  } else {
    // 工具调用显示
    const match = content.match(/\[TOOL\]\s*(\w+)/);
    const toolName = match ? match[1] : '未知工具';

    print('  ');
    print(`${COLORS.bgCyan}${COLORS.white} 调用：${toolName} ${COLORS.reset}`, 'cyan');
    print('\n');
  }
}

/**
 * 退出
 */
async function exit(): Promise<void> {
  console.log('\n正在清理资源...');

  // 调用清理回调
  if (cleanupCallback) {
    try {
      // 加超时兜底：清理回调挂起会导致 exit 永久阻塞
      await Promise.race([cleanupCallback(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    } catch (e) {
      console.error('清理失败:', (e as Error).message);
    }
  }

  // 关闭 readline
  if (rl) {
    rl.close();
  }

  // 延迟退出，确保日志输出
  setTimeout(() => {
    process.exit(0);
  }, 100);
}

/**
 * 注册清理回调
 */
function onCleanup(callback: () => void | Promise<void>): void {
  cleanupCallback = callback;
}

/**
 * 打印启动 banner
 */
function printBanner(): void {
  const banner = `
${COLORS.cyan}${COLORS.bold}
██████╗  ██████╗  ██████╗ ██╗████████╗ ██████╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗
██╔═══╝  ██╔═══██╗██╔═══╝  ██║╚══██╔═╝ ██╔═══██╗    ██╔══██╗██╔═══╝  ██╔═══╝ ████╗  ██║╚══██╔═╝
██║      ██║   ██║██║  ███╗██║   ██║   ██║   ██║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
██║      ██║   ██║██║   ██║██║   ██║   ██║   ██║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
╚██████╗ ╚██████╔╝╚██████╔╝██║   ██║   ╚██████╔╝    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
 ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝   ╚═╝    ╚═════╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
${COLORS.reset}
${COLORS.cyan}${COLORS.bold}            CogitoAgent${COLORS.reset}
${COLORS.bold}╔══════════════════════════════════════════════════════════════╗
║  持续思考的智能体 - 探索文件 · 联网搜索 · 自主学习           ║
╚══════════════════════════════════════════════════════════════╝${COLORS.reset}
`;
  console.log(banner);
}

function showPrompt(): void {
  if (rl) {
    rl.prompt();
  }
}

export {
  init,
  showPrompt,
  print,
  println,
  printBlank,
  printDivider,
  printTitle,
  printTag,
  printBanner,
  printReasoning,
  resetReasoningTag,
  closeReasoning,
  printContent,
  resetContentTag,
  printToolBlock,
  rainbow,
  exit,
  onCleanup,
  COLORS,
};
