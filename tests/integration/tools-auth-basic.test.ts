import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startMockOdServer, respondJson, type MockOdServer } from './helpers/od-mock-server.js';

const BIN = resolve(__dirname, '../../dist/src/server.js');

describe('basic-auth header reaches mock OD daemon', () => {
  let mock: MockOdServer;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    mock = await startMockOdServer();

    mock.handle('GET', '/api/projects', (_req, res) => {
      respondJson(res, 200, { projects: [{ id: 'p1', name: 'Test' }] });
    });

    if (!existsSync(BIN)) {
      throw new Error(
        `Built binary not found at ${BIN}. Run \`npm run build\` first.`,
      );
    }

    transport = new StdioClientTransport({
      command: 'node',
      args: [BIN],
      env: {
        PATH: process.env.PATH ?? '',
        OD_DAEMON_URL: mock.url,
        OD_AUTH_MODE: 'basic',
        OD_BASIC_USER: 'alice',
        OD_BASIC_PASS: 'secret',
      },
    });
    client = new Client({ name: 'auth-basic-test', version: '0.0.0' });
    await client.connect(transport);
  }, 15000);

  afterAll(async () => {
    await client?.close().catch(() => {});
    await mock?.close();
  });

  it('sends Authorization: Basic header to the mock daemon', async () => {
    const result = await client.callTool({ name: 'od_list_projects', arguments: {} });
    expect(result.isError).toBeFalsy();

    const expectedAuth = `Basic ${Buffer.from('alice:secret').toString('base64')}`;
    expect(mock.baseHeaders.authorization).toBe(expectedAuth);
  });
});
