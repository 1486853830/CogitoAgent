/**
 * Git 安全验证测试
 */

// 模拟 validateGitArgs 函数
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  'init', 'clone', 'add', 'commit', 'push', 'pull', 'status', 'log',
  'branch', 'checkout', 'merge', 'diff', 'remote', 'stash', 'reset', 'config', 'fetch', 'rebase'
]);

const ALLOWED_GIT_OPTIONS = new Set([
  '-m', '-a', '-am', '-v', '-d', '-D', '-f', '--force',
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

function validateGitArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return false;
  }

  const subcommand = args[0];
  if (!ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
    return false;
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string') {
      return false;
    }

    if (arg.startsWith('-')) {
      if (arg === '--no-pager') continue;
      if (!ALLOWED_GIT_OPTIONS.has(arg) && !arg.startsWith('--')) {
        return false;
      }
      continue;
    }

    if (/[;&|`$<>!(){}[\]\\*?\n\r]/.test(arg)) {
      return false;
    }
  }

  return true;
}

describe('Git 安全验证', () => {
  describe('允许的命令', () => {
    test('应该允许 git status', () => {
      expect(validateGitArgs(['status'])).toBe(true);
    });

    test('应该允许 git log', () => {
      expect(validateGitArgs(['log', '--oneline'])).toBe(true);
    });

    test('应该允许 git add', () => {
      expect(validateGitArgs(['add', 'file.txt'])).toBe(true);
    });

    test('应该允许 git commit -m', () => {
      expect(validateGitArgs(['commit', '-m', 'message'])).toBe(true);
    });

    test('应该允许 git push', () => {
      expect(validateGitArgs(['push', 'origin', 'main'])).toBe(true);
    });

    test('应该允许 git checkout -b', () => {
      expect(validateGitArgs(['checkout', '-b', 'new-branch'])).toBe(true);
    });
  });

  describe('拒绝危险命令', () => {
    test('应该拒绝未知子命令', () => {
      expect(validateGitArgs(['unknown'])).toBe(false);
    });

    test('应该拒绝命令注入 (;)', () => {
      expect(validateGitArgs(['status', ';rm -rf /'])).toBe(false);
    });

    test('应该拒绝命令注入 (&)', () => {
      expect(validateGitArgs(['status', '&whoami'])).toBe(false);
    });

    test('应该拒绝命令注入 (|)', () => {
      expect(validateGitArgs(['status', '|cat /etc/passwd'])).toBe(false);
    });

    test('应该拒绝命令注入 ($)', () => {
      expect(validateGitArgs(['status', '$(whoami)'])).toBe(false);
    });

    test('应该拒绝命令注入 (<)', () => {
      expect(validateGitArgs(['status', '<file.txt'])).toBe(false);
    });

    test('应该拒绝命令注入 (>)', () => {
      expect(validateGitArgs(['status', '>file.txt'])).toBe(false);
    });

    test('应该拒绝空数组', () => {
      expect(validateGitArgs([])).toBe(false);
    });

    test('应该拒绝非数组参数', () => {
      expect(validateGitArgs('status')).toBe(false);
    });

    test('应该拒绝换行符注入', () => {
      expect(validateGitArgs(['status', 'file\nrm -rf /'])).toBe(false);
    });
  });

  describe('边界情况', () => {
    test('应该允许带路径的参数', () => {
      expect(validateGitArgs(['add', './src/file.js'])).toBe(true);
    });

    test('应该允许带中文的提交信息', () => {
      expect(validateGitArgs(['commit', '-m', '修复问题'])).toBe(true);
    });

    test('应该允许 --no-pager 选项', () => {
      expect(validateGitArgs(['status', '--no-pager'])).toBe(true);
    });
  });
});