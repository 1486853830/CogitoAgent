import { jest } from '@jest/globals';

// --- Mock config ---
function freshConfig() {
  return {
    api: {
      provider: 'openai',
      model: 'gpt-4',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    },
    chat: {
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.7,
      topK: 50,
      frequencyPenalty: 1,
      thinkingInterval: 3000,
    },
    models: {
      openai: { apiKey: 'sk-openai', baseURL: 'https://api.openai.com/v1' },
      moark: { apiKey: 'sk-moark', baseURL: 'https://api.moark.com/v1' },
      anthropic: { apiKey: 'sk-anthropic', baseURL: 'https://api.anthropic.com/v1' },
      google: { apiKey: 'sk-google', baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
    },
  };
}

let mockConfig: any = freshConfig();
const mockLoadConfig = jest.fn(() => mockConfig);

jest.unstable_mockModule('../../src/config.ts', () => ({
  loadConfig: mockLoadConfig,
}));

// --- Mock OpenAI constructor (declared as global in models.ts) ---
const mockCreate = jest.fn();
const mockOpenAIInstance = {
  chat: {
    completions: {
      create: mockCreate,
    },
  },
};
const mockOpenAIConstructor = jest.fn(() => mockOpenAIInstance);
(globalThis as any).OpenAI = mockOpenAIConstructor;

const {
  getClient,
  getCurrentModel,
  listProviders,
  getProviderInfo,
  switchProvider,
  chat,
  getModels,
  providers,
} = await import('../../src/api/models.ts');

// Helper to collect an async generator's output
async function collectChat(gen: AsyncGenerator<any, void, unknown>) {
  const chunks: any[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('api/models.ts', () => {
  beforeEach(() => {
    mockConfig = freshConfig();
    mockLoadConfig.mockClear();
    mockOpenAIConstructor.mockClear();
    mockCreate.mockReset();
    // Reset the module-level clients cache via switchProvider (valid provider)
    switchProvider('openai', 'gpt-4');
  });

  describe('providers (constant)', () => {
    it('should define the four supported providers', () => {
      expect(Object.keys(providers).sort()).toEqual(['anthropic', 'google', 'moark', 'openai']);
    });

    it('should have baseURL and models array for each provider', () => {
      for (const name of Object.keys(providers)) {
        const info = providers[name];
        expect(typeof info.baseURL).toBe('string');
        expect(info.baseURL.length).toBeGreaterThan(0);
        expect(Array.isArray(info.models)).toBe(true);
        expect(info.models.length).toBeGreaterThan(0);
      }
    });

    it('should have known models for openai', () => {
      expect(providers.openai.baseURL).toBe('https://api.openai.com/v1');
      expect(providers.openai.models).toContain('gpt-4');
    });

    it('should have known models for moark', () => {
      expect(providers.moark.baseURL).toBe('https://api.moark.com/v1');
      expect(providers.moark.models).toContain('DeepSeek-V4');
    });
  });

  describe('listProviders', () => {
    it('should return an array of provider info objects', () => {
      const list = listProviders();
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(4);
      for (const item of list) {
        expect(typeof item.name).toBe('string');
        expect(typeof item.baseURL).toBe('string');
        expect(Array.isArray(item.models)).toBe(true);
      }
    });

    it('should include openai provider', () => {
      const list = listProviders();
      const openai = list.find((p) => p.name === 'openai');
      expect(openai).toBeDefined();
      expect(openai!.baseURL).toBe('https://api.openai.com/v1');
    });
  });

  describe('getProviderInfo', () => {
    it('should return info for a known provider', () => {
      const info = getProviderInfo('openai');
      expect(info).not.toBeNull();
      expect(info!.baseURL).toBe('https://api.openai.com/v1');
      expect(info!.models).toContain('gpt-4');
    });

    it('should return null for an unknown provider', () => {
      expect(getProviderInfo('unknown')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(getProviderInfo('')).toBeNull();
    });
  });

  describe('getModels', () => {
    it('should return models array for a specific provider', () => {
      const models = getModels('openai');
      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-3.5-turbo');
    });

    it('should return empty array for unknown provider', () => {
      const models = getModels('unknown');
      expect(models).toEqual([]);
    });

    it('should return a record of all providers when no argument given', () => {
      const all = getModels() as Record<string, string[]>;
      expect(typeof all).toBe('object');
      expect(Object.keys(all).sort()).toEqual(['anthropic', 'google', 'moark', 'openai']);
      expect(Array.isArray(all.openai)).toBe(true);
      expect(all.moark).toContain('DeepSeek-V4-Flash');
    });

    it('should return all providers when null is passed', () => {
      const all = getModels(null) as Record<string, string[]>;
      expect(Object.keys(all)).toHaveLength(4);
    });
  });

  describe('getCurrentModel', () => {
    it('should return the currently configured provider, model, and baseURL', () => {
      const result = getCurrentModel();
      expect(result).toEqual({
        provider: 'openai',
        model: 'gpt-4',
        baseURL: 'https://api.openai.com/v1',
      });
    });

    it('should reflect config changes', () => {
      mockConfig.api.provider = 'moark';
      mockConfig.api.model = 'DeepSeek-V4';
      mockConfig.api.baseURL = 'https://api.moark.com/v1';
      const result = getCurrentModel();
      expect(result.provider).toBe('moark');
      expect(result.model).toBe('DeepSeek-V4');
      expect(result.baseURL).toBe('https://api.moark.com/v1');
    });
  });

  describe('getClient', () => {
    it('should create and return a client for a configured provider', () => {
      const client = getClient('moark');
      expect(mockOpenAIConstructor).toHaveBeenCalledTimes(1);
      expect(client).toBe(mockOpenAIInstance);
      const [ctorArgs] = mockOpenAIConstructor.mock.calls[0];
      expect(ctorArgs.baseURL).toBe('https://api.moark.com/v1');
      expect(ctorArgs.apiKey).toBe('sk-moark');
      expect(ctorArgs.defaultHeaders).toEqual({});
    });

    it('should cache the client and reuse it on subsequent calls', () => {
      const c1 = getClient('anthropic');
      const c2 = getClient('anthropic');
      expect(c1).toBe(c2);
      expect(mockOpenAIConstructor).toHaveBeenCalledTimes(1);
    });

    it('should create separate clients for different providers', () => {
      const c1 = getClient('openai');
      const c2 = getClient('google');
      expect(c1).toBe(c2); // same mock instance, but constructor called twice
      expect(mockOpenAIConstructor).toHaveBeenCalledTimes(2);
      expect(mockOpenAIConstructor.mock.calls[0][0].baseURL).toBe('https://api.openai.com/v1');
      expect(mockOpenAIConstructor.mock.calls[1][0].baseURL).toBe(
        'https://generativelanguage.googleapis.com/v1beta',
      );
    });

    it('should throw when provider has no apiKey configured', () => {
      mockConfig.models.openai.apiKey = '';
      // Force cache reset so getClient re-checks config
      switchProvider('moark', 'DeepSeek-V4'); // resets clients to {}
      expect(() => getClient('openai')).toThrow('提供商 openai 未配置 API 密钥');
    });

    it('should throw when provider is not in cfg.models at all', () => {
      expect(() => getClient('unknown')).toThrow('提供商 unknown 未配置 API 密钥');
    });

    it('should fall back to providers[provider].baseURL when config lacks baseURL', () => {
      delete mockConfig.models.google.baseURL;
      // Reset cache so getClient re-creates
      switchProvider('openai', 'gpt-4');
      getClient('google');
      const [ctorArgs] =
        mockOpenAIConstructor.mock.calls[mockOpenAIConstructor.mock.calls.length - 1];
      expect(ctorArgs.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta');
    });

    it('should pass custom headers from config', () => {
      mockConfig.models.moark.headers = { 'X-Custom': 'yes' };
      // Use a fresh provider (anthropic) to avoid cache; set headers there
      mockConfig.models.anthropic.headers = { 'X-Test': '1' };
      switchProvider('openai', 'gpt-4'); // reset cache
      getClient('anthropic');
      const lastCall =
        mockOpenAIConstructor.mock.calls[mockOpenAIConstructor.mock.calls.length - 1];
      expect(lastCall[0].defaultHeaders).toEqual({ 'X-Test': '1' });
    });
  });

  describe('switchProvider', () => {
    it('should succeed for a supported and configured provider', () => {
      const result = switchProvider('moark', 'DeepSeek-V4');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        provider: 'moark',
        model: 'DeepSeek-V4',
        baseURL: 'https://api.moark.com/v1',
      });
      // Config should be updated
      expect(mockConfig.api.provider).toBe('moark');
      expect(mockConfig.api.model).toBe('DeepSeek-V4');
      expect(mockConfig.api.baseURL).toBe('https://api.moark.com/v1');
    });

    it('should fail for an unsupported provider', () => {
      const result = switchProvider('unknown', 'some-model');
      expect(result.success).toBe(false);
      expect(result.error).toContain('不支持的提供商');
      expect(result.data).toBeUndefined();
    });

    it('should fail when provider has no apiKey configured', () => {
      mockConfig.models.anthropic.apiKey = '';
      const result = switchProvider('anthropic', 'claude-3-opus');
      expect(result.success).toBe(false);
      expect(result.error).toContain('未配置');
      expect(result.error).toContain('ANTHROPIC_API_KEY');
    });

    it('should fall back to providers[provider].baseURL when cfg lacks baseURL', () => {
      delete mockConfig.models.google.baseURL;
      const result = switchProvider('google', 'gemini-pro');
      expect(result.success).toBe(true);
      expect(result.data!.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta');
    });

    it('should reset the clients cache (next getClient creates a new instance)', () => {
      // Prime the cache
      getClient('moark');
      const callsBefore = mockOpenAIConstructor.mock.calls.length;
      // Switch to moark (resets cache)
      switchProvider('moark', 'DeepSeek-V4');
      // Next getClient('moark') should create a new instance
      getClient('moark');
      expect(mockOpenAIConstructor.mock.calls.length).toBe(callsBefore + 1);
    });
  });

  describe('chat', () => {
    it('should yield content and reasoning deltas with provider', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'Hello' } }] };
          yield { choices: [{ delta: { content: ' world', reasoning_content: 'why' } }] };
          yield { choices: [] }; // skipped
          yield { choices: [{ delta: { reasoning_content: 'only reasoning' } }] };
        })(),
      );

      const gen = chat([{ role: 'user', content: 'hi' }], { provider: 'openai' });
      const chunks = await collectChat(gen);

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ content: 'Hello', reasoning: null, provider: 'openai' });
      expect(chunks[1]).toEqual({
        content: ' world',
        reasoning: 'why',
        provider: 'openai',
      });
      expect(chunks[2]).toEqual({
        content: null,
        reasoning: 'only reasoning',
        provider: 'openai',
      });
    });

    it('should default to cfg.api.provider when options.provider not given', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'x' } }] };
        })(),
      );
      mockConfig.api.provider = 'moark';

      const gen = chat([{ role: 'user', content: 'hi' }], {});
      const chunks = await collectChat(gen);

      expect(chunks[0].provider).toBe('moark');
    });

    it('should default to cfg.api.model when options.model not given', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'x' } }] };
        })(),
      );

      await collectChat(chat([{ role: 'user', content: 'hi' }], { provider: 'openai' }));

      const chatOptions = mockCreate.mock.calls[0][0];
      expect(chatOptions.model).toBe('gpt-4');
    });

    it('should use options.model when provided', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'x' } }] };
        })(),
      );

      await collectChat(
        chat([{ role: 'user', content: 'hi' }], { provider: 'openai', model: 'gpt-4-turbo' }),
      );

      expect(mockCreate.mock.calls[0][0].model).toBe('gpt-4-turbo');
    });

    it('should pass correct chat options to client.create', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'x' } }] };
        })(),
      );

      await collectChat(
        chat(
          [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' },
          ],
          { provider: 'openai' },
        ),
      );

      const opts = mockCreate.mock.calls[0][0];
      expect(opts.messages).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ]);
      expect(opts.model).toBe('gpt-4');
      expect(opts.stream).toBe(true);
      expect(opts.max_tokens).toBe(4096);
      expect(opts.temperature).toBe(0.7);
      expect(opts.top_p).toBe(0.7);
      expect(opts.frequency_penalty).toBe(1);
      expect(opts.top_k).toBeUndefined(); // topK not in options
    });

    it('should include top_k when options.topK is defined', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'x' } }] };
        })(),
      );

      await collectChat(chat([{ role: 'user', content: 'hi' }], { provider: 'openai', topK: 40 }));

      expect(mockCreate.mock.calls[0][0].top_k).toBe(40);
    });

    it('should use options overrides for maxTokens, temperature, topP, frequencyPenalty', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          yield { choices: [{ delta: { content: 'x' } }] };
        })(),
      );

      await collectChat(
        chat([{ role: 'user', content: 'hi' }], {
          provider: 'openai',
          maxTokens: 1000,
          temperature: 0.5,
          topP: 0.9,
          frequencyPenalty: 2,
        }),
      );

      const opts = mockCreate.mock.calls[0][0];
      expect(opts.max_tokens).toBe(1000);
      expect(opts.temperature).toBe(0.5);
      expect(opts.top_p).toBe(0.9);
      expect(opts.frequency_penalty).toBe(2);
    });

    it('should throw wrapped error when getClient fails', async () => {
      // Make openai have no apiKey so getClient throws
      mockConfig.models.openai.apiKey = '';
      switchProvider('moark', 'DeepSeek-V4'); // reset cache

      const gen = chat([{ role: 'user', content: 'hi' }], { provider: 'openai' });
      await expect(collectChat(gen)).rejects.toThrow(
        '获取客户端失败: 提供商 openai 未配置 API 密钥',
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should produce no chunks when stream is empty', async () => {
      mockCreate.mockReturnValue(
        (async function* () {
          // empty
        })(),
      );

      const chunks = await collectChat(
        chat([{ role: 'user', content: 'hi' }], { provider: 'openai' }),
      );
      expect(chunks).toEqual([]);
    });
  });
});
