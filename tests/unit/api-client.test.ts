import { jest } from '@jest/globals';

// --- Mocks for config module ---
const mockLoadConfig = jest.fn(() => ({
  api: {
    baseURL: 'https://api.test.com/v1',
    apiKey: 'test-key',
    model: 'test-model',
    provider: 'test',
  },
  chat: {
    maxTokens: 4096,
    temperature: 0.7,
    topP: 0.7,
    topK: 50,
    frequencyPenalty: 1,
    thinkingInterval: 3000,
  },
}));

jest.unstable_mockModule('../../src/config.ts', () => ({
  loadConfig: mockLoadConfig,
}));

// Use the real safeParseJSON from llm-validator (no external dep)

// --- Fetch mock ---

const fetchMock = jest.fn<any>();
(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;

const { streamChat, estimateTokens } = await import('../../src/api/client.ts');

// --- Helpers ---
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function sseLine(data: string): string {
  return `data: ${data}\n`;
}

interface MockResponseOptions {
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
  chunks?: Uint8Array[];
}

function makeResponse(opts: MockResponseOptions = {}) {
  const chunks = opts.chunks ?? [];
  let index = 0;
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    body: {
      getReader: () => ({
        read: async () => {
          if (index < chunks.length) {
            return { done: false, value: chunks[index++] };
          }
          return { done: true, value: undefined };
        },
      }),
    },
    text: async () => opts.text ?? '',
  };
}

async function collectStream<T = any>(
  gen: AsyncGenerator<any, T, unknown>,
): Promise<{ chunks: any[]; result: T }> {
  const chunks: any[] = [];
  let result: T;
  while (true) {
    const { value, done } = await gen.next();
    if (done) {
      result = value;
      break;
    }
    chunks.push(value);
  }
  return { chunks, result: result as T };
}

