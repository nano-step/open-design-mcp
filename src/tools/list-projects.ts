import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { mapErrorToToolResult } from './errors.js';

const inputSchema = z.object({});

const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string().optional(),
  status: z.string().optional(),
});

const outputSchema = z.object({
  projects: z.array(projectSummarySchema),
});

type Args = z.infer<typeof inputSchema>;
type Extra = { signal?: AbortSignal };

export function makeListProjectsHandler(client: OdClient) {
  return async function handleListProjects(
    _args: Args,
    extra: Extra,
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: { projects: Array<{ id: string; name: string; kind?: string; status?: string }> };
    isError?: true;
  }> {
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(30_000),
        extra?.signal ?? new AbortController().signal,
      ]);
      const res = await client.listProjects(signal);
      const projects = res.projects.map((p) => ({
        id: p.id,
        name: p.name,
        kind: (p as { kind?: string }).kind,
        status: (p as { statusInfo?: { displayStatus?: string } }).statusInfo?.displayStatus,
      }));

      const summary =
        projects.length === 0
          ? 'No projects found.'
          : `${projects.length} project(s):\n` +
            projects
              .map((p) => `- ${p.id}: ${p.name}${p.status ? ` [${p.status}]` : ''}`)
              .join('\n');

      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: { projects },
      };
    } catch (err) {
      return mapErrorToToolResult(err, client.authMode);
    }
  };
}

export function registerListProjects(server: McpServer, client: OdClient): void {
  const handler = makeListProjectsHandler(client);
  server.registerTool(
    'od_list_projects',
    {
      title: 'List Open Design projects',
      description:
        'List all projects from the configured Open Design daemon. Read-only; requires only OD_DAEMON_URL.',
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
    },
    handler,
  );
}
