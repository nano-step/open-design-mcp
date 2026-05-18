import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { registerListProjects } from './list-projects.js';
import { registerGetProject } from './get-project.js';
import { registerCreateProject } from './create-project.js';
import { registerUpdateProject } from './update-project.js';
import { registerDeleteProject } from './delete-project.js';
import { registerSaveArtifact } from './save-artifact.js';
import { registerLintArtifact } from './lint-artifact.js';
import { registerGenerateDesign } from './generate-design.js';

export function registerAllTools(
  server: McpServer,
  client: OdClient,
  generateTimeoutMs: number,
): void {
  registerListProjects(server, client);
  registerGetProject(server, client);
  registerCreateProject(server, client);
  registerUpdateProject(server, client);
  registerDeleteProject(server, client);
  registerSaveArtifact(server, client);
  registerLintArtifact(server, client);
  registerGenerateDesign(server, client, generateTimeoutMs);
}
