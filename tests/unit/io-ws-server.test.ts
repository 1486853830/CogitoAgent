import { jest } from '@jest/globals';

// --- Mock ws module ---
let lastServerInstance: any = null;

class MockClient {
  readyState = 1;
  send = jest.fn();
  close = jest.fn();
  private handlers: Record<string, Function> = {};
  on(event: string, handler: Function) {
    this.handlers[event] = handler;
  }
  emit(event: string, ...args: any[]) {
    this.handlers[event]?.(...args);
  }
}

class MockWebSocketServer {
  options: any;
  clients: any[] = [];
  close = jest.fn();
  private handlers: Record<string, Function> = {};
  constructor(options: any, callback?: () => void) {
    this.options = options;
    lastServerInstance = this;
    if (callback) {
      process.nextTick(() => callback());
    }
  }
  on(event: string, handler: Function) {
    this.handlers[event] = handler;
    return this;
  }
  emit(event: string, ...args: any[]) {
    this.handlers[event]?.(...args);
  }
}

jest.unstable_mockModule('ws', () => ({
  WebSocketServer: MockWebSocketServer,
}));

const { startWsServer, broadcast, onMessage, onStatsRequest, stopWsServer, getWsToken } =
  await import('../../src/io/ws-server.ts');

function makeClient(readyState = 1): MockClient {
  const c = new MockClient();
  c.readyState = readyState;
  return c;
}

function flushMicrotasks() {
  return new Promise((r) => setImmediate(r));
}

