import { WebSocketServer, WebSocket } from 'ws';

const WS_PORT = 19528;
const TEST_TIMEOUT = 30000;

describe('WebSocket Communication E2E', () => {
  let wss;
  const clients = [];

  beforeAll(async () => {
    return new Promise((resolve, reject) => {
      wss = new WebSocketServer({ port: WS_PORT });

      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
          if (message.type === 'echo') {
            ws.send(JSON.stringify({ type: 'echo_response', data: message.data }));
          }
        });

        ws.on('close', () => {
          // connection closed
        });
      });

      wss.on('listening', resolve);
      wss.on('error', reject);
    });
  });

  afterAll(async () => {
    // Close all client connections
    for (const client of clients) {
      if (client && client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    clients.length = 0;

    // Close server
    return new Promise((resolve) => {
      if (wss) {
        wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  const createClient = () => {
    const client = new WebSocket(`ws://localhost:${WS_PORT}`);
    clients.push(client);
    return client;
  };

  test('should connect to WebSocket server', async () => {
    const client = createClient();

    await new Promise((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });

    expect(client.readyState).toBe(WebSocket.OPEN);
  }, TEST_TIMEOUT);

  test('should send and receive ping/pong', async () => {
    const client = createClient();

    await new Promise((resolve) => {
      client.on('open', resolve);
    });

    const response = await new Promise((resolve) => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'pong') {
          resolve(message);
        }
      });
      client.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    });

    expect(response.type).toBe('pong');
    expect(response.timestamp).toBeDefined();
  }, TEST_TIMEOUT);

  test('should handle echo message', async () => {
    const client = createClient();

    await new Promise((resolve) => {
      client.on('open', resolve);
    });

    const testData = { message: 'hello', id: 123 };
    const response = await new Promise((resolve) => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'echo_response') {
          resolve(message);
        }
      });
      client.send(JSON.stringify({ type: 'echo', data: testData }));
    });

    expect(response.type).toBe('echo_response');
    expect(response.data).toEqual(testData);
  }, TEST_TIMEOUT);

  test('should handle multiple concurrent connections', async () => {
    const localClients = [];

    const connectionPromises = [];
    for (let i = 0; i < 5; i++) {
      const client = new WebSocket(`ws://localhost:${WS_PORT}`);
      localClients.push(client);
      clients.push(client);
      connectionPromises.push(
        new Promise((resolve, reject) => {
          client.on('open', resolve);
          client.on('error', reject);
        })
      );
    }

    await Promise.all(connectionPromises);

    localClients.forEach((client) => {
      expect(client.readyState).toBe(WebSocket.OPEN);
    });
  }, TEST_TIMEOUT);

  test('should close connection gracefully', async () => {
    const client = createClient();

    await new Promise((resolve) => {
      client.on('open', resolve);
    });

    const closePromise = new Promise((resolve) => {
      client.on('close', resolve);
    });

    client.close();
    await closePromise;

    expect(client.readyState).toBe(WebSocket.CLOSED);
  }, TEST_TIMEOUT);

  test('should handle rapid send/receive', async () => {
    const client = createClient();

    await new Promise((resolve) => {
      client.on('open', resolve);
    });

    const messages = [];
    const sendCount = 10;

    const receivePromise = new Promise((resolve) => {
      let received = 0;
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'pong') {
          messages.push(message);
          received++;
          if (received === sendCount) {
            resolve(messages);
          }
        }
      });
    });

    for (let i = 0; i < sendCount; i++) {
      client.send(JSON.stringify({ type: 'ping', index: i }));
    }

    const receivedMessages = await receivePromise;
    expect(receivedMessages.length).toBe(sendCount);
  }, TEST_TIMEOUT);
});
