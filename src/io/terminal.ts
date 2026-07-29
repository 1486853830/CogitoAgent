/**
 * 命令行交互模块 - 美化版
 */

import readline from 'readline';
import process from 'process';

let rl: readline.Interface | null = null;
let userInputCallback: ((input: string) => void) | null = null;
let cleanupCallback: (() => void | Promise<void>) | null = null; // 清理回调

// ANSI 颜色代码（主题色：浅蓝 #5BCEFA）
const COLORS: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // 主题色系：浅蓝 rgb(91,206,250)
  claude: '\x1b[38;2;91;206;250m',
  claudeBright: '\x1b[38;2;135;220;255m',
  claudeDim: '\x1b[38;2;60;170;220m',
  permission: '\x1b[38;5;99m',    // 紫色（权限请求）
  permissionBg: '\x1b[48;5;99m',  // 紫色背景
  // 基础颜色
  gray: '\x1b[90m',
  dimGray: '\x1b[37m',
  red: '\x1b[91m',
  green: '\x1b[92m',
  darkGreen: '\x1b[32m',
  yellow: '\x1b[93m',
  blue: '\x1b[94m',
  magenta: '\x1b[95m',
  cyan: '\x1b[96m',
  white: '\x1b[97m',
  // 语义颜色
  success: '\x1b[38;5;113m',     // 成功绿 rgb(78,186,101)
  error: '\x1b[38;5;204m',       // 错误红 rgb(255,107,128)
  warning: '\x1b[38;5;220m',     // 警告黄 rgb(255,193,7)
  info: '\x1b[38;2;91;206;250m', // 信息蓝（主题色）
  // 背景色
  bgBlack: '\x1b[40m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  bgClaude: '\x1b[48;2;91;206;250m', // 主题背景
  bgSuccess: '\x1b[48;5;113m',
  bgError: '\x1b[48;5;204m',
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
function printDivider(char = '─', color: string | null = 'claude'): void {
  const width = process.stdout.columns || 80;
  const colorCode = COLORS[color as string] || COLORS.reset;
  console.log(colorCode + char.repeat(width) + COLORS.reset);
}

// 打印标题（带装饰，Claude风格）
function printTitle(text: string, color: string | null = 'claude'): void {
  const colorCode = COLORS[color as string] || COLORS.reset;
  const width = process.stdout.columns || 80;
  const padding = Math.max(0, Math.floor((width - stripAnsi(text).length - 4) / 2));
  console.log();
  console.log(
    colorCode +
      '╭' +
      '─'.repeat(padding) +
      ' ' +
      COLORS.bold +
      text +
      COLORS.reset +
      colorCode +
      ' ' +
      '─'.repeat(padding) +
      '╮' +
      COLORS.reset,
  );
}

// 打印状态标签（Claude风格）
function printTag(
  text: string,
  bgColor: string | null = 'bgClaude',
  textColor: string | null = 'white',
): string {
  const bg = COLORS[bgColor as string] || COLORS.bgBlack;
  const tc = COLORS[textColor as string] || COLORS.white;
  return `${COLORS.bold}${bg}${tc} ${text} ${COLORS.reset}`;
}

/**
 * 输入框状态
 */
let inputState: 'idle' | 'thinking' | 'waiting' = 'idle';

/**
 * 打印输入框提示符
 * 用 process.stdout.write 同步写出，确保 Windows 上立即可见；
 * 同时设置 readline 的 prompt 供后续重绘（resize、退格等）使用。
 */
function printInputPrompt(): void {
  const stateIcon = inputState === 'thinking' ? '⚙' :
                    inputState === 'waiting' ? '⏳' : '💬';
  const stateText = inputState === 'thinking' ? '思考中' :
                    inputState === 'waiting' ? '等待中' : '输入';

  // 边框顶部行
  println(`${COLORS.claude}┌─${COLORS.reset} ${COLORS.bold}${stateIcon} ${stateText}${COLORS.reset} ${COLORS.claude}───────────────────────────────────${COLORS.reset}`, 'claude');
  // 直接写入提示符到 stdout（同步、立即刷新），不依赖 rl.prompt()
  if (rl) {
    process.stdout.write('│ ❯ ');
    rl.setPrompt('│ ❯ ');
  } else {
    process.stdout.write('│ ❯ ');
  }
}

/**
 * 设置输入状态
 */
function setInputState(state: 'idle' | 'thinking' | 'waiting'): void {
  inputState = state;
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
      // 输入后显示结束边框
      if (input.trim()) {
        println(`${COLORS.claude}└${COLORS.reset}`, 'claude');
        printBlank();
      }
      userInputCallback(input.trim());
    }
  });

  // 注意：不在 init() 内部调用 printInputPrompt()，
  // 由调用方在所有输出完成后显式调用一次，确保提示符是最后显示的内容
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
 * 打印思考内容（带标签，Claude风格）
 */