describe('io/ws-server.ts', () => {
  let logSpy: jest.Spied<typeof console.log>;
  let errorSpy: jest.Spied<typeof console.error>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // reset module-level handlers and server state
    onMessage(null as any);
    onStatsRequest(null as any);
    stopWsServer();
    lastServerInstance = null;
  });

  afterEach(() => {
    stopWsServer();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('startWsServer', () => {
    it('should resolve with the WebSocketServer instance', async () => {
      const wss = await startWsServer(9527);
      expect(wss).toBe(lastServerInstance);
      stopWsServer();
    });

    it('should use 127.0.0.1 host and given port', async () => {
      await startWsServer(8888);
      expect(lastServerInstance.options.host).toBe('127.0.0.1');
      expect(lastServerInstance.options.port).toBe(8888);
      stopWsServer();
    });

    it('should default to port 9527', async () => {
      await startWsServer();
      expect(lastServerInstance.options.port).toBe(9527);
      stopWsServer();
    });

    it('should register connection and error handlers', async () => {
      await startWsServer();
      expect(lastServerInstance.handlers['error']).toBeInstanceOf(Function);
      expect(lastServerInstance.handlers['connection']).toBeInstanceOf(Function);
      stopWsServer();
    });
  });

  describe('verifyClient / origin validation', () => {
    it('should accept localhost origins', async () => {
      await startWsServer();
      const verifyClient = lastServerInstance.options.verifyClient;
      const cb = jest.fn();
      verifyClient({ origin: 'http://localhost:3000' }, cb);
      expect(cb).toHaveBeenCalledWith(true);
      stopWsServer();
    });

    it('should accept 127.0.0.1 origins', async () => {
      await startWsServer();
      const verifyClient = lastServerInstance.options.verifyClient;
      const cb = jest.fn();
      verifyClient({ origin: 'https://127.0.0.1:443' }, cb);
      expect(cb).toHaveBeenCalledWith(true);
      stopWsServer();
    });

    it('should accept file:// origins', async () => {
      await startWsServer();
      const verifyClient = lastServerInstance.options.verifyClient;
      const cb = jest.fn();
      verifyClient({ origin: 'file://' }, cb);
      expect(cb).toHaveBeenCalledWith(true);
      stopWsServer();
    });

    it('should reject undefined origin from non-local address', async () => {
      // 空 Origin + 非本机地址 → 拒绝（外部恶意进程）
      await startWsServer();
      const verifyClient = lastServerInstance.options.verifyClient;
      const cb = jest.fn();
      verifyClient({ origin: undefined, req: { socket: { remoteAddress: '10.0.0.5' } } }, cb);
      expect(cb).toHaveBeenCalledWith(false, 403, expect.any(String));
      stopWsServer();
    });

    it('should accept undefined origin from localhost address', async () => {
      // 空 Origin + 本机回环地址 + 有效 token → 放行（Node ws 客户端不发 Origin 但带 token）
      await startWsServer();
      const verifyClient = lastServerInstance.options.verifyClient;
      const cb = jest.fn();
      verifyClient(
        {
          origin: undefined,
          req: { socket: { remoteAddress: '127.0.0.1' }, url: `/?token=${getWsToken()}` },
        },
        cb,
      );
      expect(cb).toHaveBeenCalledWith(true);
      stopWsServer();
    });

    it('should fallback-allow when both origin and remoteAddress are missing', async () => {
      // 兜底：Origin 和 remoteAddress 都缺失时放行（服务绑定 127.0.0.1）
      await startWsServer();
      const verifyClient = lastServerInstance.options.verifyClient;
      const cb = jest.fn();
      verifyClient({ origin: undefined, req: {} }, cb);
      expect(cb).toHaveBeenCalledWith(true);
      stopWsServer();
    });

    it('should reject non-local origins with 403', async () => {
      await startWsServer();
      const verifyClient = lastServerInstance.options.verifyClient;
      const cb = jest.fn();
      verifyClient(
        { origin: 'http://evil.com', req: { socket: { remoteAddress: '10.0.0.5' } } },
        cb,
      );
      expect(cb).toHaveBeenCalledWith(false, 403, expect.any(String));
      expect(logSpy).toHaveBeenCalled();
      stopWsServer();
    });
  });

  describe('connection / message handling', () => {
    it('should invoke messageHandler for non-stats messages', async () => {
      await startWsServer();
      const handler = jest.fn();
      onMessage(handler);

      const client = makeClient();
      lastServerInstance.emit('connection', client, { socket: { remoteAddress: '127.0.0.1' } });

      // simulate incoming message
      const msg = { type: 'custom', data: 'hello' };
      client.emit('message', Buffer.from(JSON.stringify(msg)));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg, client);
      stopWsServer();
    });

    it('should log on client connect', async () => {
      await startWsServer();
      const client = makeClient();
      lastServerInstance.emit('connection', client, { socket: { remoteAddress: '127.0.0.1' } });
      expect(logSpy).toHaveBeenCalled();
      stopWsServer();
    });

    it('should route stats-request to statsHandler (sync result)', async () => {
      await startWsServer();
      const statsHandler = jest.fn(() => ({ count: 5 }));
      onStatsRequest(statsHandler);

      const client = makeClient();
      lastServerInstance.emit('connection', client, { socket: { remoteAddress: '::1' } });

      client.emit('message', Buffer.from(JSON.stringify({ type: 'stats-request', payload: {} })));

      expect(statsHandler).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(client.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('stats-response');
      expect(sent.count).toBe(5);
      stopWsServer();
    });

    it('should route stats-request to async statsHandler', async () => {
      await startWsServer();
      const statsHandler = jest.fn(() => Promise.resolve({ total: 10 }));
      onStatsRequest(statsHandler);

      const client = makeClient();
      lastServerInstance.emit('connection', client, { socket: { remoteAddress: '::1' } });

      client.emit('message', Buffer.from(JSON.stringify({ type: 'stats-request', payload: {} })));

      await flushMicrotasks();

      expect(statsHandler).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(client.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('stats-response');
      expect(sent.total).toBe(10);
      stopWsServer();
    });

    it('should not send response when statsHandler returns falsy', async () => {
      await startWsServer();
      const statsHandler = jest.fn(() => null);
      onStatsRequest(statsHandler);

      const client = makeClient();
      lastServerInstance.emit('connection', client, { socket: { remoteAddress: '::1' } });

      client.emit('message', Buffer.from(JSON.stringify({ type: 'stats-request', payload: {} })));

      expect(statsHandler).toHaveBeenCalledTimes(1);
      expect(client.send).not.toHaveBeenCalled();
      stopWsServer();
    });

    it('should handle invalid JSON messages gracefully', async () => {
      await startWsServer();
      const handler = jest.fn();
      onMessage(handler);

      const client = makeClient();
      lastServerInstance.emit('connection', client, { socket: { remoteAddress: '::1' } });

      client.emit('message', Buffer.from('not-json'));

      expect(handler).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      stopWsServer();
    });
  });

  describe('broadcast', () => {
    it('should send messages to all open clients', async () => {
      await startWsServer();
      const c1 = makeClient(1);
      const c2 = makeClient(1);
      lastServerInstance.clients.push(c1, c2);

      broadcast('update', { value: 1 });

      expect(c1.send).toHaveBeenCalledTimes(1);
      expect(c2.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(c1.send.mock.calls[0][0] as string);
      expect(sent.type).toBe('update');
      expect(sent.value).toBe(1);
      stopWsServer();
    });

    it('should skip clients that are not open (readyState !== 1)', async () => {
      await startWsServer();
      const open = makeClient(1);
      const closed = makeClient(3);
      lastServerInstance.clients.push(open, closed);

      broadcast('update', { value: 2 });

      expect(open.send).toHaveBeenCalledTimes(1);
      expect(closed.send).not.toHaveBeenCalled();
      stopWsServer();
    });

    it('should do nothing when server is not started', () => {
      // wss is null
      expect(() => broadcast('update', { value: 1 })).not.toThrow();
    });
  });

  describe('stopWsServer', () => {
    it('should close the server and clear state', async () => {
      await startWsServer();
      const instance = lastServerInstance;
      stopWsServer();
      expect(instance.close).toHaveBeenCalledTimes(1);
      // broadcast after stop should be a no-op (no throw, no clients)
      expect(() => broadcast('x', {})).not.toThrow();
    });

    it('should be safe to call when no server is running', () => {
      expect(() => stopWsServer()).not.toThrow();
    });
  });
});
