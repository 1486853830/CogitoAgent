import { execFile } from 'child_process';
import path from 'path';

const PROJECT_ROOT = process.cwd();

/**
 * Git 命令白名单 - 仅允许安全的 Git 子命令和选项
 */
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  'init',
  'clone',
  'add',
  'commit',
  'push',
  'pull',
  'status',
  'log',
  'branch',
  'checkout',
  'merge',
  'diff',
  'remote',
  'stash',
  'reset',
  'config',
  'fetch',
  'rebase',
]);

const ALLOWED_GIT_OPTIONS = new Set([
  '-m',
  '-a',
  '-am',
  '-v',
  '-d',
  '-D',
  '-f',
  '-force',
  '--force',
  '--soft',
  '--hard',
  '--mixed',
  '--no-pager',
  '--global',
  '--local',
  '--system',
  '-b',
  '-B',
  '-t',
  '-u',
  '--set-upstream',
  '--no-verify',
  '--only',
  '--onto',
  '-r',
  '-a',
  '-v',
  '--verbose',
  '--stat',
  '--short',
  '--name-only',
  '--oneline',
  '--graph',
  '--decorate',
  '--all',
  '-n',
  '--limit',
  '--since',
  '--until',
  '--author',
  '--grep',
  '--pickaxe',
  '-S',
  '-G',
  '-L',
  '-p',
  '-w',
  '--ignore-space-change',
  '--no-commit',
  '-n',
  '-e',
  '--edit',
  '-F',
  '--file',
  '--stash',
  '--no-stash',
  '--keep',
  '--drop',
  '-q',
  '--quiet',
  '--porcelain',
  '-z',
  '--null',
  'user.name',
  'user.email',
  'user.signingkey',
]);

/**
 * 验证 Git 参数是否安全
 * 使用白名单方式验证，防止命令注入攻击
 */
function validateGitArgs(args: any[]): boolean {
  if (!Array.isArray(args) || args.length === 0) {
    return false;
  }

  // 第一个参数必须是允许的子命令
  const subcommand = args[0];
  if (!ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
    return false;
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string') {
      return false;
    }

    // 允许的选项（以 - 开头的）
    if (arg.startsWith('-')) {
      // 允许 --no-pager 总是可用
      if (arg === '--no-pager') continue;
      // 严格白名单：必须在允许的选项集合中。
      // 此前曾有 `!arg.startsWith('--')` 豁免分支，使任何 `--xxx` 都能通过，
      // 导致 --upload-pack / --config=core.sshCommand / --receive-pack / --exec
      // 等高危选项可注入（git clone --upload-pack=calc.exe 即可 RCE）。
      // 这里要求 -- 前缀选项同样走显式白名单。
      // 对于带值的选项（形如 --opt=value），拆分后只校验选项名部分。
      const optName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      if (!ALLOWED_GIT_OPTIONS.has(optName)) {
        return false;
      }
      continue;
    }

    // 非选项参数应该是普通字符串（路径、消息等）
    // 禁止常见的注入字符
    if (/[;&|`$<>!(){}[\]\\*?\n\r]/.test(arg)) {
      return false;
    }
  }

  return true;
}

/**
 * 验证工作目录路径是否安全
 * @param cwd - 要验证的路径
 * @param allowOutsideProject - 是否允许在项目目录外操作
 * @returns {{ valid: boolean, error?: string, resolvedPath?: string }}
 */
function validateCwd(
  cwd: string,
  allowOutsideProject: boolean = false,
): { valid: boolean; error?: string; resolvedPath?: string } {
  // 如果是默认的 process.cwd()，直接允许
  if (!cwd || cwd === process.cwd()) {
    return { valid: true, resolvedPath: process.cwd() };
  }

  // 检查是否包含危险字符
  const dangerousPattern = /[;&|`$<>!(){}[\]\\*\?\n\r'""]/;
  if (dangerousPattern.test(cwd)) {
    return {
      valid: false,
      error: `工作目录路径包含危险字符: ${cwd}`,
    };
  }

  // 解析为绝对路径
  let absolutePath: string;
  try {
    absolutePath = path.isAbsolute(cwd) ? path.normalize(cwd) : path.resolve(PROJECT_ROOT, cwd);
  } catch (e) {
    return {
      valid: false,
      error: `无效的路径: ${cwd}`,
    };
  }

  // 规范化路径
  absolutePath = path.normalize(absolutePath);

  // 检查路径遍历攻击
  if (absolutePath.includes('..')) {
    return {
      valid: false,
      error: `不允许路径遍历: ${cwd}`,
    };
  }

  // 如果不允许在项目目录外，检查是否在项目目录下
  if (!allowOutsideProject) {
    const normalizedRoot = path.normalize(PROJECT_ROOT);
    // 必须使用路径分隔符边界校验，避免兄弟目录前缀绕过：
    // 若仅用 startsWith，PROJECT_ROOT=/proj 会放行 /proj-evil。
    if (absolutePath !== normalizedRoot && !absolutePath.startsWith(normalizedRoot + path.sep)) {
      return {
        valid: false,
        error: `工作目录必须在项目目录下: ${PROJECT_ROOT}`,
      };
    }
  }

  return { valid: true, resolvedPath: absolutePath };
}

/**
 * 执行 Git 命令
 * 使用 --no-pager 防止命令注入
 */
function gitCommand(args: string[], cwd: string = process.cwd()): Promise<any> {
  return new Promise((resolve) => {
    // 验证参数
    if (!validateGitArgs(args)) {
      resolve({
        success: false,
        error: 'Git 命令参数包含危险字符或不允许的操作，操作已拒绝',
      });
      return;
    }

    // 验证工作目录
    const cwdValidation = validateCwd(cwd);
    if (!cwdValidation.valid) {
      resolve({
        success: false,
        error: `工作目录验证失败: ${cwdValidation.error}`,
      });
      return;
    }

    // 使用 --no-pager 防止通过 git 命令注入
    const safeArgs = ['--no-pager', ...args];

    execFile(
      'git',
      safeArgs,
      {
        cwd: cwdValidation.resolvedPath,
        timeout: 30000,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: `Git 命令执行失败: ${error.message}\n${stderr || ''}`,
          });
        } else {
          resolve({
            success: true,
            data: stdout.trim() || '操作成功',
          });
        }
      },
    );
  });
}

