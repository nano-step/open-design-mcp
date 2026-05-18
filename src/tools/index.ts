import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { registerListProjects } from './list-projects.js';
import { registerGetProject } from './get-project.js';
import { registerSaveArtifact } from './save-artifact.js';
import { registerLintArtifact } from './lint-artifact.js';

export function registerAllTools(server: McpServer, client: OdClient): void {
  registerListProjects(server, client);
  registerGetProject(server, client);
  registerSaveArtifact(server, client);
  registerLintArtifact(server, client);
}
