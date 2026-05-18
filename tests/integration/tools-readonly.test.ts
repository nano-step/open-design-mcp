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
  error?: unknown;
}

describe('read-only tools (PR-C) — integration', () => {
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
        clientInfo: { name: 'integration-test', version: '0' },
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

  it('tools/list returns all 8 tools', async () => {
    const resp = await send({ method: 'tools/list' });
    const result = resp.result as { tools: Array<{ name: string }> };
    expect(result.tools.map((t) => t.name).sort()).toEqual([
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

  it('od_list_projects happy path returns mapped projects', async () => {
    mock.handle('GET', '/api/projects', (_req, res) => {
      respondJson(res, 200, {
        projects: [
          { id: 'p1', name: 'Hello', kind: 'prototype', statusInfo: { displayStatus: 'succeeded' } },
          { id: 'p2', name: 'World', kind: 'deck' },
        ],
      });
    });
    const resp = await send({
      method: 'tools/call',
      params: { name: 'od_list_projects', arguments: {} },
    });
    const result = resp.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { projects: Array<{ id: string }> };
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.projects).toHaveLength(2);
    expect(result.content[0].text).toContain('p1');
    expect(result.content[0].text).toContain('Hello');
  });

  it('od_list_projects 500 returns isError with friendly text', async () => {
    mock.handle('GET', '/api/projects', (_req, res) => {
      res.statusCode = 500;
      res.statusMessage = 'Internal Server Error';
      res.end('boom');
    });
    const resp = await send({
      method: 'tools/call',
      params: { name: 'od_list_projects', arguments: {} },
    });
    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('od daemon error');
  });

  it('od_get_project happy path merges project + files', async () => {
    mock.handle('GET', '/api/projects/p1', (_req, res) => {
      respondJson(res, 200, {
        project: { id: 'p1', name: 'Hello', kind: 'prototype' },
        resolvedDir: '/tmp/od/p1',
      });
    });
    mock.handle('GET', '/api/projects/p1/files', (_req, res) => {
      respondJson(res, 200, { files: [{ path: 'index.html' }, { path: 'style.css' }] });
    });
    const resp = await send({
      method: 'tools/call',
      params: { name: 'od_get_project', arguments: { projectId: 'p1' } },
    });
    const result = resp.result as {
      structuredContent: {
        project: { id: string };
        files: Array<{ path: string }>;
      };
      isError?: boolean;
    };
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.project.id).toBe('p1');
    expect(result.structuredContent.files.map((f) => f.path)).toEqual([
      'index.html',
      'style.css',
    ]);
  });

  it('od_get_project 404 returns friendly "Project not found"', async () => {
    mock.handle('GET', '/api/projects/missing', (_req, res) => {
      res.statusCode = 404;
      res.statusMessage = 'Not Found';
      res.end('no');
    });
    mock.handle('GET', '/api/projects/missing/files', (_req, res) => {
      res.statusCode = 404;
      res.end('no');
    });
    const resp = await send({
      method: 'tools/call',
      params: { name: 'od_get_project', arguments: { projectId: 'missing' } },
    });
    const result = resp.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found: missing');
  });
});
