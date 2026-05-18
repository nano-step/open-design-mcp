import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import type { ProjectMetadata } from '../../vendor/od-contracts/src/api/projects.js';
import { mapErrorToToolResult } from './errors.js';

const inputSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/, {
    message:
      'id must match /^[A-Za-z0-9._-]{1,128}$/ (alphanumerics, dot, underscore, hyphen)',
  }),
  name: z.string().min(1, 'name is required'),
  skillId: z.string().nullish().describe('Skill ID to attach'),
  designSystemId: z
    .string()
    .nullish()
    .describe('Design system ID to attach'),
  pendingPrompt: z
    .string()
    .nullish()
    .describe('Initial prompt seeded into the first conversation'),
  customInstructions: z
    .string()
    .max(5000, 'customInstructions must be ≤ 5000 characters')
    .nullish()
    .describe('Custom instructions for the project agent'),
  kind: z.string().nullish().describe('Project kind (e.g. prototype, deck)'),
  fidelity: z
    .string()
    .nullish()
    .describe('Fidelity level (wireframe or high-fidelity)'),
});

type Args = z.infer<typeof inputSchema>;
type Extra = { signal?: AbortSignal };

export function makeCreateProjectHandler(client: OdClient) {
  return async function handleCreateProject(
    args: Args,
    extra: Extra,
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: {
      project: { id: string; name: string };
      conversationId?: string;
    };
    isError?: true;
  }> {
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(30_000),
        extra?.signal ?? new AbortController().signal,
      ]);

      const metadata: ProjectMetadata | undefined =
        args.kind || args.fidelity
          ? {
              kind: (args.kind ?? 'prototype') as ProjectMetadata['kind'],
              fidelity: (args.fidelity ?? undefined) as ProjectMetadata['fidelity'],
            }
          : undefined;

      const res = await client.createProject(
        {
          id: args.id,
          name: args.name,
          skillId: args.skillId ?? undefined,
          designSystemId: args.designSystemId ?? undefined,
          pendingPrompt: args.pendingPrompt ?? undefined,
          customInstructions: args.customInstructions ?? undefined,
          metadata,
        },
        signal,
      );

      const project = res.project;
      const conversationId = res.conversationId;
      const summary = `Created project "${project.name}" (id: ${project.id}).${conversationId ? ` Conversation: ${conversationId}` : ''}`;

      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: {
          project: { id: project.id, name: project.name },
          conversationId: conversationId ?? undefined,
        },
      };
    } catch (err) {
      return mapErrorToToolResult(err, client.authMode);
    }
  };
}

export function registerCreateProject(
  server: McpServer,
  client: OdClient,
): void {
  const handler = makeCreateProjectHandler(client);
  server.registerTool(
    'od_create_project',
    {
      title: 'Create an Open Design project',
      description:
        'Create a new project on the Open Design daemon. Returns the project details and an auto-seeded conversation ID. Requires only OD_DAEMON_URL.',
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
