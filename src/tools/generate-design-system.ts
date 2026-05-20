import { z } from 'zod';
import { ZodError } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import { type OdClient, type ProviderId } from '../od-client.js';
import { parseOdSse } from '../sse-parser.js';
import { getByokConfig, type ByokConfig } from '../config.js';
import { extractDesignSystem, DesignSystemExtractionError } from './extract-design-system.js';
import { mapErrorToToolResult } from './errors.js';

export const DESIGN_SYSTEM_CHARTER = `You are a design system generator. Produce a single self-contained HTML document that serves as a complete design system artifact.

The document MUST conform to the following structure:

1. The root element MUST be: <html data-od-artifact="design-system" data-od-version="1">

2. In the <head>, include exactly these three style blocks (in order):
   <style id="od-tokens">
     /* CSS custom properties for ALL design tokens: colors, typography, spacing, radii, shadows, etc. */
   </style>
   <style id="od-components">
     /* Component classes built from tokens: buttons, cards, inputs, badges, alerts, etc. */
   </style>
   <style id="od-layout">
     /* Layout utility classes: grid, flex, container, spacing utilities, responsive breakpoints */
   </style>

3. In the <head>, include a manifest script:
   <script type="application/json" id="od-design-system-manifest">
     { "version": 1, "name": "...", "description": "...", "tokens": {...}, "components": [...] }
   </script>
   The manifest MUST be valid JSON and contain at minimum: version (must be 1), name, description, tokens object, components array.

4. The <body> MUST contain a component gallery section that visually demonstrates all generated components and token values.

Output ONLY the HTML document. No markdown fences, no preamble, no explanation — just the raw HTML starting with <!DOCTYPE html>.`;

const inputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .describe('Design system brief — brand direction, palette preferences, density, etc.'),
  projectId: z
    .string()
    .min(1)
    .optional()
    .describe('Optional project ID for context'),
  briefAnswers: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Discovery form answers'),
  brandSpec: z.string().optional().describe('Brand specification markdown'),
  maxTokens: z
    .number()
    .int()
    .positive()
    .max(200_000)
    .optional()
    .default(64_000)
    .describe('Cap on completion tokens. Default 64000.'),
});

export type GenerateDesignSystemArgs = z.infer<typeof inputSchema>;

export { inputSchema as generateDesignSystemInputSchema };

const PROGRESS_EVERY = 25;

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

export function makeGenerateDesignSystemHandler(
  client: OdClient,
  timeoutMs: number,
  loadByok: () => ByokConfig = getByokConfig,
): (args: GenerateDesignSystemArgs, extra?: HandlerExtra) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}> {
  return async (args, extra) => {
    // Step 1: load BYOK config lazily.
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

    // Step 2: build user message, optionally prepending briefAnswers + brandSpec.
    let userMessage = args.prompt;
    if (args.briefAnswers && Object.keys(args.briefAnswers).length > 0) {
      const answersJson = JSON.stringify(args.briefAnswers, null, 2);
      userMessage = `Brief answers:\n${answersJson}\n\n${userMessage}`;
    }
    if (args.brandSpec) {
      userMessage = `Brand specification:\n${args.brandSpec}\n\n${userMessage}`;
    }

    // Step 3: build proxy request using the charter as the system prompt.
    const proxyReq = {
      baseUrl: byok.BYOK_BASE_URL,
      apiKey: byok.BYOK_API_KEY,
      model: byok.BYOK_MODEL,
      systemPrompt: DESIGN_SYSTEM_CHARTER,
      maxTokens: args.maxTokens,
      messages: [{ role: 'user' as const, content: userMessage }],
    };

    // Step 4: compose AbortSignal — timeout + caller's signal.
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

    // Step 6: stream the body, accumulating delta events.
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

    // Step 7: post-stream validation via extractDesignSystem.
    try {
      extractDesignSystem(accumulated);
    } catch (err) {
      const message = err instanceof DesignSystemExtractionError || err instanceof Error
        ? err.message
        : String(err);
      return {
        content: [
          { type: 'text', text: accumulated },
          {
            type: 'text',
            text: 'Post-generation validation failed: ' + message +
              '. The output may be missing required marker slots.',
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: accumulated }],
    };
  };
}

export function registerGenerateDesignSystem(
  server: McpServer,
  client: OdClient,
  timeoutMs: number,
): void {
  const handler = makeGenerateDesignSystemHandler(client, timeoutMs);
  server.registerTool(
    'od_generate_design_system',
    {
      title: 'Generate a design system via BYOK pipeline',
      description:
        'Generate a design system artifact (design-system.html) using the BYOK pipeline. ' +
        'Produces CSS tokens (od-tokens), component classes (od-components), and layout utilities (od-layout), ' +
        'plus a JSON manifest (od-design-system-manifest) and a component gallery. ' +
        'Proxies through the OD daemon\'s /api/proxy/<provider>/stream endpoint. ' +
        'Validates output with the design system extractor after streaming completes. ' +
        'Requires BYOK_BASE_URL, BYOK_API_KEY, BYOK_MODEL env vars in addition to OD_DAEMON_URL. ' +
        'Set maxTokens (default 64000) to control completion length.',
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
