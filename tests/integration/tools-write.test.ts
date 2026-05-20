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

describe('write tools (PR-D) — integration', () => {
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
        clientInfo: { name: 'integration-test-write', version: '0' },
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

  it('tools/list returns all 13 tools', async () => {
    const resp = await send({ method: 'tools/list' });
    const result = resp.result as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'od_compose_brief',
      'od_create_project',
      'od_delete_project',
      'od_extract_design_system',
      'od_generate_design',
      'od_generate_design_system',
      'od_get_project',
      'od_lint_artifact',
      'od_list_projects',
      'od_save_artifact',
      'od_save_project_file',
      'od_update_design_system',
      'od_update_project',
    ]);
  });

  it('od_save_artifact happy path — returns path and URL', async () => {
    mock.handle('POST', '/api/artifacts/save', (req, res, body) => {
      const parsed = JSON.parse(body) as { identifier: string; title: string; html: string };
      expect(parsed.identifier).toBe('my-slug');
      expect(parsed.title).toBeDefined();
      expect(parsed.html).toBeDefined();
      respondJson(res, 200, {
        url: `http://127.0.0.1/artifacts/${parsed.identifier}/index.html`,
        path: `/od/artifacts/${parsed.identifier}/index.html`,
      });
    });

    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_save_artifact',
        arguments: {
          identifier: 'my-slug',
          title: 'My Artifact',
          html: '<html><body>Hello</body></html>',
        },
      },
    });

    const result = resp.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('my-slug');
    expect(result.content[0].text).toContain('/od/artifacts/my-slug/index.html');
  });

  it('od_save_artifact with invalid identifier — SDK rejects at validation boundary', async () => {
    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_save_artifact',
        arguments: {
          identifier: 'BAD ID',
          title: 'My Artifact',
          html: '<html/>',
        },
      },
    });

    const isJsonRpcError = resp.error != null;
    const isToolError =
      resp.result != null &&
      (resp.result as { isError?: boolean }).isError === true;

    expect(isJsonRpcError || isToolError).toBe(true);
  });

  it('od_save_artifact 422 — isError true, text contains "422"', async () => {
    mock.handle('POST', '/api/artifacts/save', (_req, res) => {
      res.statusCode = 422;
      res.statusMessage = 'Unprocessable Entity';
      res.end('duplicate identifier');
    });

    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_save_artifact',
        arguments: {
          identifier: 'dup-slug',
          title: 'Dup',
          html: '<html/>',
        },
      },
    });

    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('422');
  });

  it('od_lint_artifact happy path with findings — returns formatted text', async () => {
    mock.handle('POST', '/api/artifacts/lint', (_req, res) => {
      respondJson(res, 200, {
        findings: [
          { severity: 'warning', message: 'missing alt', path: 'a.html', line: 5 },
          { severity: 'error', message: 'bad nesting' },
        ],
        agentMessage: 'fix it',
      });
    });

    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_lint_artifact',
        arguments: { html: '<html><img></html>' },
      },
    });

    const result = resp.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('Lint: 2 finding(s):');
    expect(text).toContain('a.html:5');
    expect(text).toContain('missing alt');
    expect(text).toContain('[error]');
    expect(text).toContain('bad nesting');
    expect(text).toContain('Agent: fix it');
  });

  it('od_lint_artifact with no findings — returns "Lint: 0 findings."', async () => {
    mock.handle('POST', '/api/artifacts/lint', (_req, res) => {
      respondJson(res, 200, { findings: [] });
    });

    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_lint_artifact',
        arguments: { html: '<html><body>Clean</body></html>' },
      },
    });

    const result = resp.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toBe('Lint: 0 findings.');
  });

  it('od_lint_artifact 500 — isError true, mentions OD daemon error', async () => {
    mock.handle('POST', '/api/artifacts/lint', (_req, res) => {
      res.statusCode = 500;
      res.statusMessage = 'Internal Server Error';
      res.end('boom');
    });

    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_lint_artifact',
        arguments: { html: '<html/>' },
      },
    });

    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('od daemon error');
  });

  it('od_compose_brief happy path — formats Turn 3 prompt', async () => {
    const resp = await send({
      method: 'tools/call',
      params: {
        name: 'od_compose_brief',
        arguments: {
          pagePrompt: 'Pricing page with 3 tiers',
          briefAnswers: {
            output: 'Pricing table',
            platform: ['Responsive web'],
          },
          brandSpec: '# Brand\nAccent: blue',
        },
      },
    });

    const result = resp.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('[form answers — discovery]');
    expect(text).toContain('- output: Pricing table');
    expect(text).toContain('- platform: Responsive web');
    expect(text).toContain('[brand spec]');
    expect(text).toContain('# Brand');
    expect(text).toContain('[page brief]');
    expect(text).toContain('Pricing page with 3 tiers');
  });
});
