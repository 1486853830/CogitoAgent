import { execFile } from 'child_process';

/**
 * Git 命令白名单 - 仅允许安全的 Git 子命令和选项
 */
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  'init', 'clone', 'add', 'commit', 'push', 'pull', 'status', 'log',
  'branch', 'checkout', 'merge', 'diff', 'remote', 'stash', 'reset', 'config', 'fetch', 'rebase'
]);

const ALLOWED_GIT_OPTIONS = new Set([
  '-m', '-a', '-am', '-v', '-d', '-D', '-f', '-force', '--force',
  '--soft', '--hard', '--mixed', '--no-pager',
  '--global', '--local', '--system',
  '-b', '-B', '-t', '-u', '--set-upstream',
  '--no-verify', '--only', '--onto',
  '-r', '-a', '-v', '--verbose', '--stat', '--short', '--name-only',
  '--oneline', '--graph', '--decorate', '--all', '-n', '--limit',
  '--since', '--until', '--author', '--grep', '--pickaxe',
  '-S', '-G', '-L', '-p', '-w', '--ignore-space-change',
  '--no-commit', '-n', '-e', '--edit', '-F', '--file',
  '--stash', '--no-stash', '--keep', '--drop',
  '-q', '--quiet', '--porcelain', '-z', '--null',
  'user.name', 'user.email', 'user.signingkey'
]);

/**
 * 验证 Git 参数是否安全
 * 使用白名单方式验证，防止命令注入攻击
 */
function validateGitArgs(args) {
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
      // 检查是否是允许的选项
      if (!ALLOWED_GIT_OPTIONS.has(arg) && !arg.startsWith('--')) {
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
 * 执行 Git 命令
 * 使用 --no-pager 防止命令注入
 */
function gitCommand(args, cwd = process.cwd()) {
  return new Promise((resolve) => {
    if (!validateGitArgs(args)) {
      resolve({
        success: false,
        error: 'Git 命令参数包含危险字符或不允许的操作，操作已拒绝'
      });
      return;
    }

    // 使用 --no-pager 防止通过 git 命令注入
    const safeArgs = ['--no-pager', ...args];

    execFile('git', safeArgs, {
      cwd: cwd,
      timeout: 30000,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          success: false,
          error: `Git 命令执行失败: ${error.message}\n${stderr || ''}`
        });
      } else {
        resolve({
          success: true,
          data: stdout.trim() || '操作成功'
        });
      }
    });
  });
}

/**
 * 初始化 Git 仓库
 */
async function gitInit(cwd = process.cwd()) {
  return await gitCommand(['init'], cwd);
}

/**
 * 克隆仓库
 */
async function gitClone(url, dest = '.', cwd = process.cwd()) {
  return await gitCommand(['clone', url, dest], cwd);
}

/**
 * 添加文件
 */
async function gitAdd(files = '.', cwd = process.cwd()) {
  return await gitCommand(['add', files], cwd);
}

/**
 * 提交变更
 */
async function gitCommit(message, cwd = process.cwd()) {
  return await gitCommand(['commit', '-m', message], cwd);
}

/**
 * 推送变更
 */
async function gitPush(remote = 'origin', branch = 'main', cwd = process.cwd()) {
  return await gitCommand(['push', remote, branch], cwd);
}

/**
 * 拉取变更
 */
async function gitPull(remote = 'origin', branch = 'main', cwd = process.cwd()) {
  return await gitCommand(['pull', remote, branch], cwd);
}

/**
 * 查看状态
 */
async function gitStatus(cwd = process.cwd()) {
  return await gitCommand(['status'], cwd);
}

/**
 * 查看日志
 */
async function gitLog(options = '', cwd = process.cwd()) {
  const args = ['log'];
  if (options) {
    args.push(...options.split(' '));
  }
  return await gitCommand(args, cwd);
}

/**
 * 创建分支
 */
async function gitBranchCreate(name, cwd = process.cwd()) {
  return await gitCommand(['branch', name], cwd);
}

/**
 * 切换分支
 */
async function gitCheckout(name, cwd = process.cwd()) {
  return await gitCommand(['checkout', name], cwd);
}

/**
 * 创建并切换分支
 */
async function gitCheckoutNew(name, cwd = process.cwd()) {
  return await gitCommand(['checkout', '-b', name], cwd);
}

/**
 * 删除分支
 */
async function gitBranchDelete(name, cwd = process.cwd()) {
  return await gitCommand(['branch', '-D', name], cwd);
}

/**
 * 查看分支列表
 */
async function gitBranchList(cwd = process.cwd()) {
  return await gitCommand(['branch', '-a'], cwd);
}

/**
 * 合并分支
 */
async function gitMerge(branch, cwd = process.cwd()) {
  return await gitCommand(['merge', branch], cwd);
}

/**
 * 查看差异
 */
async function gitDiff(options = '', cwd = process.cwd()) {
  const args = ['diff'];
  if (options) {
    args.push(...options.split(' '));
  }
  return await gitCommand(args, cwd);
}

/**
 * 添加远程仓库
 */
async function gitRemoteAdd(name, url, cwd = process.cwd()) {
  return await gitCommand(['remote', 'add', name, url], cwd);
}

/**
 * 查看远程仓库
 */
async function gitRemoteList(cwd = process.cwd()) {
  return await gitCommand(['remote', '-v'], cwd);
}

/**
 * 设置用户信息
 */
async function gitConfigUser(name, email, cwd = process.cwd()) {
  await gitCommand(['config', 'user.name', name], cwd);
  return await gitCommand(['config', 'user.email', email], cwd);
}

/**
 * 撤销未提交的更改
 */
async function gitReset(options = '--hard', cwd = process.cwd()) {
  const args = ['reset'];
  if (options) {
    args.push(...options.split(' '));
  }
  return await gitCommand(args, cwd);
}

/**
 * 暂存文件
 */
async function gitStash(cwd = process.cwd()) {
  return await gitCommand(['stash'], cwd);
}

/**
 * 恢复暂存
 */
async function gitStashPop(cwd = process.cwd()) {
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
  gitStashPop
};