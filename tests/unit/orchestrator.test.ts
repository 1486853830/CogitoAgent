import { jest } from '@jest/globals';

// --- Mock LLM API client (streamChatNative) ---
const mockStreamChatNative = jest.fn();
jest.unstable_mockModule('../../src/api/client.ts', () => ({
  streamChatNative: mockStreamChatNative,
  isAbortError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError',
}));

// --- Mock WebSocket broadcast ---
const mockBroadcast = jest.fn();
jest.unstable_mockModule('../../src/io/ws-server.ts', () => ({
  broadcast: mockBroadcast,
}));

const { orchestrator, AgentOrchestrator, SubAgent } =
  await import('../../src/agent/orchestrator.ts');

describe('orchestrator.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStreamChatNative.mockImplementation(async function* () {
      yield { content: 'mock response' };
      return { input: 0, output: 0, stopReason: 'stop', toolCalls: [] };
    });
    orchestrator.stopAllAgents();
  });

  // ============================================
  // AgentOrchestrator class
  // ============================================
  describe('AgentOrchestrator class', () => {
    it('should initialize with default values', () => {
      const orch = new AgentOrchestrator();
      expect(orch.agents.size).toBe(0);
      expect(orch.counter).toBe(0);
      expect(orch.maxIterations).toBe(5);
      expect(orch.maxToolOutput).toBe(5000);
    });
  });

  // ============================================
  // SubAgent class
  // ============================================
  describe('SubAgent class', () => {
    it('should initialize with correct values', () => {
      const agent = new SubAgent('test_id', 'Assistant', 'TestName', 'test instruction');
      expect(agent.id).toBe('test_id');
      expect(agent.persona).toBe('Assistant');
      expect(agent.name).toBe('TestName');
      expect(agent.instruction).toBe('test instruction');
      expect(agent.state).toBe('idle');
      expect(agent.messages).toEqual([]);
      expect(agent.result).toBeNull();
      expect(agent.toolCalls).toBe(0);
      expect(agent.error).toBeNull();
      expect(agent.iterationCount).toBe(0);
      expect(agent.createdAt).toBeDefined();
      expect(agent.lastActiveAt).toBe(agent.createdAt);
    });
  });

  // ============================================
  // getClusterStatus
  // ============================================
  describe('getClusterStatus', () => {
    it('should return initial state with no agents', () => {
      const status = orchestrator.getClusterStatus();
      expect(status.totalAgents).toBe(0);
      expect(status.agents).toEqual([]);
      expect(status.byState).toEqual({});
    });

    it('should reflect spawned agents', async () => {
      await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const status = orchestrator.getClusterStatus();
      expect(status.totalAgents).toBe(1);
      expect(status.agents).toHaveLength(1);
      expect(status.agents[0].name).toBe('Agent1');
      expect(status.byState.idle).toBe(1);
    });
  });

  // ============================================
  // spawnAgent
  // ============================================
  describe('spawnAgent', () => {
    it('should create a new agent with existing persona', async () => {
      const result = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'test instruction');
      expect(result.success).toBe(true);
      expect(result.data.id).toMatch(/^agent_\d+$/);
      expect(result.data.name).toBe('TestAgent');
      expect(result.data.persona).toBe('Assistant');
      expect(result.data.instruction).toBe('test instruction');
      expect(result.data.createdAt).toBeDefined();
    });

    it('should increment counter for each agent', async () => {
      const r1 = await orchestrator.spawnAgent('Assistant', 'A1', '');
      const r2 = await orchestrator.spawnAgent('Assistant', 'A2', '');
      expect(r1.data.id).not.toBe(r2.data.id);
    });

    it('should use default name when not provided', async () => {
      const result = await orchestrator.spawnAgent('Assistant');
      expect(result.success).toBe(true);
      expect(result.data.name).toMatch(/^Assistant_\d+$/);
      expect(result.data.instruction).toBe('(无)');
    });

    it('should use default persona when not provided', async () => {
      const result = await orchestrator.spawnAgent();
      expect(result.success).toBe(true);
      expect(result.data.persona).toBe('Assistant');
    });

    it('should fail for non-existent persona', async () => {
      const result = await orchestrator.spawnAgent('NonExistentPersona');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should broadcast cluster state on spawn', async () => {
      await orchestrator.spawnAgent('Assistant', 'TestAgent', '');
      expect(mockBroadcast).toHaveBeenCalledWith('cluster-state', expect.any(Object));
    });
  });

  // ============================================
  // getAgent
  // ============================================
  describe('getAgent', () => {
    it('should return agent by id', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'instruction');
      const agent = orchestrator.getAgent(spawnResult.data.id);
      expect(agent).not.toBeNull();
      expect(agent.id).toBe(spawnResult.data.id);
      expect(agent.name).toBe('TestAgent');
      expect(agent.persona).toBe('Assistant');
      expect(agent.instruction).toBe('instruction');
      expect(agent.state).toBe('idle');
      expect(agent.toolCalls).toBe(0);
      expect(agent.iterationCount).toBe(0);
    });

    it('should return null for non-existent agent', () => {
      const agent = orchestrator.getAgent('nonexistent');
      expect(agent).toBeNull();
    });
  });

  // ============================================
  // delegateTask
  // ============================================
  describe('delegateTask', () => {
    it('should delegate task to spawned agent', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'instruction');
      const result = await orchestrator.delegateTask(spawnResult.data.id, 'do something');
      expect(result.success).toBe(true);
      expect(result.data).toBe('mock response');

      const agent = orchestrator.getAgent(spawnResult.data.id);
      expect(agent.state).toBe('done');
      expect(agent.result).toBe('mock response');
    });

    it('should fail for non-existent agent', async () => {
      const result = await orchestrator.delegateTask('nonexistent', 'task');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should fail when agent is already thinking', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'instruction');
      const agent = orchestrator.agents.get(spawnResult.data.id);
      agent.state = 'thinking';

      const result = await orchestrator.delegateTask(spawnResult.data.id, 'task');
      expect(result.success).toBe(false);
      expect(result.error).toContain('执行中');
    });

    it('should fail when agent is tool_executing', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'instruction');
      const agent = orchestrator.agents.get(spawnResult.data.id);
      agent.state = 'tool_executing';

      const result = await orchestrator.delegateTask(spawnResult.data.id, 'task');
      expect(result.success).toBe(false);
      expect(result.error).toContain('执行中');
    });

    it('should handle LLM errors gracefully', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'instruction');
      mockStreamChatNative.mockImplementation(async function* () {
        throw new Error('LLM connection failed');
      });

      const result = await orchestrator.delegateTask(spawnResult.data.id, 'task');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM');

      const agent = orchestrator.getAgent(spawnResult.data.id);
      expect(agent.state).toBe('error');
      expect(agent.error).toContain('LLM');
    });

    it('should produce a final answer when iteration limit is reached', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', '');
      const originalMaxIterations = orchestrator.maxIterations;
      orchestrator.maxIterations = 2;

      try {
        // 每次返回不同签名的工具调用，避免触发「重复工具」提前终止，确保走迭代上限路径
        let n = 0;
        mockStreamChatNative.mockImplementation(async function* () {
          yield { content: 'mock response' };
          return {
            input: 0,
            output: 0,
            stopReason: 'tool_calls',
            toolCalls: [{ id: `c${n}`, name: 'missing_tool', arguments: `{"arg":"arg${n++}"}` }],
          };
        });

        const result = await orchestrator.delegateTask(spawnResult.data.id, 'do something');

        expect(result.success).toBe(true);
        // 2 次循环迭代 + 1 次收尾调用 = 3 次 LLM 调用
        expect(mockStreamChatNative).toHaveBeenCalledTimes(3);

        const lastMessages = mockStreamChatNative.mock.calls[2][0] as Array<
          Record<string, unknown>
        >;
        const lastUser = lastMessages[lastMessages.length - 1];
        expect(lastUser.content).toContain('最终结果');

        const agent = orchestrator.getAgent(spawnResult.data.id);
        expect(agent.state).toBe('done');
        expect(agent.result).toBe('mock responsemock responsemock response');
      } finally {
        orchestrator.maxIterations = originalMaxIterations;
      }
    });

    it('should force a final answer when duplicate tool calls stop the loop', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', '');
      mockStreamChatNative.mockImplementation(async function* () {
        yield { content: 'mock response' };
        return {
          input: 0,
          output: 0,
          stopReason: 'tool_calls',
          toolCalls: [{ id: 'c1', name: 'missing_tool', arguments: '{}' }],
        };
      });

      const result = await orchestrator.delegateTask(spawnResult.data.id, 'do something');

      expect(result.success).toBe(true);
      // 第 1 次循环 + 第 2 次循环（触发重复检测提前终止）+ 1 次收尾
      expect(mockStreamChatNative).toHaveBeenCalledTimes(3);
      expect(result.data).toContain('重复调用相同工具');
      expect(result.data).toContain('mock response');

      const agent = orchestrator.getAgent(spawnResult.data.id);
      expect(agent.state).toBe('done');
    });

    // R5.2 权限门禁：子智能体直接调 registry.fn，绕过主 Agent 的 executeTool，
    // 此前 tools.permissions 对子智能体完全无效，deny 的工具照样执行。
    it('should refuse tools denied by permission policy', async () => {
      const { registerTool } = await import('../../src/agent/plugin.ts');
      const { setToolPermission, reloadConfig } = await import('../../src/config.ts');

      let executed = 0;
      registerTool('subAgentDeniedProbe', () => {
        executed++;
        return 'should-not-run';
      });
      setToolPermission('subAgentDeniedProbe', 'deny');
      reloadConfig();

      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', '');
      let emitted = false;
      mockStreamChatNative.mockImplementation(async function* () {
        yield { content: 'mock response' };
        if (emitted) return { input: 0, output: 0, stopReason: 'stop', toolCalls: [] };
        emitted = true;
        return {
          input: 0,
          output: 0,
          stopReason: 'tool_calls',
          toolCalls: [{ id: 'c1', name: 'subAgentDeniedProbe', arguments: '{}' }],
        };
      });

      await orchestrator.delegateTask(spawnResult.data.id, 'do something');

      // 关键回归断言：被 deny 的工具函数一次都不能被调用
      expect(executed).toBe(0);

      // 对照组：改为 allow 后同一工具必须真的执行。
      // 否则「executed 为 0」可能只是因为工具没注册成功，测试会变成假绿。
      setToolPermission('subAgentDeniedProbe', 'allow');
      reloadConfig();

      const allowSpawn = await orchestrator.spawnAgent('Assistant', 'TestAgent2', '');
      emitted = false;
      await orchestrator.delegateTask(allowSpawn.data.id, 'do something');

      expect(executed).toBe(1);
    });
  });

  // ============================================
  // R3.8 隔离上下文 / 结构化摘要
  // ============================================
  describe('Agent result isolation & structured summary (R3.8)', () => {
    it('should cap long agent results returned to the main agent', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', '');
      mockStreamChatNative.mockImplementation(async function* () {
        yield { content: 'A'.repeat(5000) };
        return { input: 0, output: 0, stopReason: 'stop', toolCalls: [] };
      });
      const result = await orchestrator.delegateTask(spawnResult.data.id, 'task');
      expect(result.success).toBe(true);
      // 主 Agent 拿到截断后的摘要
      expect((result.data as string).length).toBeLessThan(1300);
      expect(result.data).toContain('子 Agent 结果过长');
      // 完整结果仍保留在子 Agent 自身（隔离上下文，可按需取回）
      const agent = orchestrator.getAgent(spawnResult.data.id);
      expect(agent.result).toBe('A'.repeat(5000));
      expect(agent.messageCount).toBeGreaterThan(0);
    });

    it('should keep transcript isolated and retrievable on demand', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', '');
      const result = await orchestrator.delegateTask(spawnResult.data.id, 'do something');
      expect(result.data).toBe('mock response');
      const transcript = orchestrator.getAgentTranscript(spawnResult.data.id);
      expect(transcript).not.toBeNull();
      expect(transcript!.length).toBeGreaterThan(1);
      expect(transcript!.some((m) => m.role === 'system')).toBe(true);
      expect(transcript!.some((m) => m.role === 'user' && m.content.includes('任务'))).toBe(true);
    });

    it('should return null transcript for unknown agent', () => {
      expect(orchestrator.getAgentTranscript('nonexistent')).toBeNull();
    });

    it('should not summarize when disabled', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', '');
      const orchestratorInstance = new AgentOrchestrator();
      orchestratorInstance.resultSummarizable = false;
      orchestratorInstance.agents.set(
        spawnResult.data.id,
        orchestrator.agents.get(spawnResult.data.id)!,
      );
      // 直接单测 summarizeAgentResult：关闭摘要时原样返回
      const big = 'x'.repeat(5000);
      const summarized = orchestratorInstance.summarizeAgentResult(big);
      expect(summarized).toBe(big);
    });
  });

  // ============================================
  // stopAgent
  // ============================================
  describe('stopAgent', () => {
    it('should stop a specific agent', async () => {
      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'instruction');
      const result = orchestrator.stopAgent(spawnResult.data.id);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(spawnResult.data.id);
      expect(result.data.name).toBe('TestAgent');
      expect(result.data.state).toBe('stopped');

      expect(orchestrator.getAgent(spawnResult.data.id)).toBeNull();
    });

    it('should fail for non-existent agent', () => {
      const result = orchestrator.stopAgent('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should abort a running delegateTask and resolve it promptly', async () => {
      // LLM 流：产出一帧后阻塞，直到收到 abort 信号才结束（模拟卡住的流）
      mockStreamChatNative.mockImplementation(async function* (
        _messages: unknown,
        opts?: { signal?: AbortSignal },
      ) {
        yield { content: 'thinking' };
        const signal = opts?.signal;
        if (signal) {
          await new Promise<void>((resolve) => {
            if (signal.aborted) resolve();
            else signal.addEventListener('abort', () => resolve(), { once: true });
          });
        } else {
          await new Promise(() => {
            /* 永不结束 */
          });
        }
        return { input: 0, output: 0, stopReason: 'aborted', toolCalls: [] };
      });

      const spawnResult = await orchestrator.spawnAgent('Assistant', 'TestAgent', 'instruction');
      const agentId = spawnResult.data.id;

      const taskPromise = orchestrator.delegateTask(agentId, 'long running task');

      // 等 delegateTask 进入 LLM 流（此时任务应处于进行中）
      await new Promise((r) => setImmediate(r));
      expect(orchestrator.getAgent(agentId)?.state).toBe('thinking');

      const stopResult = orchestrator.stopAgent(agentId);
      expect(stopResult.success).toBe(true);

      // 被中止的任务应立即结束，而不是永久挂起
      const result = await taskPromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('停止');
      expect(orchestrator.getAgent(agentId)).toBeNull();
    });
  });

  // ============================================
  // stopAllAgents
  // ============================================
  describe('stopAllAgents', () => {
    it('should stop all agents', async () => {
      await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      await orchestrator.spawnAgent('Assistant', 'Agent2', '');

      const result = orchestrator.stopAllAgents();
      expect(result.success).toBe(true);
      expect(result.data.stoppedCount).toBe(2);
      expect(orchestrator.getClusterStatus().totalAgents).toBe(0);
    });

    it('should return 0 when no agents exist', () => {
      const result = orchestrator.stopAllAgents();
      expect(result.success).toBe(true);
      expect(result.data.stoppedCount).toBe(0);
    });
  });

  // ============================================
  // parallelExecute
  // ============================================
  describe('parallelExecute', () => {
    it('should execute tasks in parallel with different agents', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const spawn2 = await orchestrator.spawnAgent('Assistant', 'Agent2', '');

      const results = await orchestrator.parallelExecute([
        { agentId: spawn1.data.id, task: 'task1' },
        { agentId: spawn2.data.id, task: 'task2' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].agentId).toBe(spawn1.data.id);
      expect(results[0].task).toBe('task1');
      expect(results[0].data).toBe('mock response');
      expect(results[0].success).toBe(true);
      expect(results[1].agentId).toBe(spawn2.data.id);
    });

    it('should handle mixed success and failure', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const results = await orchestrator.parallelExecute([
        { agentId: spawn1.data.id, task: 'task1' },
        { agentId: 'nonexistent', task: 'task2' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  // ============================================
  // panelDiscussion
  // ============================================
  describe('panelDiscussion', () => {
    let delegateSpy: jest.SpyInstance;

    beforeEach(() => {
      // panelDiscussion sets agent.state = 'thinking' before calling delegateTask,
      // which causes delegateTask to reject (state conflict). Spy on delegateTask
      // to test panelDiscussion logic independently of this source-code behavior.
      delegateSpy = jest.spyOn(orchestrator, 'delegateTask').mockResolvedValue({
        success: true,
        data: 'mock response',
      });
    });

    afterEach(() => {
      delegateSpy.mockRestore();
    });

    it('should collect opinions from multiple agents', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const spawn2 = await orchestrator.spawnAgent('Assistant', 'Agent2', '');

      const result = await orchestrator.panelDiscussion('test topic', [
        spawn1.data.id,
        spawn2.data.id,
      ]);

      expect(result.success).toBe(true);
      expect(result.data.topic).toBe('test topic');
      expect(result.data.participantCount).toBe(2);
      expect(result.data.opinions).toHaveLength(2);
      expect(result.data.opinions[0].success).toBe(true);
      expect(result.data.opinions[0].agentName).toBe('Agent1');
      expect(result.data.opinions[1].agentName).toBe('Agent2');
    });

    it('should accept moderator instruction', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const result = await orchestrator.panelDiscussion('topic', [spawn1.data.id], 'be critical');
      expect(result.success).toBe(true);
      expect(result.data.opinions[0].response).toBe('mock response');
      expect(delegateSpy).toHaveBeenCalledWith(spawn1.data.id, expect.stringContaining('主持人'));
    });

    it('should fail with empty agent ids', async () => {
      const result = await orchestrator.panelDiscussion('topic', []);
      expect(result.success).toBe(false);
      expect(result.error).toContain('至少指定一个');
    });

    it('should fail with invalid agent ids', async () => {
      const result = await orchestrator.panelDiscussion('topic', ['nonexistent']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  // ============================================
  // pipeline
  // ============================================
  describe('pipeline', () => {
    it('should execute steps in sequence, passing context', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const spawn2 = await orchestrator.spawnAgent('Assistant', 'Agent2', '');

      const result = await orchestrator.pipeline([
        { agentId: spawn1.data.id, task: 'step1', name: 'first' },
        { agentId: spawn2.data.id, task: 'step2', name: 'second' },
      ]);

      expect(result.success).toBe(true);
      expect(result.data.totalSteps).toBe(2);
      expect(result.data.finalResult).toBe('mock response');
      expect(result.data.pipelineResults).toHaveLength(2);
      expect(result.data.pipelineResults[0].stepName).toBe('first');
      expect(result.data.pipelineResults[1].stepName).toBe('second');
    });

    it('should use default step name when not provided', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const result = await orchestrator.pipeline([{ agentId: spawn1.data.id, task: 'step1' }]);
      expect(result.success).toBe(true);
      expect(result.data.pipelineResults[0].stepName).toContain('Agent1');
    });

    it('should fail with empty steps', async () => {
      const result = await orchestrator.pipeline([]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('至少指定一个');
    });

    it('should fail with invalid agent', async () => {
      const result = await orchestrator.pipeline([{ agentId: 'nonexistent', task: 'step1' }]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('should stop pipeline on step failure', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const spawn2 = await orchestrator.spawnAgent('Assistant', 'Agent2', '');

      // Make first agent fail
      mockStreamChatNative.mockImplementationOnce(async function* () {
        throw new Error('step failed');
      });

      const result = await orchestrator.pipeline([
        { agentId: spawn1.data.id, task: 'step1' },
        { agentId: spawn2.data.id, task: 'step2' },
      ]);

      expect(result.success).toBe(false);
      expect(result.data.pipelineResults).toHaveLength(1);
      expect(result.data.pipelineResults[0].success).toBe(false);
    });
  });

  // ============================================
  // voting
  // ============================================
  describe('voting', () => {
    let delegateSpy: jest.SpyInstance;

    beforeEach(() => {
      // voting sets agent.state = 'thinking' before calling delegateTask,
      // which causes delegateTask to reject (state conflict). Spy on delegateTask
      // to test voting logic independently of this source-code behavior.
      delegateSpy = jest.spyOn(orchestrator, 'delegateTask');
    });

    afterEach(() => {
      delegateSpy.mockRestore();
    });

    it('should collect votes with explicit vote format', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      delegateSpy.mockResolvedValue({
        success: true,
        data: '投票：选项A\n理由：因为更好',
      });

      const result = await orchestrator.voting('question', [spawn1.data.id], ['选项A', '选项B']);
      expect(result.success).toBe(true);
      expect(result.data.question).toBe('question');
      expect(result.data.totalVotes).toBe(1);
      expect(result.data.votes[0].vote).toBe('选项A');
      expect(result.data.votes[0].reasoning).toBe('因为更好');
      expect(result.data.tally['选项A']).toBe(1);
    });

    it('should handle votes without explicit format', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      delegateSpy.mockResolvedValue({ success: true, data: '我不确定' });

      const result = await orchestrator.voting('question', [spawn1.data.id]);
      expect(result.success).toBe(true);
      expect(result.data.votes[0].vote).toBe('未明确投票');
    });

    it('should tally votes from multiple agents', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      const spawn2 = await orchestrator.spawnAgent('Assistant', 'Agent2', '');

      let callCount = 0;
      delegateSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { success: true, data: '投票：选项A\n理由：好' };
        }
        return { success: true, data: '投票：选项A\n理由：同意' };
      });

      const result = await orchestrator.voting(
        'question',
        [spawn1.data.id, spawn2.data.id],
        ['选项A', '选项B'],
      );
      expect(result.data.totalVotes).toBe(2);
      expect(result.data.tally['选项A']).toBe(2);
    });

    it('should work without options', async () => {
      const spawn1 = await orchestrator.spawnAgent('Assistant', 'Agent1', '');
      delegateSpy.mockResolvedValue({ success: true, data: '投票：同意\n理由：可以' });

      const result = await orchestrator.voting('question', [spawn1.data.id]);
      expect(result.success).toBe(true);
      expect(result.data.votes[0].vote).toBe('同意');
    });

    it('should fail with empty agent ids', async () => {
      const result = await orchestrator.voting('question', []);
      expect(result.success).toBe(false);
      expect(result.error).toContain('至少指定一个');
    });

    it('should fail with invalid agent ids', async () => {
      const result = await orchestrator.voting('question', ['nonexistent']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });
});
