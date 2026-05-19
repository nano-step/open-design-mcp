import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProjectFile } from '../../vendor/od-contracts/src/api/files.js';
import type { OdClient } from '../od-client.js';
import { mapErrorToToolResultWith404 } from './errors.js';

const MAX_CONTENT_BYTES = 5 * 1024 * 1024; // 5 MB client-side safety rail

const inputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._-]+$/, 'must match daemon project id regex /^[A-Za-z0-9._-]{1,128}$/'),
  name: z
    .string()
    .min(1)
    .max(255)
    .refine((n) => !n.includes('/') && !n.includes('\\'), {
      message: 'name must not contain path separators',
    }),
  content: z
    .string()
    .min(1, 'content must not be empty')
    .refine((c) => Buffer.byteLength(c, 'utf8') <= MAX_CONTENT_BYTES, {
      message: `content exceeds ${MAX_CONTENT_BYTES} bytes (5 MB)`,
    }),
});

export { inputSchema as saveProjectFileInputSchema };
export type SaveProjectFileArgs = z.infer<typeof inputSchema>;

export function makeSaveProjectFileHandler(client: OdClient) {
  return async (
    args: SaveProjectFileArgs,
    extra?: { signal?: AbortSignal },
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: { file: ProjectFile };
    isError?: true;
  }> => {
    const signal = AbortSignal.any([
      AbortSignal.timeout(30_000),
      extra?.signal ?? new AbortController().signal,
    ]);
    try {
      const res = await client.saveProjectFile(
        args.projectId,
        { name: args.name, content: args.content },
        signal,
      );
      const f = res.file;
      const lines = [
        `Saved: ${f.name} → project '${args.projectId}'`,
        `  size: ${f.size} bytes`,
        `  kind: ${f.kind}`,
      ];
      if (f.artifactManifest?.entry) {
        lines.push(`  entry: ${f.artifactManifest.entry}`);
      }
      if (f.stubGuardWarning) {
        lines.push(`  stub-guard warning: ${f.stubGuardWarning.code}`);
      }
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        structuredContent: { file: f },
      };
    } catch (err) {
      return { ...mapErrorToToolResultWith404(
        err,
        `Project not found: ${args.projectId} (call od_create_project first)`,
        client.authMode,
      ) };
    }
  };
}

export function registerSaveProjectFile(server: McpServer, client: OdClient): void {
  const handler = makeSaveProjectFileHandler(client);
  server.registerTool(
    'od_save_project_file',
    {
      description:
        "Persist a file (typically HTML from od_generate_design) INSIDE a project so it appears in od_get_project.files[] and renders in the daemon UI. Unlike od_save_artifact (which writes to a global, project-unaware artifact store), this tool wraps POST /api/projects/:id/files. Use this when you want your generated design to show up under the project's UI viewer; use od_save_artifact for a global, shareable artifact URL. Daemon limit: ~5 MB content. Requires OD_DAEMON_URL.",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
