import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { designSystemManifestSchema, type ExtractedDesignSystem } from '../types/design-system.js';

export class DesignSystemExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignSystemExtractionError';
  }
}

export function extractDesignSystem(html: string): ExtractedDesignSystem {
  if (!/<html[^>]*data-od-artifact="design-system"[^>]*>/i.test(html)) {
    throw new DesignSystemExtractionError(
      'not a design-system artifact: missing data-od-artifact="design-system" on <html>',
    );
  }

  const htmlTagMatch = html.match(/<html([^>]*)>/i);
  const htmlAttrs = htmlTagMatch ? htmlTagMatch[1] : '';
  const versionMatch = htmlAttrs.match(/data-od-version="([^"]*)"/);
  const versionRaw = versionMatch ? versionMatch[1] : null;
  const version = versionRaw !== null ? parseInt(versionRaw, 10) : NaN;
  if (!versionRaw || isNaN(version)) {
    throw new DesignSystemExtractionError('missing or invalid data-od-version attribute on <html>');
  }

  const tokensCss = extractStyleBlock(html, 'od-tokens');
  const componentsCss = extractStyleBlock(html, 'od-components');
  const layoutCss = extractStyleBlock(html, 'od-layout');

  const manifestMatch = html.match(
    /<script\s+type="application\/json"\s+id="od-design-system-manifest"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!manifestMatch) {
    throw new DesignSystemExtractionError(
      'missing required manifest script: od-design-system-manifest',
    );
  }
  const manifestRaw = manifestMatch[1];

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestRaw);
  } catch {
    throw new DesignSystemExtractionError('design system manifest is not valid JSON');
  }

  const result = designSystemManifestSchema.safeParse(parsed);
  if (!result.success) {
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      (parsed as Record<string, unknown>).version !== 1
    ) {
      const v = (parsed as Record<string, unknown>).version;
      throw new DesignSystemExtractionError(
        `unsupported design system manifest version: ${v} (this MCP supports version 1)`,
      );
    }
    throw result.error;
  }

  return {
    manifest: result.data,
    tokensCss,
    componentsCss,
    layoutCss,
    version,
  };
}

function extractStyleBlock(html: string, id: string): string {
  const regex = new RegExp(`<style\\s+id="${id}"[^>]*>([\\s\\S]*?)<\\/style>`);
  const match = html.match(regex);
  if (!match) {
    throw new DesignSystemExtractionError(`missing required style block: ${id}`);
  }
  return match[1];
}

const inputSchema = z.object({
  html: z.string().min(1).describe('Full HTML of a design-system artifact'),
});

export function registerExtractDesignSystem(server: McpServer): void {
  server.registerTool(
    'od_extract_design_system',
    {
      title: 'Extract a design system from HTML',
      description:
        'Parse a design-system.html artifact and return the JSON manifest + the three CSS blocks. Pure function — no network calls, no env vars required.',
      inputSchema: inputSchema.shape,
    },
    async (args: z.infer<typeof inputSchema>) => {
      try {
        const result = extractDesignSystem(args.html);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        if (err instanceof DesignSystemExtractionError) {
          return {
            content: [{ type: 'text', text: err.message }],
            isError: true,
          };
        }
        if (err instanceof z.ZodError) {
          return {
            content: [
              {
                type: 'text',
                text:
                  'Manifest validation failed: ' +
                  err.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; '),
              },
            ],
            isError: true,
          };
        }
        throw err;
      }
    },
  );
}
