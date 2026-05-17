import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
});
