/**
 * R5.2 权限门禁端到端接线测试。
 *
 * 回归目标：tools.permissions 配置此前只写不读——Dashboard 能保存 deny，
 * 但工具执行路径完全不查，deny 的工具照样执行。本测试锁住「配置真正生效」。
 *
 * 覆盖两条执行路径：
 *   1. 主 Agent：Agent.ts executeTool（原生工具调用 / 推测执行最终都落到这里）
 *   2. 子智能体：orchestrator.ts 直接调 registry.fn，绕过 executeTool，需独立门禁
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testConfigDir = path.join(__dirname, 'tool-perm-enforce-test-dir');

const envKeys = ['COGITO_USER_DATA_DIR', 'COGITO_PERSONA', 'COGITO_MODE'];

// Agent.ts 依赖较重，统一动态导入，确保环境变量先于模块求值生效。
let executeTool: (
  toolName: string,
  args: unknown,
  signal?: AbortSignal,
) => Promise<{ success: boolean; error?: string; data?: unknown }>;
let registerTool: (name: string, fn: (...a: unknown[]) => unknown, o?: object) => void;
let setToolPermission: (name: string, level: 'allow' | 'deny' | 'ask') => void;
let reloadConfig: () => unknown;
let stateModule: typeof import('../../src/agent/state.ts');

/** 记录被调用次数，用来断言「拒绝时工具函数根本没跑」。 */
let callCount = 0;
/** 独立探针：全程不配置任何规则，用于验证「无规则时默认放行」。 */
let unsetCallCount = 0;

beforeAll(async () => {
  process.env.COGITO_USER_DATA_DIR = testConfigDir;
  mkdirSync(testConfigDir, { recursive: true });

  const agentMod = await import('../../src/agent/Agent.ts');
  const pluginMod = await import('../../src/agent/plugin.ts');
  const configMod = await import('../../src/config.ts');
  stateModule = await import('../../src/agent/state.ts');

  executeTool = agentMod.executeTool as typeof executeTool;
  registerTool = pluginMod.registerTool as typeof registerTool;
  setToolPermission = configMod.setToolPermission as typeof setToolPermission;
  reloadConfig = configMod.reloadConfig as typeof reloadConfig;

  // 惰性测试工具：不碰文件系统/网络，仅计数，避免测试产生副作用。
  registerTool(
    'permProbeTool',
    () => {
      callCount++;
      return 'probe-ok';
    },
    { description: '权限门禁测试探针', category: 'custom' },
  );

  registerTool(
    'permProbeUnsetTool',
    () => {
      unsetCallCount++;
      return 'probe-ok';
    },
    { description: '权限门禁测试探针（无规则）', category: 'custom' },
  );
});

afterAll(() => {
  rmSync(testConfigDir, { recursive: true, force: true });
  envKeys.forEach((key) => delete process.env[key]);
});

beforeEach(() => {
  callCount = 0;
  unsetCallCount = 0;
  process.env.COGITO_USER_DATA_DIR = testConfigDir;
  reloadConfig();
});

describe('R5.2 权限门禁 - 主 Agent 执行路径（executeTool）', () => {
  it('allow：正常执行工具', async () => {
    setToolPermission('permProbeTool', 'allow');
    const result = await executeTool('permProbeTool', []);

    expect(result.success).toBe(true);
    expect(callCount).toBe(1);
  });

  it('deny：拒绝执行，且工具函数完全没有被调用', async () => {
    setToolPermission('permProbeTool', 'deny');
    const result = await executeTool('permProbeTool', []);

    expect(result.success).toBe(false);
    expect(result.error).toContain('已被权限策略禁用');
    // 关键回归断言：此前 deny 的工具照样执行，callCount 会是 1
    expect(callCount).toBe(0);
  });

  it('ask：用户批准后执行', async () => {
    setToolPermission('permProbeTool', 'ask');

    const promise = executeTool('permProbeTool', []);
    // 等待门禁进入等待确认状态后再批准
    await waitForConfirmation();
    stateModule.resolveConfirmation(true);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(1);
  });

  it('ask：用户拒绝后不执行', async () => {
    setToolPermission('permProbeTool', 'ask');

    const promise = executeTool('permProbeTool', []);
    await waitForConfirmation();
    stateModule.resolveConfirmation(false);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('拒绝授权');
    expect(callCount).toBe(0);
  });

  it('未配置规则时默认放行（不破坏既有行为）', async () => {
    // 使用全程未配置过规则的探针，避免读到上一用例持久化的 ask 规则
    const result = await executeTool('permProbeUnsetTool', []);

    expect(result.success).toBe(true);
    expect(unsetCallCount).toBe(1);
  });
});

/** 轮询等待进入 AWAITING_CONFIRMATION，避免依赖固定 sleep 时长。 */
async function waitForConfirmation(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (stateModule.getPendingConfirmation()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('未进入等待确认状态：权限门禁可能没有触发 ask 流程');
}
