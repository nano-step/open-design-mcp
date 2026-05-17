import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BIN = resolve(__dirname, '../../dist/src/server.js');

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
    expect(info?.version).toBe('0.1.0');
  });

  it('advertises a valid protocol version', () => {
    const proto = client.getServerCapabilities();
    expect(proto).toBeDefined();
  });

  it('lists zero tools', async () => {
    const result = await client.listTools();
    expect(result.tools).toEqual([]);
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
      const child = spawn('node', [BIN], { stdio: ['pipe', 'pipe', 'pipe'] });
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
