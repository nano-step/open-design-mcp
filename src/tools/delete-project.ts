import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { mapErrorToToolResultWith404 } from './errors.js';

const inputSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
});

type Args = z.infer<typeof inputSchema>;
type Extra = { signal?: AbortSignal };

export function makeDeleteProjectHandler(client: OdClient) {
  return async function handleDeleteProject(
    args: Args,
    extra: Extra,
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: true;
  }> {
    const { projectId } = args;
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(30_000),
        extra?.signal ?? new AbortController().signal,
      ]);

      await client.deleteProject(projectId, signal);
      return {
        content: [{ type: 'text', text: `Deleted project: ${projectId}` }],
      };
    } catch (err) {
      return mapErrorToToolResultWith404(
        err,
        `Project not found: ${projectId}`,
        client.authMode,
      );
    }
  };
}

export function registerDeleteProject(
  server: McpServer,
  client: OdClient,
): void {
  const handler = makeDeleteProjectHandler(client);
  server.registerTool(
    'od_delete_project',
    {
      title: 'Delete an Open Design project',
      description:
        'PERMANENTLY delete a project. The Open Design daemon removes the database row AND the on-disk project directory. This cannot be undone. Requires only OD_DAEMON_URL.',
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