/**
 * 初始化 Git 仓库
 */
async function gitInit(cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['init'], cwd);
}

/**
 * 克隆仓库
 */
async function gitClone(
  url: string,
  dest: string = '.',
  cwd: string = process.cwd(),
): Promise<any> {
  return await gitCommand(['clone', url, dest], cwd);
}

/**
 * 添加文件
 */
async function gitAdd(files: string = '.', cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['add', files], cwd);
}

/**
 * 提交变更
 */
async function gitCommit(message: string, cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['commit', '-m', message], cwd);
}

/**
 * 推送变更
 */
async function gitPush(
  remote: string = 'origin',
  branch: string = 'main',
  cwd: string = process.cwd(),
): Promise<any> {
  return await gitCommand(['push', remote, branch], cwd);
}

/**
 * 拉取变更
 */
async function gitPull(
  remote: string = 'origin',
  branch: string = 'main',
  cwd: string = process.cwd(),
): Promise<any> {
  return await gitCommand(['pull', remote, branch], cwd);
}

/**
 * 查看状态
 */
async function gitStatus(cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['status'], cwd);
}

/**
 * 查看日志
 */
async function gitLog(options: string = '', cwd: string = process.cwd()): Promise<any> {
  const args = ['log'];
  if (options) {
    args.push(...options.split(' '));
  }
  return await gitCommand(args, cwd);
}

/**
 * 创建分支
 */
async function gitBranchCreate(name: string, cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['branch', name], cwd);
}

/**
 * 切换分支
 */
async function gitCheckout(name: string, cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['checkout', name], cwd);
}

/**
 * 创建并切换分支
 */
async function gitCheckoutNew(name: string, cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['checkout', '-b', name], cwd);
}

/**
 * 删除分支
 */
async function gitBranchDelete(name: string, cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['branch', '-D', name], cwd);
}

/**
 * 查看分支列表
 */
async function gitBranchList(cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['branch', '-a'], cwd);
}

/**
 * 合并分支
 */
async function gitMerge(branch: string, cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['merge', branch], cwd);
}

/**
 * 查看差异
 */
async function gitDiff(options: string = '', cwd: string = process.cwd()): Promise<any> {
  const args = ['diff'];
  if (options) {
    args.push(...options.split(' '));
  }
  return await gitCommand(args, cwd);
}

/**
 * 添加远程仓库
 */
async function gitRemoteAdd(name: string, url: string, cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['remote', 'add', name, url], cwd);
}

/**
 * 查看远程仓库
 */
async function gitRemoteList(cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['remote', '-v'], cwd);
}

/**
 * 设置用户信息
 */
async function gitConfigUser(
  name: string,
  email: string,
  cwd: string = process.cwd(),
): Promise<any> {
  await gitCommand(['config', 'user.name', name], cwd);
  return await gitCommand(['config', 'user.email', email], cwd);
}

/**
 * 撤销未提交的更改
 */
async function gitReset(options: string = '--hard', cwd: string = process.cwd()): Promise<any> {
  // 白名单验证：只允许安全的 reset 选项
  const ALLOWED_RESET_OPTIONS = ['--hard', '--soft', '--mixed', '--keep', '--merge'];
  const safeOptions = options.split(' ').filter((opt) => ALLOWED_RESET_OPTIONS.includes(opt));

  if (safeOptions.length === 0) {
    return {
      success: false,
      error: `无效的 git reset 选项: ${options}，只允许: ${ALLOWED_RESET_OPTIONS.join(', ')}`,
    };
  }

  const args = ['reset', ...safeOptions];
  return await gitCommand(args, cwd);
}

/**
 * 暂存文件
 */
async function gitStash(cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['stash'], cwd);
}

/**
 * 恢复暂存
 */
async function gitStashPop(cwd: string = process.cwd()): Promise<any> {
  return await gitCommand(['stash', 'pop'], cwd);
}

export {
  gitInit,
  gitClone,
  gitAdd,
  gitCommit,
  gitPush,
  gitPull,
  gitStatus,
  gitLog,
  gitBranchCreate,
  gitBranchDelete,
  gitBranchList,
  gitCheckout,
  gitCheckoutNew,
  gitMerge,
  gitDiff,
  gitRemoteAdd,
  gitRemoteList,
  gitConfigUser,
  gitReset,
  gitStash,
  gitStashPop,
};
