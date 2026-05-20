import { z } from 'zod';
import { ZodError } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type OdClient, type ProviderId } from '../od-client.js';
import { parseOdSse } from '../sse-parser.js';
import { getByokConfig, type ByokConfig } from '../config.js';
import { mapErrorToToolResult } from './errors.js';
import {
  extractDesignSystem,
  DesignSystemExtractionError,
} from './extract-design-system.js';
import {
  designSystemManifestSchema,
  type DesignSystemManifest,
} from '../types/design-system.js';

export function bumpVersion(html: string): string {
  const match = html.match(/(<html[^>]*\sdata-od-version=")(\d+)(")/i);
  if (!match) {
    throw new Error('bumpVersion: no data-od-version attribute found on <html> tag');
  }
  const newVersion = String(parseInt(match[2], 10) + 1);
  return html.replace(match[0], match[1] + newVersion + match[3]);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    if (srcVal === null) {
      Reflect.deleteProperty(result, key);
    } else if (
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

const semanticInputSchema = z.object({
  html: z.string().min(1).describe('Full HTML of the existing design-system artifact'),
  mode: z.literal('semantic'),
  instruction: z
    .string()
    .min(1)
    .describe(
      'Natural-language instruction for the update (e.g., "Add a destructive button variant in red")',
    ),
  maxTokens: z.number().int().positive().max(200_000).optional().default(64_000),
});

const deltaInputSchema = z.object({
  html: z.string().min(1).describe('Full HTML of the existing design-system artifact'),
  mode: z.literal('delta'),
  patch: z
    .record(z.string(), z.unknown())
    .describe('JSON patch to deep-merge into the manifest'),
});

const inputSchema = z.discriminatedUnion('mode', [semanticInputSchema, deltaInputSchema]);

export type UpdateDesignSystemArgs = z.infer<typeof inputSchema>;

function regenerateTokensCss(manifest: DesignSystemManifest): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(manifest.tokens.colors)) {
    parts.push(`--color-${name}:${value};`);
  }
  manifest.tokens.space.forEach((val, idx) => {
    parts.push(`--space-${idx + 1}:${val}${manifest.tokens.unit};`);
  });
  return `:root{${parts.join('')}}`;
}

function spliceTokensCss(html: string, newCss: string): string {
  return html.replace(
    /(<style\s+id="od-tokens"[^>]*>)([\s\S]*?)(<\/style>)/,
    `$1${newCss}$3`,
  );
}

function spliceManifestJson(html: string, manifest: DesignSystemManifest): string {
  return html.replace(
    /(<script\s+type="application\/json"\s+id="od-design-system-manifest"[^>]*>)([\s\S]*?)(<\/script>)/,
    `$1${JSON.stringify(manifest)}$3`,
  );
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
};

export function makeUpdateDesignSystemHandler(
  client: OdClient,
  timeoutMs: number,
  loadByok: () => ByokConfig = getByokConfig,
): (args: UpdateDesignSystemArgs) => Promise<ToolResult> {
  return async (args) => {
    if (args.mode === 'delta') {
      let existing;
      try {
        existing = extractDesignSystem(args.html);
      } catch (err) {
        if (err instanceof DesignSystemExtractionError) {
          return {
            content: [{ type: 'text', text: err.message }],
            isError: true,
          };
        }
        return mapErrorToToolResult(err, client.authMode);
      }

      const merged = deepMerge(
        existing.manifest as unknown as Record<string, unknown>,
        args.patch,
      );

      const validated = designSystemManifestSchema.safeParse(merged);
      if (!validated.success) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Manifest validation failed after patch: ' +
                validated.error.issues
                  .map((i) => i.path.join('.') + ': ' + i.message)
                  .join('; '),
            },
          ],
          isError: true,
        };
      }

      const newTokensCss = regenerateTokensCss(validated.data);
      let updated = spliceTokensCss(args.html, newTokensCss);
      updated = spliceManifestJson(updated, validated.data);

      try {
        updated = bumpVersion(updated);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: err instanceof Error ? err.message : String(err),
            },
          ],
          isError: true,
        };
      }

      return { content: [{ type: 'text', text: updated }] };
    }

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

    let existing;
    try {
      existing = extractDesignSystem(args.html);
    } catch (err) {
      if (err instanceof DesignSystemExtractionError) {
        return {
          content: [{ type: 'text', text: err.message }],
          isError: true,
        };
      }
      return mapErrorToToolResult(err, client.authMode);
    }

    const systemPrompt =
      'You are an expert design-system engineer. ' +
      'You will be given an existing design-system manifest as JSON and instructed to update it. ' +
      'Emit the COMPLETE updated design-system.html with all four marker slots intact ' +
      '(<style id="od-tokens">, <style id="od-components">, <style id="od-layout">, ' +
      '<script type="application/json" id="od-design-system-manifest">). ' +
      'Do not omit any marker slot. Do not add explanatory text outside the HTML document.\n\n' +
      'Existing manifest:\n' +
      JSON.stringify(existing.manifest, null, 2);

    const proxyReq = {
      baseUrl: byok.BYOK_BASE_URL,
      apiKey: byok.BYOK_API_KEY,
      model: byok.BYOK_MODEL,
      systemPrompt,
      maxTokens: args.maxTokens,
      messages: [{ role: 'user' as const, content: args.instruction }],
    };

    const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
    const combined = AbortSignal.any(signals);

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

    let accumulated = '';
    try {
      for await (const evt of parseOdSse(response.body)) {
        if (evt.type === 'delta') {
          accumulated += evt.delta;
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
      return mapErrorToToolResult(err, client.authMode);
    }

    try {
      extractDesignSystem(accumulated);
    } catch (err) {
      const msg =
        err instanceof DesignSystemExtractionError
          ? err.message
          : 'LLM output is not a valid design-system artifact';
      return {
        content: [{ type: 'text', text: `Validation failed: ${msg}` }],
        isError: true,
      };
    }

    try {
      accumulated = bumpVersion(accumulated);
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: err instanceof Error ? err.message : String(err),
          },
        ],
        isError: true,
      };
    }

    return { content: [{ type: 'text', text: accumulated }] };
  };
}

export function registerUpdateDesignSystem(
  server: McpServer,
  client: OdClient,
  timeoutMs: number,
): void {
  const handler = makeUpdateDesignSystemHandler(client, timeoutMs);
  server.registerTool(
    'od_update_design_system',
    {
      title: 'Update an existing design system',
      description:
        'Update a design-system artifact in two modes. ' +
        'semantic: uses the BYOK pipeline (requires BYOK_BASE_URL/BYOK_API_KEY/BYOK_MODEL) to apply a ' +
        'natural-language instruction and regenerate the full HTML; validates the output and bumps ' +
        'data-od-version. ' +
        'delta: deterministic local-only operation — deep-merges a JSON patch into the manifest, ' +
        'regenerates the od-tokens CSS, splices the updated manifest JSON back into the HTML, and ' +
        'bumps data-od-version. No network calls required for delta mode.',
      inputSchema,
    },
    handler,
  );
}
