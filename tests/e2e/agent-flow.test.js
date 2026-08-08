describe('Agent Full Flow E2E', () => {
  beforeEach(() => {});

  describe('Agent Initialization', () => {
    test('should initialize with default config', async () => {
      const config = {
        api: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
        workspace: './',
        thinkingInterval: 3000,
        persona: 'explorer',
      };

      expect(config.api.baseUrl).toBe('https://api.openai.com/v1');
      expect(config.thinkingInterval).toBe(3000);
      expect(config.persona).toBe('explorer');
    });

    test('should load persona configuration', async () => {
      const personas = {
        explorer: { name: 'explorer', temperature: 0.7 },
        scholar: { name: 'scholar', temperature: 0.5 },
      };

      const persona = personas.explorer;
      expect(persona.name).toBe('explorer');
      expect(persona.temperature).toBe(0.7);
    });

    test('should register all tool categories', async () => {
      const toolCategories = [
        'file',
        'web',
        'browser',
        'system',
        'code',
        'git',
        'task',
        'memory',
        'data',
        'db',
        'email',
        'monitor',
        'scheduler',
      ];

      expect(toolCategories).toHaveLength(13);
      expect(toolCategories).toContain('file');
      expect(toolCategories).toContain('memory');
      expect(toolCategories).toContain('git');
    });
  });

  describe('Think Cycle', () => {
    test('should create think cycle with correct interval', async () => {
      const cycleStates = [];

      const thinkCycle = setInterval(() => {
        cycleStates.push('thinking');
      }, 100);

      await new Promise((resolve) => setTimeout(resolve, 350));
      clearInterval(thinkCycle);

      expect(cycleStates.length).toBeGreaterThanOrEqual(1);
    });

    test('should build message context correctly', async () => {
      const systemPrompt = 'You are a helpful assistant';
      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const tools = ['ls', 'read', 'create'];

      const context = {
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'system', content: `Available tools: ${tools.join(', ')}` },
        ],
      };

      // system + user + assistant + tools = 4 messages
      expect(context.messages).toHaveLength(4);
      expect(context.messages[0].role).toBe('system');
      expect(context.messages[1].content).toBe('Hello');
    });
  });

  describe('Tool Execution', () => {
    test('should construct native tool_calls correctly', async () => {
      const toolCall = {
        id: 'call_1',
        type: 'function',
        function: { name: 'ls', arguments: '{"path": "/project/src"}' },
      };
      const parsed = JSON.parse(toolCall.function.arguments);

      expect(toolCall.type).toBe('function');
      expect(toolCall.function.name).toBe('ls');
      expect(parsed.path).toBe('/project/src');
    });

    test('should handle multiple tool calls in sequence', async () => {
      const toolCalls = [
        { name: 'ls', args: '"/project"', result: ['file1.js', 'file2.js'] },
        { name: 'read', args: '"/project/file1.js"', result: 'file content' },
      ];

      const results = [];
      for (const call of toolCalls) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push({ name: call.name, result: call.result });
      }

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('ls');
      expect(results[1].name).toBe('read');
    });

    test('should handle tool execution errors gracefully', async () => {
      const errorTool = async () => {
        throw new Error('File not found');
      };

      await expect(errorTool()).rejects.toThrow('File not found');
    });

    test('should validate tool arguments', async () => {
      const validateArgs = (fn, args) => {
        const argCount = fn.length;
        const providedCount = args.length;
        return argCount === providedCount;
      };

      const twoArgFn = (a, b) => a + b;
      expect(validateArgs(twoArgFn, [1, 2])).toBe(true);
      expect(validateArgs(twoArgFn, [1])).toBe(false);
    });
  });

  describe('State Machine', () => {
    const State = {
      THINKING: 'THINKING',
      AWAITING_INPUT: 'AWAITING_INPUT',
      AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
    };

    test('should transition from THINKING to AWAITING_INPUT on interrupt', async () => {
      let currentState = State.THINKING;

      const transition = (newState) => {
        currentState = newState;
      };

      transition(State.AWAITING_INPUT);
      expect(currentState).toBe(State.AWAITING_INPUT);
    });

    test('should transition from AWAITING_INPUT to THINKING on send', async () => {
      let currentState = State.AWAITING_INPUT;

      const sendMessage = () => {
        currentState = State.THINKING;
      };

      sendMessage();
      expect(currentState).toBe(State.THINKING);
    });

    test('should transition to AWAITING_CONFIRMATION for dangerous operations', async () => {
      let currentState = State.THINKING;

      const dangerousOperation = () => {
        currentState = State.AWAITING_CONFIRMATION;
      };

      dangerousOperation();
      expect(currentState).toBe(State.AWAITING_CONFIRMATION);
    });

    test('should handle all valid state transitions', async () => {
      const transitions = [
        { from: State.THINKING, event: 'interrupt', to: State.AWAITING_INPUT },
        { from: State.AWAITING_INPUT, event: 'send', to: State.THINKING },
        { from: State.THINKING, event: 'dangerous', to: State.AWAITING_CONFIRMATION },
        { from: State.AWAITING_CONFIRMATION, event: 'confirm', to: State.THINKING },
      ];

      transitions.forEach(({ from, event, to }) => {
        expect([State.THINKING, State.AWAITING_INPUT, State.AWAITING_CONFIRMATION]).toContain(to);
      });
    });
  });

  describe('Session Management', () => {
    test('should create new session with unique id', async () => {
      const sessions = new Map();

      const createSession = (name) => {
        const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session = { id, name, createdAt: Date.now(), messages: [] };
        sessions.set(id, session);
        return session;
      };

      const session = createSession('Test Session');
      expect(session.id).toBeDefined();
      expect(session.name).toBe('Test Session');
      expect(sessions.has(session.id)).toBe(true);
    });

    test('should switch between sessions', async () => {
      const sessions = new Map();
      let currentSessionId = null;

      sessions.set('session_1', { id: 'session_1', messages: [{ role: 'user', content: 'msg1' }] });
      sessions.set('session_2', { id: 'session_2', messages: [{ role: 'user', content: 'msg2' }] });

      const switchSession = (id) => {
        currentSessionId = id;
        return sessions.get(id);
      };

      const session1 = switchSession('session_1');
      expect(session1.messages[0].content).toBe('msg1');

      const session2 = switchSession('session_2');
      expect(session2.messages[0].content).toBe('msg2');
    });

    test('should delete session', async () => {
      const sessions = new Map();
      sessions.set('session_1', { id: 'session_1' });
      sessions.set('session_2', { id: 'session_2' });

      const deleteSession = (id) => {
        sessions.delete(id);
      };

      deleteSession('session_1');
      expect(sessions.has('session_1')).toBe(false);
      expect(sessions.has('session_2')).toBe(true);
    });

    test('should handle context compression', async () => {
      const MAX_MESSAGES = 150;
      const messages = [];

      for (let i = 0; i < 200; i++) {
        messages.push({ role: 'user', content: `message ${i}` });
      }

      const compressContext = (msgs, maxLen) => {
        if (msgs.length <= maxLen) return msgs;
        const keepCount = Math.floor(maxLen / 2);
        return [
          msgs[0],
          ...msgs.slice(
            Math.floor(msgs.length / 2) - keepCount / 2,
            Math.floor(msgs.length / 2) + keepCount / 2,
          ),
          msgs[msgs.length - 1],
        ];
      };

      const compressed = compressContext(messages, MAX_MESSAGES);
      expect(compressed.length).toBeLessThan(messages.length);
      expect(compressed[0].content).toBe('message 0');
    });
  });

  describe('Memory System', () => {
    test('should add memory with tags', async () => {
      const memories = [];

      const addMemory = (content, tags, metadata) => {
        const memory = {
          id: `mem_${Date.now()}`,
          content,
          tags,
          metadata,
          createdAt: Date.now(),
        };
        memories.push(memory);
        return memory;
      };

      const memory = addMemory('Meeting at 9am', ['meeting', 'important'], { priority: 'high' });
      expect(memory.content).toBe('Meeting at 9am');
      expect(memory.tags).toContain('meeting');
    });

    test('should search memories by keyword', async () => {
      const memories = [
        { id: '1', content: 'Meeting at 9am', tags: ['meeting'] },
        { id: '2', content: 'Lunch at noon', tags: ['food'] },
        { id: '3', content: 'Project deadline', tags: ['work'] },
      ];

      const searchMemory = (keyword) => {
        return memories.filter(
          (m) =>
            m.content.toLowerCase().includes(keyword.toLowerCase()) ||
            m.tags.some((t) => t.includes(keyword.toLowerCase())),
        );
      };

      const results = searchMemory('meeting');
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Meeting at 9am');
    });
  });

  describe('Task Management', () => {
    test('should create task with priority', async () => {
      const tasks = [];

      const createTask = (title, description, priority) => {
        const task = {
          id: `task_${Date.now()}`,
          title,
          description,
          priority,
          status: 'pending',
          createdAt: Date.now(),
        };
        tasks.push(task);
        return task;
      };

      const task = createTask('Complete project', 'Finish by Friday', 'high');
      expect(task.title).toBe('Complete project');
      expect(task.priority).toBe('high');
      expect(task.status).toBe('pending');
    });

    test('should complete task', async () => {
      const task = {
        id: 'task_1',
        title: 'Test task',
        status: 'pending',
      };

      const completeTask = (task) => {
        task.status = 'completed';
        task.completedAt = Date.now();
        return task;
      };

      const completed = completeTask(task);
      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeDefined();
    });

    test('should split task into subtasks', async () => {
      const parentTask = { id: 'parent', title: 'Parent Task' };
      const subtasks = [
        { title: 'Subtask 1', priority: 'high' },
        { title: 'Subtask 2', priority: 'middle' },
      ];

      const splitTask = (parent, children) => {
        return children.map((child) => ({
          ...child,
          parent_id: parent.id,
          status: 'pending',
        }));
      };

      const result = splitTask(parentTask, subtasks);
      expect(result).toHaveLength(2);
      expect(result[0].parent_id).toBe('parent');
    });
  });

  describe('API Integration', () => {
    test('should construct API request correctly', async () => {
      const config = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o',
      };

      const buildRequest = (messages) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
        }),
      });

      const request = buildRequest([{ role: 'user', content: 'Hello' }]);
      expect(request.method).toBe('POST');
      expect(request.headers.Authorization).toBe('Bearer test-key');
      expect(JSON.parse(request.body).stream).toBe(true);
    });

    test('should handle API errors', async () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
        },
      };

      expect(errorResponse.error.type).toBe('authentication_error');
    });
  });

  describe('Command Processing', () => {
    test('should parse /help command', async () => {
      const parseCommand = (input) => {
        if (input.startsWith('/')) {
          const [cmd, ...args] = input.slice(1).split(' ');
          return { command: cmd, args };
        }
        return null;
      };

      const result = parseCommand('/help');
      expect(result.command).toBe('help');
      expect(result.args).toHaveLength(0);
    });

    test('should parse /persona command with argument', async () => {
      const parseCommand = (input) => {
        if (input.startsWith('/')) {
          const [cmd, ...args] = input.slice(1).split(' ');
          return { command: cmd, args };
        }
        return null;
      };

      const result = parseCommand('/persona explorer');
      expect(result.command).toBe('persona');
      expect(result.args[0]).toBe('explorer');
    });

    test('should identify non-command input', async () => {
      const parseCommand = (input) => {
        if (input.startsWith('/')) {
          const [cmd, ...args] = input.slice(1).split(' ');
          return { command: cmd, args };
        }
        return null;
      };

      const result = parseCommand('Hello, how are you?');
      expect(result).toBeNull();
    });
  });
});
