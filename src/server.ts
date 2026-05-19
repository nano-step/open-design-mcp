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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadCoreConfig } from './config.js';
import { OdClient } from './od-client.js';
import { registerAllTools } from './tools/index.js';

const SERVER_NAME = 'open-design-mcp';

function tryReadOwnPackageVersion(startDir: string): string | null {
  for (const rel of ['..', '../..', '../../..']) {
    const candidate = resolve(startDir, rel, 'package.json');
    let raw: string;
    try {
      raw = readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { name?: unknown }).name === SERVER_NAME &&
      typeof (parsed as { version?: unknown }).version === 'string'
    ) {
      return (parsed as { version: string }).version;
    }
  }
  return null;
}

const SERVER_VERSION =
  tryReadOwnPackageVersion(dirname(fileURLToPath(import.meta.url))) ?? 'unknown';

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
