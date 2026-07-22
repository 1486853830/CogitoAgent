/**
 * Git 安全验证测试
 */

// 模拟 validateGitArgs 函数
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

// 模拟 validateCwd 函数
const PROJECT_ROOT = process.cwd();

function validateCwd(cwd, allowOutsideProject = false) {
  // 如果是默认的 process.cwd()，直接允许
  if (!cwd || cwd === process.cwd()) {
    return { valid: true, resolvedPath: process.cwd() };
  }

  // 检查是否包含危险字符
  const dangerousPattern = /[;&|`$<>!(){}[\]\\*?\n\r'""]/;
  if (dangerousPattern.test(cwd)) {
    return {
      valid: false,
      error: `工作目录路径包含危险字符: ${cwd}`,
    };
  }

  // 解析为绝对路径（简化版模拟）
  let absolutePath;
  try {
    // 简化处理：直接使用传入的路径
    absolutePath = cwd;
  } catch {
    return {
      valid: false,
      error: `无效的路径: ${cwd}`,
    };
  }

  // 规范化路径
  absolutePath = absolutePath.replace(/\/+/g, '/');

  // 检查路径遍历攻击
  if (absolutePath.includes('..')) {
    return {
      valid: false,
      error: `不允许路径遍历: ${cwd}`,
    };
  }

  // 如果不允许在项目目录外，检查是否在项目目录下
  // 简化：使用 startsWith 检查
  if (!allowOutsideProject) {
    const normalizedRoot = PROJECT_ROOT.replace(/\\/g, '/');
    const normalizedPath = absolutePath.replace(/\\/g, '/');
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return {
        valid: false,
        error: `工作目录必须在项目目录下: ${PROJECT_ROOT}`,
      };
    }
  }

  return { valid: true, resolvedPath: absolutePath };
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

  describe('cwd 路径验证', () => {
    test('应该允许默认工作目录', () => {
      const result = validateCwd(process.cwd());
      expect(result.valid).toBe(true);
    });

    test('应该允许空路径（使用默认）', () => {
      const result = validateCwd('');
      expect(result.valid).toBe(true);
    });

    test('应该拒绝包含危险字符的路径', () => {
      const result = validateCwd('/path/with;command');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('危险字符');
    });

    test('应该拒绝路径遍历攻击', () => {
      const result = validateCwd('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('路径遍历');
    });

    test('应该拒绝命令注入字符', () => {
      const result = validateCwd('/path/with|command');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('危险字符');
    });

    test('应该拒绝反引号注入', () => {
      const result = validateCwd('/path/with`command`');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('危险字符');
    });

    test('应该拒绝美元符注入', () => {
      const result = validateCwd('/path/$(whoami)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('危险字符');
    });

    test('应该拒绝换行符注入', () => {
      const result = validateCwd('/path/\ncommand');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('危险字符');
    });

    test('应该拒绝分号分隔的多命令', () => {
      const result = validateCwd('/path; rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('危险字符');
    });

    test('应该允许子目录路径（allowOutsideProject=true）', () => {
      // 相对路径需要 allowOutsideProject=true
      const result = validateCwd('./src', true);
      expect(result.valid).toBe(true);
    });

    test('应该允许项目内的绝对路径', () => {
      // 使用与 PROJECT_ROOT 相同格式的路径
      const projectPath = PROJECT_ROOT;
      const result = validateCwd(projectPath);
      expect(result.valid).toBe(true);
    });

    test('应该拒绝项目外的路径（默认）', () => {
      const result = validateCwd('/tmp/some-other-project');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('项目目录下');
    });

    test('应该允许项目外的路径（allowOutsideProject=true）', () => {
      const result = validateCwd('/tmp/some-other-project', true);
      expect(result.valid).toBe(true);
    });
  });
});
