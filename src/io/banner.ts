/* ============================================================
 *  Banner - Neofetch 风格启动横幅
 *  在终端打印 ASCII logo + 系统信息表
 *
 *  使用方式(在 src/index.ts 启动时):
 *    import { printBanner } from './io/banner.ts';
 *    printBanner({ version, persona, workspace, sessions, tools });
 * ============================================================ */

import os from 'os';
import { TOOL_CATEGORIES } from '../agent/registry.ts';

interface BannerInfo {
  version?: string;
  persona?: string;
  workspace?: string;
  sessions?: number;
  tools?: number;
  mode?: string;
}

// ANSI 颜色码
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  phosphor: '\x1b[38;2;94;234;212m',  // #5eead4
  amber: '\x1b[38;2;251;191;36m',     // #fbbf24
  silver: '\x1b[38;2;196;205;217m',   // #c4cdd9
  silverDim: '\x1b[38;2;139;149;165m', // #8b95a5
  crimson: '\x1b[38;2;248;113;113m',  // #f87171
  bg: '\x1b[48;2;11;14;20m',
  bold: '\x1b[1m',
};

// ASCII Logo (简化版 CogitoAgent)
const LOGO = [
  '  ████████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗',
  '  ╚══██╔══╝██╔═══██╗██╔═══██╗██║ ██╔╝██║   ██║',
  '     ██║   ██║   ██║██║   ██║█████╔╝ ██║   ██║',
  '     ██║   ██║   ██║██║   ██║██╔═██╗ ██║   ██║',
  '     ██║   ╚██████╔╝╚██████╔╝██║  ██╗╚██████╔╝',
  '     ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ',
];

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

function pad(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

const startTime = Date.now();

/**
 * 打印 Neofetch 风格的启动横幅
 */
function printBanner(info: BannerInfo = {}): void {
  const version = info.version || '2.3.2';
  const persona = info.persona || 'Assistant';
  const workspace = info.workspace || process.cwd();
  const sessions = info.sessions ?? 0;
  const tools = info.tools ?? Object.keys(TOOL_CATEGORIES).length;
  const mode = info.mode || 'CLI';

  const platform = process.platform;
  const arch = process.arch;
  const hostname = os.hostname();
  const nodeVersion = process.version;
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.split(' @')[0] : 'Unknown';
  const cpuCores = cpus.length;
  const totalMem = os.totalmem();
  const memGb = (totalMem / 1024 / 1024 / 1024).toFixed(1);
  const uptime = fmtDuration(Date.now() - startTime);

  const kv = (k: string, v: string): string =>
    `${C.phosphor}${C.bold}${pad(k, 10)}${C.reset}${C.silverDim}:${C.reset} ${C.silver}${v}${C.reset}`;

  const infoLines = [
    kv('OS', `${platform} ${arch}`),
    kv('HOST', hostname),
    kv('KERNEL', `Node ${nodeVersion}`),
    kv('UPTIME', uptime),
    kv('CPU', `${cpuModel} (${cpuCores} cores)`),
    kv('MEMORY', `${memGb} GB`),
    '',
    kv('VERSION', `v${version}`),
    kv('MODE', mode),
    kv('PERSONA', persona),
    kv('SESSIONS', String(sessions)),
    kv('TOOLS', `${tools} categories`),
    '',
    kv('WORKSPACE', workspace.length > 40 ? '...' + workspace.slice(-37) : workspace),
  ];

  const maxLogoLines = LOGO.length;
  const maxInfoLines = infoLines.length;
  const maxLines = Math.max(maxLogoLines, maxInfoLines);

  const lines: string[] = [];
  lines.push('');

  for (let i = 0; i < maxLines; i++) {
    const logo = i < maxLogoLines ? `${C.phosphor}${LOGO[i]}${C.reset}` : '';
    const info = i < maxInfoLines ? `   ${infoLines[i] || ''}` : '';
    lines.push(logo + info);
  }

  lines.push('');
  lines.push(
    `${C.silverDim}  ${'─'.repeat(56)}${C.reset}`
  );
  lines.push(
    `${C.phosphor}  ▸ Cogito, ergo sum${C.reset} ${C.silverDim}| Continuous thinking · Local execution · Privacy first${C.reset}`
  );
  lines.push('');

  // 一次性输出
  process.stdout.write(lines.join('\n') + '\n');
}

export { printBanner };
