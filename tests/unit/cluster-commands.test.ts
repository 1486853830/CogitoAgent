import { jest } from '@jest/globals';

// --- Mock terminal output functions ---
const mockPrintln = jest.fn();
const mockPrintDivider = jest.fn();
const mockPrintTag = jest.fn((text: string) => `[${text}]`);

// --- Mock orchestrator singleton ---
const mockSpawnAgent = jest.fn();
const mockDelegateTask = jest.fn();
const mockGetClusterStatus = jest.fn();

jest.unstable_mockModule('../../src/io/terminal.ts', () => ({
  println: mockPrintln,
  printDivider: mockPrintDivider,
  printTag: mockPrintTag,
}));

jest.unstable_mockModule('../../src/agent/orchestrator.ts', () => ({
  orchestrator: {
    spawnAgent: mockSpawnAgent,
    delegateTask: mockDelegateTask,
    getClusterStatus: mockGetClusterStatus,
  },
}));

const { printClusterStatus, handleSpawnCommand, handleDelegateCommand } =
  await import('../../src/agent/cluster-commands.ts');

// Helper to flush microtask queue (handleSpawnCommand/handleDelegateCommand use .then())
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('cluster-commands.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // printClusterStatus
  // ============================================
  describe('printClusterStatus', () => {
    it('should print empty state when no agents', () => {
      mockGetClusterStatus.mockReturnValue({ totalAgents: 0, byState: {}, agents: [] });
      printClusterStatus();
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('暂无活跃智能体'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('/spawn'), 'gray');
    });

    it('should print agent count in header', () => {
      mockGetClusterStatus.mockReturnValue({ totalAgents: 3, byState: { idle: 3 }, agents: [] });
      printClusterStatus();
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('3 个'), 'cyan');
    });

    it('should print state summary when agents exist', () => {
      mockGetClusterStatus.mockReturnValue({
        totalAgents: 2,
        byState: { idle: 1, done: 1 },
        agents: [
          {
            id: 'agent_1',
            name: 'A1',
            persona: 'Assistant',
            state: 'idle',
            toolCalls: 0,
            iterationCount: 0,
            hasError: false,
            error: null,
          },
          {
            id: 'agent_2',
            name: 'A2',
            persona: 'Critic',
            state: 'done',
            toolCalls: 2,
            iterationCount: 3,
            hasError: false,
            error: null,
          },
        ],
      });
      printClusterStatus();
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('状态概览'), 'yellow');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('idle: 1'), 'yellow');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('done: 1'), 'yellow');
    });

    it('should print agent details for each agent', () => {
      mockGetClusterStatus.mockReturnValue({
        totalAgents: 1,
        byState: { idle: 1 },
        agents: [
          {
            id: 'agent_1',
            name: 'TestAgent',
            persona: 'Assistant',
            state: 'idle',
            toolCalls: 5,
            iterationCount: 2,
            hasError: false,
            error: null,
          },
        ],
      });
      printClusterStatus();
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('agent_1'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('Assistant'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('5 次'), 'gray');
    });

    it('should print error info for errored agents', () => {
      mockGetClusterStatus.mockReturnValue({
        totalAgents: 1,
        byState: { error: 1 },
        agents: [
          {
            id: 'agent_1',
            name: 'BadAgent',
            persona: 'Assistant',
            state: 'error',
            toolCalls: 0,
            iterationCount: 1,
            hasError: true,
            error: 'Something went wrong',
          },
        ],
      });
      printClusterStatus();
      expect(mockPrintln).toHaveBeenCalledWith(
        expect.stringContaining('Something went wrong'),
        'red',
      );
    });

    it('should print command help', () => {
      mockGetClusterStatus.mockReturnValue({ totalAgents: 0, byState: {}, agents: [] });
      printClusterStatus();
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('/spawn'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('/delegate'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('/agents'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('/cluster'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('/stop-agent'), 'gray');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('/stop-all-agents'), 'gray');
    });

    it('should call printDivider with = and cyan', () => {
      mockGetClusterStatus.mockReturnValue({ totalAgents: 0, byState: {}, agents: [] });
      printClusterStatus();
      expect(mockPrintDivider).toHaveBeenCalledWith('=', 'cyan');
    });
  });

  // ============================================
  // handleSpawnCommand
  // ============================================
  describe('handleSpawnCommand', () => {
    it('should parse and call spawnAgent with simple args', async () => {
      mockSpawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent_1', name: 'TestAgent', persona: 'Assistant', instruction: 'test' },
      });

      handleSpawnCommand('/spawn Assistant TestAgent test instruction');
      await flushPromises();

      expect(mockSpawnAgent).toHaveBeenCalledWith('Assistant', 'TestAgent', 'test instruction');
    });

    it('should parse quoted arguments', async () => {
      mockSpawnAgent.mockResolvedValue({
        success: true,
        data: {
          id: 'agent_1',
          name: 'Quoted Name',
          persona: 'Assistant',
          instruction: 'quoted instruction',
        },
      });

      handleSpawnCommand('/spawn Assistant "Quoted Name" "quoted instruction"');
      await flushPromises();

      expect(mockSpawnAgent).toHaveBeenCalledWith('Assistant', 'Quoted Name', 'quoted instruction');
    });

    it('should use single-quoted arguments', async () => {
      mockSpawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent_1', name: 'Single', persona: 'Assistant', instruction: 'single instr' },
      });

      handleSpawnCommand("/spawn Assistant 'Single' 'single instr'");
      await flushPromises();

      expect(mockSpawnAgent).toHaveBeenCalledWith('Assistant', 'Single', 'single instr');
    });

    it('should use default persona when no args', async () => {
      mockSpawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent_1', name: 'default', persona: 'Assistant', instruction: '' },
      });

      handleSpawnCommand('/spawn');
      await flushPromises();

      expect(mockSpawnAgent).toHaveBeenCalledWith('Assistant', expect.any(String), '');
    });

    it('should print success info on successful spawn', async () => {
      mockSpawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent_42', name: 'TestAgent', persona: 'Assistant', instruction: 'do stuff' },
      });

      handleSpawnCommand('/spawn Assistant TestAgent do stuff');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('agent_42'), 'white');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('TestAgent'), 'white');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('Assistant'), 'white');
    });

    it('should print delegate hint after spawn', async () => {
      mockSpawnAgent.mockResolvedValue({
        success: true,
        data: { id: 'agent_1', name: 'TestAgent', persona: 'Assistant', instruction: '' },
      });

      handleSpawnCommand('/spawn Assistant TestAgent');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(
        expect.stringContaining('/delegate agent_1'),
        'gray',
      );
    });

    it('should print error on spawn failure', async () => {
      mockSpawnAgent.mockResolvedValue({ success: false, error: 'Persona "Bad" 不存在' });

      handleSpawnCommand('/spawn Bad TestAgent');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('不存在'), 'red');
    });

    it('should handle spawnAgent rejection', async () => {
      mockSpawnAgent.mockRejectedValue(new Error('spawn failed'));

      handleSpawnCommand('/spawn Assistant TestAgent');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('spawn failed'), 'red');
    });
  });

  // ============================================
  // handleDelegateCommand
  // ============================================
  describe('handleDelegateCommand', () => {
    it('should parse and call delegateTask', async () => {
      mockDelegateTask.mockResolvedValue({ success: true, data: 'task result' });

      handleDelegateCommand('/delegate agent_1 do the task');
      await flushPromises();

      expect(mockDelegateTask).toHaveBeenCalledWith('agent_1', 'do the task');
    });

    it('should print error when no task provided', () => {
      handleDelegateCommand('/delegate agent_1');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('请提供任务描述'), 'red');
      expect(mockDelegateTask).not.toHaveBeenCalled();
    });

    it('should print error when no arguments provided', () => {
      handleDelegateCommand('/delegate');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('请提供任务描述'), 'red');
      expect(mockDelegateTask).not.toHaveBeenCalled();
    });

    it('should print multi-line result on success', async () => {
      mockDelegateTask.mockResolvedValue({ success: true, data: 'line1\nline2\nline3' });

      handleDelegateCommand('/delegate agent_1 task');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('任务完成'), 'green');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('line1'), 'white');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('line2'), 'white');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('line3'), 'white');
    });

    it('should print (无回复) when result is empty', async () => {
      mockDelegateTask.mockResolvedValue({ success: true, data: '' });

      handleDelegateCommand('/delegate agent_1 task');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('(无回复)'), 'white');
    });

    it('should print error on delegate failure', async () => {
      mockDelegateTask.mockResolvedValue({ success: false, error: '智能体不存在' });

      handleDelegateCommand('/delegate agent_1 task');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('任务失败'), 'red');
      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('智能体不存在'), 'red');
    });

    it('should handle delegateTask rejection', async () => {
      mockDelegateTask.mockRejectedValue(new Error('delegate failed'));

      handleDelegateCommand('/delegate agent_1 task');
      await flushPromises();

      expect(mockPrintln).toHaveBeenCalledWith(expect.stringContaining('delegate failed'), 'red');
    });
  });
});
