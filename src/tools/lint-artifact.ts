import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OdClient } from '../od-client.js';
import { mapErrorToToolResult } from './errors.js';

const inputSchema = z.object({
  html: z.string().min(1).describe('Full HTML document to lint'),
});

export { inputSchema as lintArtifactInputSchema };

export type LintArtifactArgs = z.infer<typeof inputSchema>;

export function makeLintArtifactHandler(
  client: OdClient,
): (
  args: LintArtifactArgs,
  extra?: { signal?: AbortSignal },
) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}> {
  return async (args, extra) => {
    try {
      const signal = AbortSignal.any([
        AbortSignal.timeout(30_000),
        extra?.signal ?? new AbortController().signal,
      ]);
      const res = await client.lintArtifact(args.html, signal);

      const findings = res.findings ?? [];
      const lines: string[] = [];
      if (findings.length === 0) {
        lines.push('Lint: 0 findings.');
      } else {
        lines.push(`Lint: ${findings.length} finding(s):`);
        for (const f of findings) {
          const loc =
            f.path !== undefined && f.line !== undefined
              ? `${f.path}:${f.line}`
              : f.path !== undefined
                ? f.path
                : f.line !== undefined
                  ? `line ${f.line}`
                  : '';
          lines.push(`- [${f.severity}] ${loc ? loc + ' — ' : ''}${f.message}`);
        }
      }
      if (res.agentMessage) {
        lines.push('', `Agent: ${res.agentMessage}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return mapErrorToToolResult(err, client.authMode);
    }
  };
}

export function registerLintArtifact(server: McpServer, client: OdClient): void {
  const handler = makeLintArtifactHandler(client);
  server.registerTool(
    'od_lint_artifact',
    {
      title: 'Lint an Open Design artifact',
      description:
        'Validate an HTML artifact for structural issues. Returns text findings + optional agent message.',
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
