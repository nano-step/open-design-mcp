import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import {
  startMockOdServer,
  respondJson,
  respondSse,
  type MockOdServer,
} from './helpers/od-mock-server.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function spawnServer(
  mockUrl: string,
  byokEnv: Record<string, string> = {},
): { server: ChildProcessWithoutNullStreams; ready: Promise<void> } {
  const server = spawn('node', [resolve(process.cwd(), 'dist/src/server.js')], {
    env: {
      ...process.env,
      OD_DAEMON_URL: mockUrl,
      OD_API_TOKEN: '',
      BYOK_BASE_URL: 'http://byok.test/v1',
      BYOK_API_KEY: 'sk-integration-test',
      BYOK_MODEL: 'open-design',
      BYOK_PROVIDER: 'openai',
      ...byokEnv,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const ready = new Promise<void>((resolve) => {
    const onErr = (chunk: Buffer): void => {
      if (chunk.toString('utf8').includes('ready')) {
        server.stderr.off('data', onErr);
        resolve();
      }
    };
    server.stderr.on('data', onErr);
  });

  return { server, ready };
}

describe('BYOK tools — integration', () => {
  let mock: MockOdServer;
  let server: ChildProcessWithoutNullStreams;
  let nextId = 1;
  const responses = new Map<number, (resp: JsonRpcResponse) => void>();
  let buffer = '';

  beforeAll(async () => {
    mock = await startMockOdServer();

    const spawned = spawnServer(mock.url);
    server = spawned.server;

    server.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          const cb = responses.get(msg.id);
          if (cb) {
            responses.delete(msg.id);
            cb(msg);
          }
        } catch {
          /* ignore non-JSON lines */
        }
      }
    });

    await spawned.ready;

    const initResp = await send({
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'integration-test-byok', version: '0' },
      },
    });
    expect(initResp.result).toBeDefined();
    await sendNotification({ method: 'notifications/initialized' });
  }, 15_000);

  afterAll(async () => {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 100));
    await mock.close();
  });

  beforeEach(() => {
    mock.reset();
  });

  async function send(req: Omit<JsonRpcRequest, 'jsonrpc' | 'id'>): Promise<JsonRpcResponse> {
    const id = nextId++;
    const full: JsonRpcRequest = { jsonrpc: '2.0', id, ...req };
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for id ${id}`)), 10_000);
      responses.set(id, (resp) => {
        clearTimeout(timer);
        resolve(resp);
      });
      server.stdin.write(JSON.stringify(full) + '\n');
    });
  }

  async function sendNotification(req: { method: string; params?: unknown }): Promise<void> {
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...req }) + '\n');
  }

  it('1. tools/list returns 9 tool names (sorted)', async () => {
    const resp = await send({ method: 'tools/list' });
    const result = resp.result as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'od_compose_brief',
      'od_create_project',
      'od_delete_project',
      'od_generate_design',
      'od_get_project',
      'od_lint_artifact',
      'od_list_projects',
      'od_save_artifact',
      'od_update_project',
    ]);
  });

  it('2. happy path — mock OD streams SSE, tool returns concatenated text', async () => {
    mock.handle('POST', '/api/proxy/openai/stream', (_req, res) => {
      respondSse(res, [
        { event: 'start', data: { model: 'open-design' } },
        { event: 'delta', data: { delta: 'Hello' } },
        { event: 'delta', data: { delta: ' from' } },
        { event: 'delta', data: { delta: ' OD!' } },
        { event: 'end', data: {} },
      ]);
    });

    const resp = await send({
      method: 'tools/call',
      params: { name: 'od_generate_design', arguments: { prompt: 'Create a prototype' } },
    });
    const result = resp.result as { content: Array<{ type: string; text: string }>; isError?: boolean };
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toBe('Hello from OD!');
  });

  it('3. missing BYOK — server without BYOK_API_KEY returns isError with BYOK not configured', async () => {
    const mock2 = await startMockOdServer();
    let buf2 = '';
    const nextId2 = { val: 1 };
    const responses2 = new Map<number, (resp: JsonRpcResponse) => void>();

    const spawned2 = spawnServer(mock2.url, {
      BYOK_BASE_URL: '',
      BYOK_API_KEY: '',
      BYOK_MODEL: '',
    });
    const server2 = spawned2.server;

    server2.stdout.on('data', (chunk: Buffer) => {
      buf2 += chunk.toString('utf8');
      let nl;
      while ((nl = buf2.indexOf('\n')) >= 0) {
        const line = buf2.slice(0, nl);
        buf2 = buf2.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          const cb = responses2.get(msg.id);
          if (cb) {
            responses2.delete(msg.id);
            cb(msg);
          }
        } catch {
          /* ignore */
        }
      }
    });

    await spawned2.ready;

    async function send2(req: Omit<JsonRpcRequest, 'jsonrpc' | 'id'>): Promise<JsonRpcResponse> {
      const id = nextId2.val++;
      const full: JsonRpcRequest = { jsonrpc: '2.0', id, ...req };
      return new Promise<JsonRpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for id ${id}`)), 10_000);
        responses2.set(id, (resp) => {
          clearTimeout(timer);
          resolve(resp);
        });
        server2.stdin.write(JSON.stringify(full) + '\n');
      });
    }

    const initResp = await send2({
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-no-byok', version: '0' },
      },
    });
    expect(initResp.result).toBeDefined();
    server2.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const resp = await send2({
      method: 'tools/call',
      params: { name: 'od_generate_design', arguments: { prompt: 'test' } },
    });

    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^BYOK not configured/);

    server2.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 100));
    await mock2.close();
  }, 20_000);

  it('4. OD returns 401 on proxy — tool result isError true, text is mode-aware (none mode)', async () => {
    mock.handle('POST', '/api/proxy/openai/stream', (_req, res) => {
      res.statusCode = 401;
      res.end('bad key');
    });

    const resp = await send({
      method: 'tools/call',
      params: { name: 'od_generate_design', arguments: { prompt: 'Test 401' } },
    });
    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    // Server runs without any auth env vars set → resolved mode is 'none'.
    // Per fix-401-mode-aware-hint (closes HB-12 / #25), the mapper now
    // points the user at OD_AUTH_MODE instead of OD_API_TOKEN.
    expect(result.content[0].text).toBe(
      'OD daemon returned 401 — set OD_AUTH_MODE and credentials',
    );
  });

  it('5. SSE error mid-stream — isError true, text contains error message', async () => {
    mock.handle('POST', '/api/proxy/openai/stream', (_req, res) => {
      respondSse(res, [
        { event: 'start', data: { model: 'open-design' } },
        { event: 'delta', data: { delta: 'partial' } },
        { event: 'error', data: { message: 'upstream provider error', code: '503' } },
        { event: 'end', data: {} },
      ]);
    });

    const resp = await send({
      method: 'tools/call',
      params: { name: 'od_generate_design', arguments: { prompt: 'Test error stream' } },
    });
    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('upstream provider error');
  });

  it('6. metadata.customInstructions round-trip — daemon omits top-level field (issue #43)', async () => {
    const marker = 'MARKER-7K3X-stash-roundtrip';
    let capturedSystemPrompt = '';

    mock.handle('GET', /^\/api\/projects\/proj-stash$/, (_req, res) => {
      respondJson(res, 200, {
        project: {
          id: 'proj-stash',
          name: 'Stash Test',
          skillId: null,
          designSystemId: null,
          createdAt: 0,
          updatedAt: 0,
          metadata: { kind: 'page', customInstructions: marker },
        },
        resolvedDir: '/tmp/proj-stash',
      });
    });

    mock.handle('POST', '/api/proxy/openai/stream', (_req, res, body) => {
      const parsed = JSON.parse(body) as { systemPrompt?: string };
      capturedSystemPrompt = parsed.systemPrompt ?? '';
      respondSse(res, [
        { event: 'start', data: { model: 'open-design' } },
        { event: 'delta', data: { delta: 'OK' } },
        { event: 'end', data: {} },
      ]);
    });

    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_generate_design',
        arguments: { prompt: 'Test stash', projectId: 'proj-stash' },
      },
    });
    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).not.toBe(true);
    expect(capturedSystemPrompt).toContain(marker);
  });

  it('7. od_generate_design forwards maxTokens to daemon proxy body (issue #36)', async () => {
    let capturedBody = '';

    mock.handle('POST', '/api/proxy/openai/stream', (_req, res, body) => {
      capturedBody = body;
      respondSse(res, [
        { event: 'start', data: { model: 'open-design' } },
        { event: 'delta', data: { delta: 'OK' } },
        { event: 'end', data: {} },
      ]);
    });

    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_generate_design',
        arguments: { prompt: 'Test maxTokens', maxTokens: 32_000 },
      },
    });
    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).not.toBe(true);

    const parsed = JSON.parse(capturedBody) as { maxTokens?: number };
    expect(parsed.maxTokens).toBe(32_000);
  });
});
