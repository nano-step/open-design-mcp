import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { mapErrorToToolResultWith404 } from './errors.js';

const inputSchema = z.object({
  projectId: z.string().min(1).describe('Project ID from od_list_projects'),
});

const fileSummarySchema = z.object({
  path: z.string(),
  kind: z.string().optional(),
});

const outputSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.string().optional(),
    status: z.string().optional(),
    resolvedDir: z.string().optional(),
  }),
  files: z.array(fileSummarySchema),
});

type Args = z.infer<typeof inputSchema>;
type Extra = { signal?: AbortSignal };

export function makeGetProjectHandler(client: OdClient) {
  return async function handleGetProject(
    args: Args,
    extra: Extra,
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: {
      project: { id: string; name: string; kind?: string; status?: string; resolvedDir?: string };
      files: Array<{ path: string; kind?: string }>;
    };
    isError?: true;
  }> {
    const { projectId } = args;
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(30_000),
        extra?.signal ?? new AbortController().signal,
      ]);

      const [detail, filesResp] = await Promise.all([
        client.getProject(projectId, signal),
        client.listFiles(projectId, signal),
      ]);

      const p = detail.project;
      const projectSummary = {
        id: p.id,
        name: p.name,
        kind: (p as { kind?: string }).kind,
        status: (p as { statusInfo?: { displayStatus?: string } }).statusInfo?.displayStatus,
        resolvedDir: detail.resolvedDir,
      };
      const files = (filesResp.files ?? []).map((f) => ({
        path: f.path ?? '',
        kind: f.kind,
      }));

      const lines = [
        `Project: ${projectSummary.id} — ${projectSummary.name}`,
        projectSummary.status ? `Status: ${projectSummary.status}` : null,
        projectSummary.resolvedDir ? `Dir: ${projectSummary.resolvedDir}` : null,
        `Files (${files.length}):`,
        ...files.map((f) => `- ${f.path}${f.kind ? ` (${f.kind})` : ''}`),
      ].filter(Boolean) as string[];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: { project: projectSummary, files },
      };
    } catch (err) {
      return mapErrorToToolResultWith404(err, `Project not found: ${projectId}`);
    }
  };
}

export function registerGetProject(server: McpServer, client: OdClient): void {
  const handler = makeGetProjectHandler(client);
  server.registerTool(
    'od_get_project',
    {
      title: 'Get Open Design project details',
      description:
        'Fetch a project + its artifact files. Read-only; requires only OD_DAEMON_URL.',
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
    },
    handler,
  );
}
