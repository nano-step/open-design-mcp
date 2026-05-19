import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startMockOdServer, type MockOdServer } from './helpers/od-mock-server.js';

const BIN = resolve(__dirname, '../../dist/src/server.js');
const PKG_VERSION = (
  JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
    version: string;
  }
).version;

let sharedMock: MockOdServer;
beforeAll(async () => {
  sharedMock = await startMockOdServer();
});
afterAll(async () => {
  await sharedMock.close();
});

describe('open-design-mcp initialize handshake', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
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
        OD_DAEMON_URL: sharedMock.url,
      },
    });
    client = new Client({ name: 'integration-test', version: '0.0.0' });
    await client.connect(transport);
  }, 15000);

  afterAll(async () => {
    await client?.close().catch(() => {});
  });

  it('reports the expected server identity', () => {
    const info = client.getServerVersion();
    expect(info).toBeDefined();
    expect(info?.name).toBe('open-design-mcp');
    expect(info?.version).toBe(PKG_VERSION);
    expect(info?.version).not.toBe('0.1.0');
  });

  it('advertises a valid protocol version', () => {
    const proto = client.getServerCapabilities();
    expect(proto).toBeDefined();
  });

  it('lists the 10 tools', async () => {
    const result = await client.listTools();
    expect(result.tools.map((t) => t.name).sort()).toEqual([
      'od_compose_brief',
      'od_create_project',
      'od_delete_project',
      'od_generate_design',
      'od_get_project',
      'od_lint_artifact',
      'od_list_projects',
      'od_save_artifact',
      'od_save_project_file',
      'od_update_project',
    ]);
  });

  it('rejects resources/list with -32601 (capability not advertised)', async () => {
    await expect(client.listResources()).rejects.toMatchObject({ code: -32601 });
  });
});

describe('open-design-mcp signal handling', () => {
  it(
    'shuts down gracefully on SIGINT within 2 seconds',
    async () => {
      if (!existsSync(BIN)) {
        throw new Error(`Built binary not found at ${BIN}. Run \`npm run build\` first.`);
      }
      const child = spawn('node', [BIN], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, OD_DAEMON_URL: sharedMock.url },
      });
      const pid = child.pid!;
      expect(pid).toBeGreaterThan(0);

      await new Promise<void>((resolveReady, rejectReady) => {
        const readyTimeout = setTimeout(() => {
          child.kill('SIGKILL');
          rejectReady(new Error('server did not emit ready within 5s'));
        }, 5000);
        child.stderr.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('[open-design-mcp] ready')) {
            clearTimeout(readyTimeout);
            resolveReady();
          }
        });
        child.on('exit', () => {
          clearTimeout(readyTimeout);
          rejectReady(new Error('server exited before ready'));
        });
      });

      const signaledAt = Date.now();
      child.kill('SIGINT');

      const exitCode = await new Promise<number | null>((resolveExit) => {
        child.on('exit', (code) => resolveExit(code));
      });
      const elapsed = Date.now() - signaledAt;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(2000);
      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
    },
    5000,
  );
});
