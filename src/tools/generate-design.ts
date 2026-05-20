import { z } from 'zod';
import { ZodError } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import { type OdClient, type ProviderId } from '../od-client.js';
import { parseOdSse } from '../sse-parser.js';
import { getByokConfig, type ByokConfig } from '../config.js';
import { composeSystemPrompt } from '../../vendor/od-contracts/src/prompts/system.js';
import type { ProjectKind } from '../../vendor/od-contracts/src/api/projects.js';
import type { ProjectMetadataWithStash } from '../types/metadata-stash.js';
import { mapErrorToToolResult } from './errors.js';
import type { ExtractedDesignSystem } from '../types/design-system.js';

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
  projectId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "When provided, the project's stored customInstructions are merged into the system prompt. Per-call projectInstructions wins on conflict.",
    ),
  kind: z
    .enum(KIND_VALUES)
    .optional()
    .default('prototype')
    .describe('Kind of artifact to generate'),
  userInstructions: z.string().optional(),
  projectInstructions: z.string().optional(),
  maxTokens: z
    .number()
    .int()
    .positive()
    .max(200_000)
    .optional()
    .default(64_000)
    .describe(
      'Cap on completion tokens forwarded to the BYOK provider. Default 64000 (8× the daemon\'s built-in 8192 default). Range [1, 200000]. Most providers cap themselves below this; the daemon forwards verbatim. Avoids the silent truncation in #36.',
    ),
  designSystemMode: z.enum(['strict', 'advisory', 'off']).optional()
    .describe("Controls design-system contract enforcement. Defaults to 'strict' when a system is linked, 'off' otherwise."),
});

export type GenerateDesignArgs = z.infer<typeof inputSchema>;

export { inputSchema as generateDesignInputSchema };

const PROGRESS_EVERY = 25; // §B4

type SendNotification = (notification: ServerNotification) => Promise<void>;

interface HandlerExtra {
  signal?: AbortSignal;
  sendNotification?: SendNotification;
  _meta?: { progressToken?: string | number };
}

