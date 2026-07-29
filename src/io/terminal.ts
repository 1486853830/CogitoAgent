import readline from 'readline';
import process from 'process';

let rl: readline.Interface | null = null;
let userInputCallback: ((input: string) => void) | null = null;
let cleanupCallback: (() => void | Promise<void>) | null = null;

const COLORS: Record<string, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  claude: '\x1b[38;2;91;206;250m',
  claudeBright: '\x1b[38;2;135;220;255m',
  claudeDim: '\x1b[38;2;60;170;220m',
  permission: '\x1b[38;5;99m',
  permissionBg: '\x1b[48;5;99m',
  gray: '\x1b[90m',
  dimGray: '\x1b[38;5;250m',
  red: '\x1b[91m',
  green: '\x1b[92m',
  darkGreen: '\x1b[32m',
  yellow: '\x1b[93m',
  blue: '\x1b[94m',
  magenta: '\x1b[95m',
  cyan: '\x1b[96m',
  white: '\x1b[97m',
  success: '\x1b[38;5;113m',
  error: '\x1b[38;5;204m',
  warning: '\x1b[38;5;220m',
  info: '\x1b[38;2;91;206;250m',
  bgBlack: '\x1b[40m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  bgClaude: '\x1b[48;2;91;206;250m',
  bgSuccess: '\x1b[48;5;113m',
  bgError: '\x1b[48;5;204m',
  bgGray: '\x1b[48;5;240m',
  bgGreen: '\x1b[48;5;28m',
  bgRed: '\x1b[48;5;160m',
  bgYellow: '\x1b[48;5;176m',
};

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function printDivider(char = '', color: string | null = null): void {
  if (!char) {
    process.stdout.write('\n');
    return;
  }
  const width = process.stdout.columns || 80;
  const colorCode = color && COLORS[color] ? COLORS[color] : '';
  process.stdout.write(colorCode + char.repeat(width) + COLORS.reset + '\n');
}

function printTitle(text: string, color: string | null = 'claude'): void {
  const colorCode = COLORS[color as string] || COLORS.reset;
  process.stdout.write('\n' + colorCode + COLORS.bold + text + COLORS.reset + '\n\n');
}

function printTag(
  text: string,
  bgColor: string | null = null,
  textColor: string | null = null,
): string {
  const tc = textColor && COLORS[textColor] ? COLORS[textColor] : COLORS.claude;
  return `${tc}${COLORS.bold}${text}${COLORS.reset}`;
}

let inputState: 'idle' | 'thinking' | 'waiting' = 'idle';

function printInputPrompt(): void {
  if (rl) {
    process.stdout.write('> ');
    rl.setPrompt('> ');
  } else {
    process.stdout.write('> ');
  }
}

function setInputState(state: 'idle' | 'thinking' | 'waiting'): void {
  inputState = state;
}

function init(onUserInput: (input: string) => void): void {
  userInputCallback = onUserInput;

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (typeof process.stdin.isTTY === 'undefined' || !process.stdin.isTTY) {
    process.stdin.resume();
  }

  rl.on('line', (input: string) => {
    if (userInputCallback) {
      if (input.trim()) {
        process.stdout.write('\n');
      }
      userInputCallback(input.trim());
    }
  });
}

function print(text: string, color: string | null = null): void {
  if (color && COLORS[color]) {
    process.stdout.write(COLORS[color] + text + COLORS.reset);
  } else {
    process.stdout.write(text);
  }
}

function println(text: string, color: string | null = null): void {
  print(text, color);
  process.stdout.write('\n');
}

function printBlank(): void {
  process.stdout.write('\n');
}

let reasoningTagPrinted = false;
function printReasoning(text: string): void {
  if (!reasoningTagPrinted) {
    reasoningTagPrinted = true;
  }
  print(text, 'dimGray');
}
function resetReasoningTag(): void {
  reasoningTagPrinted = false;
}
function closeReasoning(): void {
  if (reasoningTagPrinted) {
    reasoningTagPrinted = false;
  }
}

let contentTagPrinted = false;
function printContent(text: string): void {
  if (!contentTagPrinted) {
    if (reasoningTagPrinted) {
      closeReasoning();
    }
    contentTagPrinted = true;
  }
  print(text);
}
function resetContentTag(): void {
  contentTagPrinted = false;
}

function printToolBlock(content: string, title = 'tool'): void {
  const match = content.match(/\[TOOL\]\s*(\w+)/);
  const toolName = match ? match[1] : 'unknown';

  if (title === '工具结果') {
    const resultLines = content.split('\n');
    for (const line of resultLines) {
      const cleanedLine = line.replace(/\[TOOL\]\s*\w+\s*\[\/TOOL\]/, '').trim();
      if (cleanedLine) {
        process.stdout.write(COLORS.gray + '  ' + cleanedLine + COLORS.reset + '\n');
      }
    }
  } else {
    process.stdout.write(COLORS.claude + '  ' + '•' + ' ' + toolName + COLORS.reset + '\n');
  }
}

function waitForConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl!.question(`${question} (yes/no): `, (answer) => {
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function exit(): Promise<void> {
  process.stdout.write('\n正在清理资源...\n');

  if (cleanupCallback) {
    try {
      await cleanupCallback();
    } catch (e) {
      console.error('清理失败:', (e as Error).message);
    }
  }

  if (rl) {
    rl.close();
  }

  setTimeout(() => {
    process.exit(0);
  }, 100);
}

function onCleanup(callback: () => void | Promise<void>): void {
  cleanupCallback = callback;
}

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
  process.stdout.write(banner);
  process.stdout.write(`${COLORS.dim}v2.3.2${COLORS.reset}\n`);
}

function setStatusBar(text: string): void {
  const width = process.stdout.columns || 80;
  process.stdout.write('\r\x1b[K');
  const truncated = text.length > width - 2 ? text.slice(0, width - 5) + '...' : text;
  process.stdout.write(COLORS.gray + truncated + COLORS.reset);
}

function startSpinner(text = '思考中'): void {
  process.stdout.write(COLORS.dim + '  ' + text + '...' + COLORS.reset + '\n');
}

function stopSpinner(): void {
}

async function typewriterEffect(text: string, delay = 10): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

function printProgressBar(progress: number, width = 30): void {
  const filled = Math.round(width * progress);
  const empty = width - filled;
  const bar = `${COLORS.claude}█${COLORS.reset}`.repeat(filled) + '░'.repeat(empty);
  process.stdout.write(`\r[${bar}] ${Math.round(progress * 100)}%`);
}

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

export {
  init,
  print,
  println,
  printBlank,
  printDivider,
  printTitle,
  printTag,
  printBanner,
  setStatusBar,
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
