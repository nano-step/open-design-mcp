import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SOURCE = resolve(__dirname, '../server.ts');

describe('server.ts source invariants', () => {
  const source = readFileSync(SERVER_SOURCE, 'utf8');

  it('starts with the node shebang line', () => {
    const firstLine = source.split('\n', 1)[0];
    expect(firstLine).toBe('#!/usr/bin/env node');
  });

  it('contains no console.log calls', () => {
    expect(source).not.toMatch(/console\.log\s*\(/);
  });

  it('imports McpServer and StdioServerTransport from the SDK', () => {
    expect(source).toMatch(/from '@modelcontextprotocol\/sdk\/server\/mcp\.js'/);
    expect(source).toMatch(/from '@modelcontextprotocol\/sdk\/server\/stdio\.js'/);
  });

  it('handles SIGINT and SIGTERM', () => {
    expect(source).toMatch(/process\.on\('SIGINT'/);
    expect(source).toMatch(/process\.on\('SIGTERM'/);
  });

  it('uses stderr for status messages, never stdout', () => {
    expect(source).toMatch(/process\.stderr\.write/);
    expect(source).not.toMatch(/process\.stdout\.write/);
  });

  it('wires the tool orchestrator registerAllTools', () => {
    expect(source).toContain('registerAllTools(server, client,');
  });

  it('loads core config via loadCoreConfig()', () => {
    expect(source).toContain('loadCoreConfig()');
  });

  it('instantiates OdClient', () => {
    expect(source).toContain('new OdClient(');
  });

  it('does not use the old empty-tools workaround', () => {
    expect(source).not.toContain('setRequestHandler(ListToolsRequestSchema');
  });
});

describe('stubs', () => {
  it('od-client exports OdClient class', async () => {
    const mod = await import('../od-client.js');
    expect(typeof mod.OdClient).toBe('function');
    expect(typeof mod.OdHttpError).toBe('function');
  });
});