let reasoningTagPrinted = false;
function printReasoning(text: string): void {
  if (!reasoningTagPrinted) {
    print('\n');
    println(`${COLORS.claude}┌─${COLORS.claudeDim} 💭 思考过程 ${COLORS.claude}──────────────────────────${COLORS.reset}`, 'claude');
    reasoningTagPrinted = true;
  }
  print(text, 'claudeDim');
}
function resetReasoningTag(): void {
  reasoningTagPrinted = false;
}
function closeReasoning(): void {
  if (reasoningTagPrinted) {
    print('\n');
    println(`${COLORS.claude}└──────────────────────────────────────────────${COLORS.reset}`, 'claude');
    reasoningTagPrinted = false;
  }
}

/**
 * 打印正文内容（带标签，Claude风格）
 */
let contentTagPrinted = false;
function printContent(text: string): void {
  if (!contentTagPrinted) {
    // 如果之前有思考内容，先收尾
    if (reasoningTagPrinted) {
      closeReasoning();
    }
    print('\n');
    contentTagPrinted = true;
  }
  print(text);
}
function resetContentTag(): void {
  contentTagPrinted = false;
}

/**
 * 打印工具调用块（Claude风格）
 */
function printToolBlock(content: string, title = '工具调用'): void {
  if (title === '工具结果') {
    // 工具结果显示（Claude风格）
    print('\n');
    println(`${COLORS.success}┌─${COLORS.reset} ${COLORS.bold}✓ 工具结果${COLORS.reset} ${COLORS.success}──────────────────────────${COLORS.reset}`, 'success');
    print(content, 'success');
    println(`\n${COLORS.success}└──────────────────────────────────────────────${COLORS.reset}`, 'success');
  } else {
    // 工具调用显示（Claude风格）
    const match = content.match(/\[TOOL\]\s*(\w+)/);
    const toolName = match ? match[1] : '未知工具';

    print('\n');
    println(`${COLORS.claude}┌─${COLORS.reset} ${COLORS.bold}⚙ 工具调用${COLORS.reset}`, 'claude');
    print(`${COLORS.claude}│${COLORS.reset}  `);
    println(`${COLORS.bgClaude}${COLORS.white} ${toolName} ${COLORS.reset}`, 'claude');
    println(`${COLORS.claude}└${COLORS.reset}`, 'claude');
  }
}

/**
 * 等待用户确认
 */
function waitForConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl!.question(`${question} (yes/no): `, (answer) => {
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * 退出
 */
async function exit(): Promise<void> {
  console.log('\n正在清理资源...');

  // 调用清理回调
  if (cleanupCallback) {
    try {
      await cleanupCallback();
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
 * 打印启动 banner（Claude风格）
 */
function printBanner(): void {
  const banner = `
${COLORS.claudeBright}${COLORS.bold}
   ██████╗ ██████╗  ██████╗ ██╗████████╗ ██████╗ 
  ██╔════╝██╔═══██╗██╔════╝ ██║╚══██╔══╝██╔═══██╗
  ██║     ██║   ██║██║  ███╗██║   ██║   ██║   ██║
  ██║     ██║   ██║██║   ██║██║   ██║   ██║   ██║
  ╚██████╗╚██████╔╝╚██████╔╝██║   ██║   ╚██████╔╝
   ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝   ╚═╝    ╚═════╝ 
${COLORS.reset}
`;
  console.log(banner);
}

/**
 * 加载动画帧
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 开始加载动画
 */
function startSpinner(text = '思考中'): void {
  if (spinnerInterval) return;
  
  let frameIndex = 0;
  const stream = process.stdout;
  
  spinnerInterval = setInterval(() => {
    const frame = SPINNER_FRAMES[frameIndex];
    stream.write(`\r${COLORS.claude}${frame}${COLORS.reset} ${COLORS.dimGray}${text}...${COLORS.reset}`);
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
  }, 80);
}

/**
 * 停止加载动画
 */
function stopSpinner(): void {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write('\r' + ' '.repeat(50) + '\r'); // 清除动画行
  }
}

/**
 * 打字机效果输出
 */
async function typewriterEffect(text: string, delay = 10): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * 打印加载进度条
 */
function printProgressBar(progress: number, width = 30): void {
  const filled = Math.round(width * progress);
  const empty = width - filled;
  const bar = `${COLORS.claude}█${COLORS.reset}`.repeat(filled) + '░'.repeat(empty);
  process.stdout.write(`\r[${bar}] ${Math.round(progress * 100)}%`);
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
  onCleanup,
  COLORS,
  startSpinner,
  stopSpinner,
  typewriterEffect,
  printProgressBar,
  printInputPrompt,
  setInputState,
};
