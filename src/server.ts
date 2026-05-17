#!/usr/bin/env node
/**
 * open-design-mcp — stdio MCP server.
 *
 * v0.1.0: scaffold only. Registers zero tools. Accepts MCP `initialize`,
 * `tools/list`, and `notifications/initialized`. Returns JSON-RPC -32601
 * for unknown methods. Exits cleanly on SIGINT and SIGTERM.
 *
 * Tool implementations and the BYOK pipeline land in follow-up changes.
 * See README.md and docs/HARNESS.md for the engineering workflow.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const SERVER_NAME = 'open-design-mcp';
const SERVER_VERSION = '0.1.0';

async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Advertise an empty tools surface so clients can call tools/list without
  // hitting -32601 (Method not found). McpServer only auto-registers the
  // tools capability once registerTool() is called; this PR ships zero tools
  // so we register the capability explicitly.
  server.server.registerCapabilities({ tools: { listChanged: false } });
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));

  const transport = new StdioServerTransport();

  const shutdown = (signal: string): void => {
    // stderr is safe — stdout is reserved for MCP JSON-RPC traffic.
    process.stderr.write(`[${SERVER_NAME}] received ${signal}, shutting down\n`);
    // close() returns a promise but we exit immediately after to satisfy
    // the 2-second shutdown bound; the SDK closes transport synchronously
    // before resolving in practice.
    void transport.close().catch(() => {
      /* swallow close errors during shutdown */
    });
    setTimeout(() => process.exit(0), 50);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.stderr.write(`[${SERVER_NAME}] starting on stdio\n`);
  await server.connect(transport);
  process.stderr.write(`[${SERVER_NAME}] ready\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`[${SERVER_NAME}] fatal: ${String(err)}\n`);
  process.exit(1);
});