describe('api/client.ts', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockLoadConfig.mockClear();
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined input', () => {
      expect(estimateTokens(null as any)).toBe(0);
      expect(estimateTokens(undefined as any)).toBe(0);
    });

    it('should estimate tokens for pure English text (~1 token/4 chars)', () => {
      const text = 'hello world'; // 11 chars, 0 chinese
      const expected = Math.ceil(11 / 4); // 3
      expect(estimateTokens(text)).toBe(expected);
    });

    it('should estimate tokens for pure Chinese text (~1 token/1.5 chars)', () => {
      const text = '你好世界测试'; // 6 chinese chars
      const expected = Math.ceil(6 / 1.5); // 4
      expect(estimateTokens(text)).toBe(expected);
    });

    it('should estimate tokens for mixed Chinese and English', () => {
      const text = '你好 hello'; // 2 chinese + 6 other (incl. space) = 8 chars total
      const expected = Math.ceil(2 / 1.5) + Math.ceil(6 / 4); // ceil(1.33) + ceil(1.5) = 2 + 2 = 4
      expect(estimateTokens(text)).toBe(expected);
    });

    it('should handle text with special characters', () => {
      const text = '!@#$%^&*()'; // 10 other chars
      const expected = Math.ceil(10 / 4); // 3
      expect(estimateTokens(text)).toBe(expected);
    });
  });

  describe('streamChat - successful streaming', () => {
    it('should yield content deltas from SSE stream', async () => {
      const stream = [
        sseLine(JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })),
        sseLine(JSON.stringify({ choices: [{ delta: { content: ' world' } }] })),
        sseLine('[DONE]'),
      ].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { chunks, result } = await collectStream(gen);

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ content: 'Hello', reasoning: null });
      expect(chunks[1]).toEqual({ content: ' world', reasoning: null });
      // No usage in stream → fallback estimation
      expect(result).not.toBeNull();
      expect(result!.input).toBeGreaterThan(0);
      expect(result!.output).toBe(0);
    });

    it('should yield reasoning_content deltas as reasoning', async () => {
      const stream = [
        sseLine(
          JSON.stringify({
            choices: [{ delta: { reasoning_content: 'thinking...' } }],
          }),
        ),
        sseLine(
          JSON.stringify({
            choices: [{ delta: { content: 'answer', reasoning_content: 'more' } }],
          }),
        ),
      ].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'q' }]);
      const { chunks } = await collectStream(gen);

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ content: null, reasoning: 'thinking...' });
      expect(chunks[1]).toEqual({ content: 'answer', reasoning: 'more' });
    });

    it('should capture usage from SSE and return it', async () => {
      const stream = [
        sseLine(
          JSON.stringify({
            choices: [{ delta: { content: 'hi' } }],
          }),
        ),
        sseLine(
          JSON.stringify({
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        ),
        sseLine('[DONE]'),
      ].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { result } = await collectStream(gen);

      expect(result).toEqual({ input: 100, output: 50 });
    });

    it('should default prompt_tokens/completion_tokens to 0 when usage is present but fields missing', async () => {
      const stream = [sseLine(JSON.stringify({ usage: {} })), sseLine('[DONE]')].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { result } = await collectStream(gen);

      expect(result).toEqual({ input: 0, output: 0 });
    });

    it('should skip [DONE] markers and non-data lines', async () => {
      const stream = [
        ': comment line\n',
        sseLine(JSON.stringify({ choices: [{ delta: { content: 'A' } }] })),
        sseLine('[DONE]'),
        'event: ping\n',
      ].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { chunks } = await collectStream(gen);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ content: 'A', reasoning: null });
    });

    it('should skip invalid JSON data lines without failing', async () => {
      const stream = [
        sseLine('{invalid json}'),
        sseLine(JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })),
      ].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { chunks } = await collectStream(gen);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('ok');
    });

    it('should skip events with empty choices array', async () => {
      const stream = [
        sseLine(JSON.stringify({ choices: [] })),
        sseLine(JSON.stringify({ choices: [{ delta: { content: 'x' } }] })),
      ].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { chunks } = await collectStream(gen);

      expect(chunks).toHaveLength(1);
    });

    it('should skip events where choices[0].delta is missing', async () => {
      const stream = [
        sseLine(JSON.stringify({ choices: [{}] })),
        sseLine(JSON.stringify({ choices: [{ delta: { content: 'y' } }] })),
      ].join('');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { chunks } = await collectStream(gen);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('y');
    });

    it('should handle buffer splitting across multiple chunks', async () => {
      // Split a single SSE event across two chunks
      const part1 = encode('data: {"choices":[{"delta":{"content":"sp');
      const part2 = encode('lit"}}]}\n data: [DONE]\n');

      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [part1, part2] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { chunks } = await collectStream(gen);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('split');
    });

    it('should handle empty stream (no data lines)', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode('')] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const { chunks, result } = await collectStream(gen);

      expect(chunks).toHaveLength(0);
      // Falls back to estimated input tokens
      expect(result).not.toBeNull();
      expect(result!.input).toBeGreaterThan(0);
      expect(result!.output).toBe(0);
    });

    it('should send correct request body to fetch', async () => {
      const stream = sseLine('[DONE]');
      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];
      const gen = streamChat(messages);
      await collectStream(gen);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test.com/v1/chat/completions');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers.Authorization).toBe('Bearer test-key');

      const body = JSON.parse(init.body);
      expect(body.model).toBe('test-model');
      expect(body.stream).toBe(true);
      expect(body.stream_options).toEqual({ include_usage: true });
      expect(body.max_tokens).toBe(4096);
      expect(body.temperature).toBe(0.7);
      expect(body.top_p).toBe(0.7);
      expect(body.top_k).toBe(50);
      expect(body.frequency_penalty).toBe(1);
      expect(body.messages).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ]);
    });

    it('should use config defaults when chat options are missing', async () => {
      mockLoadConfig.mockReturnValueOnce({
        api: {
          baseURL: 'https://api.test.com/v1',
          apiKey: 'k',
          model: 'm',
          provider: 'p',
        },
        // chat entirely missing → defaults kick in
      });

      const stream = sseLine('[DONE]');
      fetchMock.mockResolvedValueOnce(makeResponse({ chunks: [encode(stream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      await collectStream(gen);

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.max_tokens).toBe(131072);
      expect(body.temperature).toBe(0.7);
      expect(body.top_p).toBe(0.7);
      expect(body.top_k).toBe(50);
      expect(body.frequency_penalty).toBe(1);
    });
  });

  describe('streamChat - HTTP errors', () => {
    it('should throw on non-OK HTTP response without retrying', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: 'invalid request body',
        }),
      );

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const result = await collectStream(gen).catch((e) => e);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('API 400');
      expect((result as Error).message).toContain('invalid request body');
      // Should NOT retry on HTTP errors
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should handle response.text() rejection by using empty string', async () => {
      // 使用 400（非重试状态码）而非 500：500 现在会触发 5xx 重试逻辑，
      // 而本测试关注的是 text() 拒绝时的兜底处理，不应混入重试行为。
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
        text: async () => {
          throw new Error('cannot read');
        },
      });

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const result = await collectStream(gen).catch((e) => e);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('API 400');
    });
  });

  describe('streamChat - network error retries', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Suppress retry log noise from source code
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('should retry on network error and succeed on second attempt', async () => {
      const networkError: any = new Error('network request failed');
      networkError.code = 'ECONNREFUSED';

      const successStream =
        sseLine(JSON.stringify({ choices: [{ delta: { content: 'recovered' } }] })) +
        sseLine('[DONE]');

      fetchMock
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(makeResponse({ chunks: [encode(successStream)] }));

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);

      // Advance past the first retry delay (2s)
      await jest.advanceTimersByTimeAsync(3000);

      const { chunks } = await collectPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('recovered');
    });

    it('should retry with exponential backoff (2s, 4s, 8s, 16s) and exhaust after 5 attempts', async () => {
      const error: any = new Error('Premature close');
      fetchMock.mockRejectedValue(error); // always fails with network error

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);
      // Attach rejection handler BEFORE advancing timers to avoid unhandled rejection
      const assertion = expect(collectPromise).rejects.toThrow('Premature close');

      // Total backoff: 2+4+8+16 = 30s; advance past everything
      await jest.advanceTimersByTimeAsync(60000);
      await assertion;
      // 1 initial + 4 retries = 5 attempts
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('should throw immediately for non-network errors without retrying', async () => {
      const error = new Error('something weird happened');
      fetchMock.mockRejectedValue(error);

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);

      // No timers should be pending; should reject immediately
      await expect(collectPromise).rejects.toThrow('something weird happened');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should detect timeout errors as network errors', async () => {
      const error: any = new Error('request timeout');
      fetchMock.mockRejectedValue(error);

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);
      const assertion = expect(collectPromise).rejects.toThrow('request timeout');

      await jest.advanceTimersByTimeAsync(60000);
      await assertion;
      // Should have retried (timeout is a network error)
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('should detect ETIMEDOUT code as network error', async () => {
      const error: any = new Error('socket hang up');
      error.code = 'ETIMEDOUT';
      fetchMock.mockRejectedValue(error);

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);
      const assertion = expect(collectPromise).rejects.toThrow('socket hang up');

      await jest.advanceTimersByTimeAsync(60000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('should detect ECONNRESET code as network error', async () => {
      const error: any = new Error('reset');
      error.code = 'ECONNRESET';
      fetchMock.mockRejectedValue(error);

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);
      const assertion = expect(collectPromise).rejects.toThrow('reset');

      await jest.advanceTimersByTimeAsync(60000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('should detect ENOTFOUND code as network error', async () => {
      const error: any = new Error('dns fail');
      error.code = 'ENOTFOUND';
      fetchMock.mockRejectedValue(error);

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);
      const assertion = expect(collectPromise).rejects.toThrow('dns fail');

      await jest.advanceTimersByTimeAsync(60000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('should detect premature_close in message as network error', async () => {
      const error = new Error('premature_close detected');
      fetchMock.mockRejectedValue(error);

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);
      const assertion = expect(collectPromise).rejects.toThrow('premature_close detected');

      await jest.advanceTimersByTimeAsync(60000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('should recover after multiple retries', async () => {
      const error: any = new Error('ECONNREFUSED');
      fetchMock
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(
          makeResponse({
            chunks: [
              encode(
                sseLine(JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })) +
                  sseLine('[DONE]'),
              ),
            ],
          }),
        );

      const gen = streamChat([{ role: 'user', content: 'hi' }]);
      const collectPromise = collectStream(gen);

      // 2s (first retry) + 4s (second retry) = 6s
      await jest.advanceTimersByTimeAsync(10000);

      const { chunks } = await collectPromise;
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(chunks[0].content).toBe('ok');
    });
  });
});
