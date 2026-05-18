import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startMockOdServer, respondJson, type MockOdServer } from './helpers/od-mock-server.js';

const BIN = resolve(__dirname, '../../dist/src/server.js');

describe('project lifecycle tools — create → update → delete', () => {
  let mock: MockOdServer;
  let client: Client;
  let transport: StdioClientTransport;
  const receivedRequests: Array<{ method: string; url: string; body: string }> = [];

  beforeAll(async () => {
    if (!existsSync(BIN)) {
      throw new Error(`Built binary not found at ${BIN}. Run \`npm run build\` first.`);
    }

    mock = await startMockOdServer();

    mock.handle('POST', '/api/projects', (req, res, body) => {
      receivedRequests.push({ method: 'POST', url: req.url ?? '', body });
      const parsed = JSON.parse(body);
      respondJson(res, 200, {
        project: {
          id: parsed.id ?? 'lifecycle-test',
          name: parsed.name,
          skillId: null,
          designSystemId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        conversationId: 'conv-lifecycle-1',
      });
    });

    mock.handle('PATCH', /^\/api\/projects\/[^/]+$/, (req, res, body) => {
      receivedRequests.push({ method: 'PATCH', url: req.url ?? '', body });
      const parsed = JSON.parse(body);
      const id = (req.url ?? '').split('/').pop() ?? '';
      respondJson(res, 200, {
        project: {
          id,
          name: parsed.name ?? 'Original',
          skillId: null,
          designSystemId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        resolvedDir: `/tmp/od/${id}`,
      });
    });

    mock.handle('DELETE', /^\/api\/projects\/[^/]+$/, (req, res, _body) => {
      receivedRequests.push({ method: 'DELETE', url: req.url ?? '', body: _body });
      respondJson(res, 200, { ok: true });
    });

    transport = new StdioClientTransport({
      command: 'node',
      args: [BIN],
      env: {
        PATH: process.env.PATH ?? '',
        OD_DAEMON_URL: mock.url,
      },
    });
    client = new Client({ name: 'lifecycle-test', version: '0.0.0' });
    await client.connect(transport);
  }, 15_000);

  afterAll(async () => {
    await client?.close().catch(() => {});
    await mock?.close();
  });

  beforeEach(() => {
    receivedRequests.length = 0;
  });

  it('full create → update → delete cycle', async () => {
    // 1. Create
    const createResult = await client.callTool({
      name: 'od_create_project',
      arguments: { id: 'lifecycle-test', name: 'Lifecycle Test' },
    });
    const createContent = createResult.content as Array<{ type: string; text: string }>;
    expect(createResult.isError).not.toBe(true);
    expect(createContent[0].text).toContain('Created project');
    expect(createContent[0].text).toContain('conv-lifecycle-1');

    // 2. Update
    const updateResult = await client.callTool({
      name: 'od_update_project',
      arguments: { projectId: 'lifecycle-test', name: 'Updated Lifecycle' },
    });
    const updateContent = updateResult.content as Array<{ type: string; text: string }>;
    expect(updateResult.isError).not.toBe(true);
    expect(updateContent[0].text).toContain('Updated project');

    // 3. Delete
    const deleteResult = await client.callTool({
      name: 'od_delete_project',
      arguments: { projectId: 'lifecycle-test' },
    });
    const deleteContent = deleteResult.content as Array<{ type: string; text: string }>;
    expect(deleteResult.isError).not.toBe(true);
    expect(deleteContent[0].text).toContain('Deleted project: lifecycle-test');

    // 4. Verify mock received all three with correct HTTP methods
    expect(receivedRequests).toHaveLength(3);
    expect(receivedRequests[0].method).toBe('POST');
    expect(receivedRequests[0].url).toBe('/api/projects');
    expect(JSON.parse(receivedRequests[0].body)).toMatchObject({
      id: 'lifecycle-test',
      name: 'Lifecycle Test',
    });

    expect(receivedRequests[1].method).toBe('PATCH');
    expect(receivedRequests[1].url).toBe('/api/projects/lifecycle-test');
    expect(JSON.parse(receivedRequests[1].body)).toMatchObject({
      name: 'Updated Lifecycle',
    });

    expect(receivedRequests[2].method).toBe('DELETE');
    expect(receivedRequests[2].url).toBe('/api/projects/lifecycle-test');
  });
});
