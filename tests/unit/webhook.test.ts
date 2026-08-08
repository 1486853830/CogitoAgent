import http from 'http';
import { jest } from '@jest/globals';
import { startWebhookServer, stopWebhookServer } from '../../src/io/webhook.ts';

const TEST_PORT = 19529;

interface HttpResponse {
  status: number;
  body: string;
}

function request(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers, agent: false }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString('utf-8');
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('io/webhook.ts', () => {
  const onTrigger = jest.fn();

  beforeEach(async () => {
    onTrigger.mockClear();
    await stopWebhookServer();
  });

  afterAll(async () => {
    await stopWebhookServer();
  });

  it('should reject requests without a token', async () => {
    await startWebhookServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      token: 'secret-token',
      onTrigger,
    });

    const res = await request(
      `http://127.0.0.1:${TEST_PORT}/webhook/trigger`,
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ text: 'hello' }),
    );
    expect(res.status).toBe(401);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('should reject requests with a wrong token', async () => {
    await startWebhookServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      token: 'secret-token',
      onTrigger,
    });

    const res = await request(
      `http://127.0.0.1:${TEST_PORT}/webhook/trigger`,
      'POST',
      {
        'Content-Type': 'application/json',
        'x-webhook-token': 'wrong-token',
      },
      JSON.stringify({ text: 'hello' }),
    );
    expect(res.status).toBe(401);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('should accept valid Bearer token and deliver the payload', async () => {
    await startWebhookServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      token: 'secret-token',
      onTrigger,
    });

    const res = await request(
      `http://127.0.0.1:${TEST_PORT}/webhook/trigger`,
      'POST',
      {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token',
      },
      JSON.stringify({ text: 'deploy the app', sessionKey: 's1', channel: 'ci' }),
    );
    expect(res.status).toBe(200);
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(onTrigger).toHaveBeenCalledWith({
      text: 'deploy the app',
      sessionKey: 's1',
      channel: 'ci',
      metadata: undefined,
    });
  });

  it('should accept valid x-webhook-token header', async () => {
    await startWebhookServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      token: 'secret-token',
      onTrigger,
    });

    const res = await request(
      `http://127.0.0.1:${TEST_PORT}/webhook/trigger`,
      'POST',
      {
        'Content-Type': 'application/json',
        'x-webhook-token': 'secret-token',
      },
      JSON.stringify({ text: 'hello' }),
    );
    expect(res.status).toBe(200);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('should reject payloads without a text field', async () => {
    await startWebhookServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      token: 'secret-token',
      onTrigger,
    });

    const res = await request(
      `http://127.0.0.1:${TEST_PORT}/webhook/trigger`,
      'POST',
      {
        'Content-Type': 'application/json',
        'x-webhook-token': 'secret-token',
      },
      JSON.stringify({ foo: 'bar' }),
    );
    expect(res.status).toBe(400);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('should reject malformed JSON', async () => {
    await startWebhookServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      token: 'secret-token',
      onTrigger,
    });

    const res = await request(
      `http://127.0.0.1:${TEST_PORT}/webhook/trigger`,
      'POST',
      {
        'Content-Type': 'application/json',
        'x-webhook-token': 'secret-token',
      },
      '{not-json',
    );
    expect(res.status).toBe(400);
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
