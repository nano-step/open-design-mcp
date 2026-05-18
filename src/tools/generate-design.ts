import { z } from 'zod';
import { ZodError } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import { type OdClient, type ProviderId } from '../od-client.js';
import { parseOdSse } from '../sse-parser.js';
import { getByokConfig, type ByokConfig } from '../config.js';
import { composeSystemPrompt } from '../../vendor/od-contracts/src/prompts/system.js';
import type { ProjectKind } from '../../vendor/od-contracts/src/api/projects.js';
import { mapErrorToToolResult } from './errors.js';

const KIND_VALUES = [
  'prototype',
  'deck',
  'template',
  'other',
  'image',
  'video',
  'audio',
] as const satisfies ReadonlyArray<ProjectKind>;

const inputSchema = z.object({
  prompt: z.string().min(1).describe('Design request from the user'),
  kind: z
    .enum(KIND_VALUES)
    .optional()
    .default('prototype')
    .describe('Kind of artifact to generate'),
  userInstructions: z.string().optional(),
  projectInstructions: z.string().optional(),
});

export type GenerateDesignArgs = z.infer<typeof inputSchema>;

export { inputSchema as generateDesignInputSchema };

const DEFAULT_TIMEOUT_MS = 120_000; // §B6 — AI generation legitimately long
const PROGRESS_EVERY = 25; // §B4

type SendNotification = (notification: ServerNotification) => Promise<void>;

interface HandlerExtra {
  signal?: AbortSignal;
  sendNotification?: SendNotification;
  _meta?: { progressToken?: string | number };
}

export function makeGenerateDesignHandler(
  client: OdClient,
  loadByok: () => ByokConfig = getByokConfig,
): (args: GenerateDesignArgs, extra?: HandlerExtra) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}> {
  return async (args, extra) => {
    // Step 1: load BYOK config lazily. Missing vars → friendly text per §B8.
    let byok: ByokConfig;
    try {
      byok = loadByok();
    } catch (err) {
      if (err instanceof ZodError) {
        const missing = err.issues
          .map((i) => i.path.join('.') || '(root)')
          .join(', ');
        return {
          content: [
            {
              type: 'text',
              text:
                'BYOK not configured: missing BYOK_BASE_URL/BYOK_API_KEY/BYOK_MODEL. ' +
                `Specifically: ${missing}.`,
            },
          ],
          isError: true,
        };
      }
      return mapErrorToToolResult(err);
    }

    // Step 2: compose system prompt with FULL upstream fidelity (§B5).
    let systemPrompt: string;
    try {
      systemPrompt = composeSystemPrompt({
        metadata: { kind: args.kind },
        userInstructions: args.userInstructions,
        projectInstructions: args.projectInstructions,
        streamFormat: 'plain',
      });
    } catch (err) {
      return mapErrorToToolResult(err);
    }

    // Step 3: build proxy request.
    const proxyReq = {
      baseUrl: byok.BYOK_BASE_URL,
      apiKey: byok.BYOK_API_KEY,
      model: byok.BYOK_MODEL,
      systemPrompt,
      messages: [
        { role: 'user' as const, content: args.prompt },
      ],
    };

    // Step 4: compose AbortSignal — timeout + caller's signal (§B6).
    const signals: AbortSignal[] = [AbortSignal.timeout(DEFAULT_TIMEOUT_MS)];
    if (extra?.signal) signals.push(extra.signal);
    const combined = AbortSignal.any(signals);

    // Step 5: fire the request.
    let response: Response;
    try {
      response = await client.proxyStream(
        proxyReq,
        byok.BYOK_PROVIDER as ProviderId,
        combined,
      );
    } catch (err) {
      return mapErrorToToolResult(err);
    }

    if (!response.body) {
      return {
        content: [
          { type: 'text', text: 'OD daemon error: empty response body from proxy/stream' },
        ],
        isError: true,
      };
    }

    // Step 6: stream the body, accumulating delta events. Emit progress
    // notifications every PROGRESS_EVERY deltas if a progressToken was
    // supplied via _meta (§B4).
    let accumulated = '';
    let deltaCount = 0;
    const progressToken = extra?._meta?.progressToken;
    const sendNotification = extra?.sendNotification;

    try {
      for await (const evt of parseOdSse(response.body)) {
        if (evt.type === 'delta') {
          accumulated += evt.delta;
          deltaCount++;
          if (
            deltaCount % PROGRESS_EVERY === 0 &&
            progressToken !== undefined &&
            sendNotification !== undefined
          ) {
            // Best-effort — if notification fails, keep streaming.
            await sendNotification({
              method: 'notifications/progress',
              params: { progress: deltaCount, progressToken },
            }).catch(() => undefined);
          }
        } else if (evt.type === 'error') {
          return {
            content: [{ type: 'text', text: evt.message }],
            isError: true,
          };
        } else if (evt.type === 'end') {
          break;
        }
        // start events are advisory; nothing to do.
      }
    } catch (err) {
      // AbortError, parse error, network error
      return mapErrorToToolResult(err);
    }

    return {
      content: [{ type: 'text', text: accumulated }],
    };
  };
}

export function registerGenerateDesign(
  server: McpServer,
  client: OdClient,
): void {
  const handler = makeGenerateDesignHandler(client);
  server.registerTool(
    'od_generate_design',
    {
      title: 'Generate a design via BYOK pipeline',
      description:
        "Generate a design artifact using BYOK. Composes the upstream Open Design system prompt and proxies through OD's /api/proxy/<provider>/stream endpoint. Requires BYOK_BASE_URL, BYOK_API_KEY, BYOK_MODEL env vars in addition to OD_DAEMON_URL.",
      inputSchema: inputSchema.shape,
      // No outputSchema — generated text is freeform (design §B10).
    },
    handler,
  );
}
