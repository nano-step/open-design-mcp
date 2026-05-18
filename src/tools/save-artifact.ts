import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { mapErrorToToolResult } from './errors.js';

const inputSchema = z.object({
  identifier: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'must be lowercase letters, digits, and dashes only')
    .min(3)
    .max(64)
    .describe('URL-safe slug (3-64 chars, lowercase, digits, dashes)'),
  title: z.string().min(1).max(200).describe('Human-readable artifact title'),
  html: z.string().min(1).describe('Full HTML document to persist'),
});

export { inputSchema as saveArtifactInputSchema };

export type SaveArtifactArgs = z.infer<typeof inputSchema>;

export function makeSaveArtifactHandler(
  client: OdClient,
): (
  args: SaveArtifactArgs,
  extra?: { signal?: AbortSignal },
) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}> {
  return async (args, extra) => {
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(30_000),
        extra?.signal ?? new AbortController().signal,
      ]);
      const res = await client.saveArtifact(
        { identifier: args.identifier, title: args.title, html: args.html },
        signal,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Saved: ${args.identifier} → ${res.path}\nURL: ${res.url}`,
          },
        ],
      };
    } catch (err) {
      return mapErrorToToolResult(err);
    }
  };
}

export function registerSaveArtifact(server: McpServer, client: OdClient): void {
  const handler = makeSaveArtifactHandler(client);
  server.registerTool(
    'od_save_artifact',
    {
      title: 'Save an Open Design artifact',
      description:
        'Persist an HTML artifact to the daemon under a slug identifier. Requires only OD_DAEMON_URL.',
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