function isAbortError(err: unknown): err is DOMException {
  return (
    err instanceof DOMException &&
    (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}

export function mergeProjectInstructions(
  stored: string | undefined,
  perCall: string | undefined,
): string | undefined {
  if (!stored && !perCall) return undefined;
  if (!stored) return perCall;
  if (!perCall) return stored;
  return `${stored}\n\n---\n\n${perCall}`;
}

export function buildDesignSystemContract(
  extracted: ExtractedDesignSystem,
  mode: 'strict' | 'advisory',
): string {
  const heading = `### Design System Contract (${mode})`;

  const rules = mode === 'strict'
    ? `**Rules (STRICT — violations will be caught by lint):**
- You MUST inline the three \`<style>\` blocks unchanged into every page you generate.
- You MUST NOT introduce new CSS custom properties, new color hex values, new component classes, or new spacing values.
- If a requested element is not in the components catalog, compose it from documented primitives or emit \`<!-- need: <component-name> -->\` and stop that section.`
    : `**Rules (ADVISORY — deviations should be justified):**
- Prefer the documented tokens and components; deviations require justification.
- The design system is guidance, not a hard constraint.`;

  return `${heading}

**Manifest (version ${extracted.version}):**
\`\`\`json
${JSON.stringify(extracted.manifest, null, 2)}
\`\`\`

**Tokens CSS:**
\`\`\`css
${extracted.tokensCss}
\`\`\`

**Components CSS:**
\`\`\`css
${extracted.componentsCss}
\`\`\`

**Layout CSS:**
\`\`\`css
${extracted.layoutCss}
\`\`\`

${rules}`;
}

export function makeGenerateDesignHandler(
  client: OdClient,
  timeoutMs: number,
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
      return mapErrorToToolResult(err, client.authMode);
    }

    // Step 1.5: if projectId provided, fetch the project to harvest stored
    // customInstructions. Errors surface via the same mapErrorToToolResult
    // path as od_get_project (#37).
    let storedCustomInstructions: string | undefined;
    let designSystemContract: string | undefined;
    let designSystemAdvisory: string | undefined;
    let effectiveMode: 'strict' | 'advisory' | 'off' = args.designSystemMode ?? 'off';

    if (args.projectId) {
      const earlySignals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
      if (extra?.signal) earlySignals.push(extra.signal);
      const earlyCombined = AbortSignal.any(earlySignals);

      try {
        const detail = await client.getProject(args.projectId, earlyCombined);
        // Metadata stash first (daemon round-trips this), top-level second (#43).
        const md = detail.project.metadata as ProjectMetadataWithStash | undefined;
        storedCustomInstructions =
          md?.customInstructions || detail.project.customInstructions || undefined;

        // Step 1.6: if project has designSystemId, fetch files and attempt extraction.
        const dsId = detail.project.designSystemId;
        if (dsId) {
          // Default mode to 'strict' when a design system is linked and caller didn't override.
          if (!args.designSystemMode) {
            effectiveMode = 'strict';
          }

          try {
            const filesResp = await client.listFiles(args.projectId, earlyCombined);
            const dsFile = filesResp.files.find((f) => f.name === dsId);
            if (!dsFile) {
              effectiveMode = 'off';
              designSystemAdvisory =
                `<!-- Warning: linked designSystemId "${dsId}" not found in project files. Design system contract skipped. -->`;
            } else {
              // @todo(v0.18): Activate design system auto-injection.
              // ProjectFile from the daemon's files list endpoint only returns metadata
              // (name, size, modifiedAt) — not content. Once the daemon exposes a
              // file-content endpoint (e.g. GET /api/projects/:id/files/:name),
              // fetch the HTML here, run `extractDesignSystem(html)`, then build the
              // contract via `buildDesignSystemContract(extracted, effectiveMode)` and
              // assign to `designSystemContract`. The injection guard at line ~234
              // already gates on `designSystemContract` being truthy.
              // Tracked as a known limitation in CHANGELOG v0.17.0.
              effectiveMode = 'off';
              designSystemAdvisory =
                `<!-- Warning: design system file "${dsId}" found but content is not available via the files list API. Design system contract skipped. -->`;
            }
          } catch {
            // Non-fatal: if listFiles fails, skip design system injection.
            effectiveMode = 'off';
            designSystemAdvisory =
              `<!-- Warning: could not fetch project files to load design system "${dsId}". Design system contract skipped. -->`;
          }
        }
      } catch (err) {
        return mapErrorToToolResult(err, client.authMode);
      }
    }

    const mergedProjectInstructions = mergeProjectInstructions(
      storedCustomInstructions,
      args.projectInstructions,
    );

    // Step 2: compose system prompt with FULL upstream fidelity (§B5).
    let systemPrompt: string;
    try {
      systemPrompt = composeSystemPrompt({
        metadata: { kind: args.kind },
        userInstructions: args.userInstructions,
        projectInstructions: mergedProjectInstructions,
        streamFormat: 'plain',
      });
    } catch (err) {
      return mapErrorToToolResult(err, client.authMode);
    }

    if (effectiveMode !== 'off' && designSystemContract) {
      systemPrompt = designSystemContract + '\n\n---\n\n' + systemPrompt;
    }

    // Step 3: build proxy request.
    const proxyReq = {
      baseUrl: byok.BYOK_BASE_URL,
      apiKey: byok.BYOK_API_KEY,
      model: byok.BYOK_MODEL,
      systemPrompt,
      maxTokens: args.maxTokens,
      messages: [
        { role: 'user' as const, content: args.prompt },
      ],
    };

    // Step 4: compose AbortSignal — timeout + caller's signal (§B6).
    const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
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
      return mapErrorToToolResult(err, client.authMode);
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
      if (isAbortError(err) && accumulated.length > 0) {
        const timedOut = isTimeoutError(err);
        const reason = timedOut
          ? `timed out after ${timeoutMs}ms`
          : 'cancelled by client';
        const advice = timedOut
          ? ' Increase OD_GENERATE_TIMEOUT_MS or slice the prompt into smaller sections.'
          : '';
        return {
          content: [
            {
              type: 'text',
              text:
                accumulated +
                `\n\n<!-- Generation ${reason} at ${deltaCount} deltas ` +
                `(${accumulated.length} chars). Output is incomplete.${advice} -->`,
            },
          ],
          isError: true,
        };
      }
      return mapErrorToToolResult(err, client.authMode);
    }

    const finalText = designSystemAdvisory
      ? designSystemAdvisory + '\n\n' + accumulated
      : accumulated;

    return {
      content: [{ type: 'text', text: finalText }],
    };
  };
}

export function registerGenerateDesign(
  server: McpServer,
  client: OdClient,
  timeoutMs: number,
): void {
  const handler = makeGenerateDesignHandler(client, timeoutMs);
  server.registerTool(
    'od_generate_design',
    {
      title: 'Generate a design via BYOK pipeline',
      description:
        "Generate a design artifact using BYOK. Composes the upstream Open Design system prompt and proxies through OD's /api/proxy/<provider>/stream endpoint. Requires BYOK_BASE_URL, BYOK_API_KEY, BYOK_MODEL env vars in addition to OD_DAEMON_URL. When projectId is provided, the project's stored customInstructions are merged into the system prompt — read precedence is metadata.customInstructions first (daemon-compat stash, see #43), then top-level customInstructions, then the per-call projectInstructions field; per-call projectInstructions wins on conflict with the stored value. Set brand rules once via od_create_project or od_update_project. Set `maxTokens` (default 64000) to control completion length — full pages typically need 30000+ tokens to render every section. The MCP now forwards this verbatim to avoid the silent 8192-token truncation in #36. Long prompts (full pages) can take 5-10 minutes — server timeout defaults to 10 min, configurable via OD_GENERATE_TIMEOUT_MS. On abort or timeout mid-stream, accumulated tokens are returned as partial HTML with a trailing comment marker and isError=true.",
      inputSchema: inputSchema.shape,
      // No outputSchema — generated text is freeform (design §B10).
    },
    handler,
  );
}
