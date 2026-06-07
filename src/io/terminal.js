/**
 * 命令行交互模块 - 美化版
 */

import readline from 'readline';

let rl = null;
let userInputCallback = null;

// ANSI 颜色代码
const COLORS = {
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

// 绘制方框
function drawBox(lines, width = 60) {
  const top = '╔' + '═'.repeat(width) + '╗';
  const bottom = '╚' + '═'.repeat(width) + '╝';
  const side = '║';

  console.log(top);
  for (const line of lines) {
    const padding = width - stripAnsi(line).length;
    console.log(`${side} ${line}${' '.repeat(Math.max(0, padding - 1))} ${side}`);
  }
  console.log(bottom);
}

// 去除 ANSI 码
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// 打印彩虹渐变文字（用于 ASCII art）
function rainbow(text) {
  const colors = [COLORS.red, COLORS.yellow, COLORS.green, COLORS.cyan, COLORS.blue, COLORS.magenta];
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += colors[i % colors.length] + text[i];
  }
  return result + COLORS.reset;
}

// 打印带样式的分隔线
function printDivider(char = '─', color = 'gray') {
  const width = process.stdout.columns || 80;
  const colorCode = COLORS[color] || COLORS.reset;
  console.log(colorCode + char.repeat(width) + COLORS.reset);
}

// 打印标题（带装饰）
function printTitle(text, color = 'cyan') {
  const colorCode = COLORS[color] || COLORS.reset;
  const width = process.stdout.columns || 80;
  const padding = Math.max(0, Math.floor((width - stripAnsi(text).length - 4) / 2));
  console.log();
  console.log(colorCode + '╭' + '─'.repeat(padding) + ' ' + text + ' ' + '─'.repeat(padding) + '╮' + COLORS.reset);
}

// 打印状态标签
function printTag(text, bgColor = 'bgBlue', textColor = 'white') {
  const bg = COLORS[bgColor] || COLORS.bgBlack;
  const tc = COLORS[textColor] || COLORS.white;
  return `${bg}${tc} ${text} ${COLORS.reset}`;
}

/**
 * 初始化命令行界面
 */
function init(onUserInput) {
  userInputCallback = onUserInput;

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', (input) => {
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
function print(text, color = null) {
  if (color && COLORS[color]) {
    process.stdout.write(COLORS[color] + text + COLORS.reset);
  } else {
    process.stdout.write(text);
  }
}

/**
 * 打印一行
 */
function println(text, color = null) {
  print(text, color);
  process.stdout.write('\n');
}

/**
 * 打印空行
 */
function printBlank() {
  print('\n');
}

/**
 * 打印思考内容（带标签，灰色，仅首行加标签）
 */
let reasoningTagPrinted = false;
function printReasoning(text) {
  if (!reasoningTagPrinted) {
    print('\n');
    println('┌─ 思考过程 ─────────────────────────────', 'darkGreen');
    reasoningTagPrinted = true;
  }
  print(text, 'darkGreen');
}
function resetReasoningTag() {
  reasoningTagPrinted = false;
}
function closeReasoning() {
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
function printContent(text) {
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
function resetContentTag() {
  contentTagPrinted = false;
}

/**
 * 打印工具调用块（不显眼，灰色小框）
 */
function printToolBlock(content, title = '工具调用') {
  print('\n');
  println(`  ┌─── ${title} ────────────────────────`, 'dim');
  // 给内容每一行加缩进
  const lines = content.split('\n');
  for (const line of lines) {
    println(`  │ ${line}`, 'dim');
  }
  println('  └────────────────────────────────────────', 'dim');
}

/**
 * 等待用户确认
 */
function waitForConfirm(question) {
  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * 退出
 */
function exit() {
  if (rl) {
    rl.close();
  }
  process.exit(0);
}

/**
 * 打印启动 banner
 */
function printBanner() {
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

export {
  init,
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
  waitForConfirm,
  exit,
  COLORS
};
