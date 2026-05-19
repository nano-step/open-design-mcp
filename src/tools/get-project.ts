import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import type { ProjectMetadataWithStash } from '../types/metadata-stash.js';
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
    customInstructions: z.string().optional(),
    fidelity: z.string().optional(),
    skillId: z.string().optional(),
    designSystemId: z.string().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
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
      project: {
        id: string;
        name: string;
        kind?: string;
        status?: string;
        resolvedDir?: string;
        customInstructions?: string;
        fidelity?: string;
        skillId?: string;
        designSystemId?: string;
        createdAt?: number;
        updatedAt?: number;
      };
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
      // Read precedence mirrors src/tools/generate-design.ts:131-133 exactly.
      const md = p.metadata as ProjectMetadataWithStash | undefined;
      const customInstructions =
        md?.customInstructions ||
        (p as { customInstructions?: string }).customInstructions ||
        undefined;

      const projectSummary = {
        id: p.id,
        name: p.name,
        kind: md?.kind || (p as { kind?: string }).kind || undefined,
        status: (p as { statusInfo?: { displayStatus?: string } }).statusInfo?.displayStatus,
        resolvedDir: detail.resolvedDir,
        customInstructions,
        fidelity: md?.fidelity,
        skillId: (p as { skillId?: string | null }).skillId ?? undefined,
        designSystemId: (p as { designSystemId?: string | null }).designSystemId ?? undefined,
        createdAt: (p as { createdAt?: number }).createdAt,
        updatedAt: (p as { updatedAt?: number }).updatedAt,
      };
      const files = (filesResp.files ?? []).map((f) => ({
        path: f.path ?? '',
        kind: f.kind,
      }));

      const lines = [
        `Project: ${projectSummary.id} — ${projectSummary.name}`,
        projectSummary.status ? `Status: ${projectSummary.status}` : null,
        projectSummary.resolvedDir ? `Dir: ${projectSummary.resolvedDir}` : null,
        customInstructions ? `Custom Instructions (${customInstructions.length} chars):\n${customInstructions}` : null,
        `Files (${files.length}):`,
        ...files.map((f) => `- ${f.path}${f.kind ? ` (${f.kind})` : ''}`),
      ].filter(Boolean) as string[];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: { project: projectSummary, files },
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

export function registerGetProject(server: McpServer, client: OdClient): void {
  const handler = makeGetProjectHandler(client);
  server.registerTool(
    'od_get_project',
    {
      title: 'Get Open Design project details',
      description:
        'Fetch a project + its artifact files. Read-only; requires only OD_DAEMON_URL. Output includes customInstructions if set on the project (user-supplied content).',
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
    },
    handler,
  );
}
