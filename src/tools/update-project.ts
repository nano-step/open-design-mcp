import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import type { ProjectMetadata } from '../../vendor/od-contracts/src/api/projects.js';
import { mapErrorToToolResultWith404 } from './errors.js';

const inputSchema = z
  .object({
    projectId: z.string().min(1, 'projectId is required'),
    name: z.string().min(1).optional().describe('New project name'),
    customInstructions: z
      .string()
      .max(5000, 'customInstructions must be ≤ 5000 characters')
      .nullish()
      .describe('New custom instructions (null to clear)'),
    kind: z.string().optional().describe('Project kind'),
    fidelity: z.string().optional().describe('Fidelity level'),
    linkedDirs: z
      .array(z.string())
      .optional()
      .describe('Linked local directories'),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.customInstructions !== undefined ||
      v.kind !== undefined ||
      v.fidelity !== undefined ||
      v.linkedDirs !== undefined,
    {
      message:
        'at least one of name/customInstructions/kind/fidelity/linkedDirs is required',
    },
  );

type Args = z.infer<typeof inputSchema>;
type Extra = { signal?: AbortSignal };

export function makeUpdateProjectHandler(client: OdClient) {
  return async function handleUpdateProject(
    args: Args,
    extra: Extra,
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: {
      project: { id: string; name: string };
    };
    isError?: true;
  }> {
    const { projectId, name, customInstructions, kind, fidelity, linkedDirs } =
      args;
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(30_000),
        extra?.signal ?? new AbortController().signal,
      ]);

      const metadata: Partial<ProjectMetadata> | undefined =
        kind !== undefined || fidelity !== undefined || linkedDirs !== undefined
          ? {
              kind: (kind ?? undefined) as ProjectMetadata['kind'] | undefined,
              fidelity: (fidelity ?? undefined) as ProjectMetadata['fidelity'],
              linkedDirs: linkedDirs ?? undefined,
            }
          : undefined;

      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (customInstructions !== undefined)
        patch.customInstructions = customInstructions;
      if (metadata !== undefined) patch.metadata = metadata;

      const res = await client.updateProject(projectId, patch, signal);
      const project = res.project;
      const summary = `Updated project "${project.name}" (id: ${project.id}).`;

      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: { project: { id: project.id, name: project.name } },
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

export function registerUpdateProject(
  server: McpServer,
  client: OdClient,
): void {
  const handler = makeUpdateProjectHandler(client);
  server.registerTool(
    'od_update_project',
    {
      title: 'Update an Open Design project',
      description:
        'Update a project on the Open Design daemon. At least one mutable field (name, customInstructions, kind, fidelity, linkedDirs) must be provided. Requires only OD_DAEMON_URL.',
      inputSchema: inputSchema._def.schema.shape,
    },
    handler,
  );
}
