#!/usr/bin/env node
/**
 * open-design-mcp — stdio MCP server.
 *
 * Activates the OD daemon tool surface. Loads core config from env,
 * constructs an OdClient, registers all tools via registerAllTools,
 * then connects via stdio.
 *
 * Tools that require BYOK env vars (od_generate_design) validate them
 * lazily — server boots successfully with only OD_DAEMON_URL set.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadCoreConfig } from './config.js';
import { OdClient } from './od-client.js';
import { registerAllTools } from './tools/index.js';

const SERVER_NAME = 'open-design-mcp';
const SERVER_VERSION = '0.1.0';  // HB-5 — still hard-coded, separate change

async function main(): Promise<void> {
  // Eager core config validation. Process exits with friendly stderr on
  // missing/invalid OD_DAEMON_URL. (design §B2)
  const core = loadCoreConfig();
  const client = new OdClient(core.OD_DAEMON_URL, core.auth);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all available tools via the orchestrator (design §B12).
  // McpServer auto-advertises the tools capability once any tool is
  // registered, so we no longer need the explicit registerCapabilities()
  // call from the v0.1 scaffold.
  registerAllTools(server, client, core.OD_GENERATE_TIMEOUT_MS);

  const transport = new StdioServerTransport();

  const shutdown = (signal: string): void => {
    process.stderr.write(`[${SERVER_NAME}] received ${signal}, shutting down\n`);
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
