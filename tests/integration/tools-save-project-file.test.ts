import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { startMockOdServer, respondJson, type MockOdServer } from './helpers/od-mock-server.js';

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

describe('od_save_project_file — integration', () => {
  let mock: MockOdServer;
  let server: ChildProcessWithoutNullStreams;
  let nextId = 1;
  const responses = new Map<number, (resp: JsonRpcResponse) => void>();
  let buffer = '';

  beforeAll(async () => {
    mock = await startMockOdServer();

    server = spawn(
      'node',
      [resolve(process.cwd(), 'dist/src/server.js')],
      {
        env: {
          ...process.env,
          OD_DAEMON_URL: mock.url,
          OD_API_TOKEN: '',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

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

    await new Promise<void>((resolve) => {
      const onErr = (chunk: Buffer): void => {
        if (chunk.toString('utf8').includes('ready')) {
          server.stderr.off('data', onErr);
          resolve();
        }
      };
      server.stderr.on('data', onErr);
    });

    const initResp = await send({
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'integration-test-save-project-file', version: '0' },
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
      const timer = setTimeout(() => reject(new Error(`timeout waiting for id ${id}`)), 5000);
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

  it('tools/list returns 13 tools including od_save_project_file', async () => {
    const resp = await send({ method: 'tools/list' });
    const result = resp.result as { tools: Array<{ name: string }> };
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toContain('od_save_project_file');
    expect(names).toHaveLength(13);
  });

  it('od_save_project_file happy path — body round-trips and result contains saved file', async () => {
    let receivedBody = '';

    mock.handle('POST', /^\/api\/projects\/demo\/files$/, (_req, res, body) => {
      receivedBody = body;
      respondJson(res, 200, {
        file: {
          name: 'index.html',
          path: 'index.html',
          size: 32400,
          mtime: 1779175480773.302,
          kind: 'html',
          mime: 'text/html; charset=utf-8',
          artifactKind: 'html',
          artifactManifest: {
            version: 1,
            kind: 'html',
            title: 'index.html',
            entry: 'index.html',
            renderer: 'html',
            status: 'complete',
            exports: ['html', 'pdf', 'zip'],
            metadata: { inferred: true },
          },
        },
      });
    });

    const htmlContent = '<html><body>Hello OD</body></html>';
    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_save_project_file',
        arguments: {
          projectId: 'demo',
          name: 'index.html',
          content: htmlContent,
        },
      },
    });

    const parsed = JSON.parse(receivedBody) as { name: string; content: string };
    expect(parsed).toEqual({ name: 'index.html', content: htmlContent });

    const result = resp.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Saved: index.html');
  });
});
