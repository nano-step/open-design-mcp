import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const briefAnswersSchema = z.object({
  output: z.string().optional().describe('Expected output format (e.g., "Slide deck / pitch")'),
  platform: z.array(z.string()).optional().describe('Target platforms (e.g., ["Responsive web", "Desktop web"])'),
  audience: z.string().optional().describe('Target audience description'),
  tone: z.array(z.string()).optional().describe('Tone/style preferences (e.g., ["Modern minimal", "Editorial"])'),
  brand: z.enum(['pick_direction', 'brand_spec', 'reference_match']).optional().describe('Brand selection mode'),
  scale: z.string().optional().describe('Scale or scope constraints'),
  constraints: z.string().optional().describe('Additional constraints'),
});

const inputSchema = z.object({
  pagePrompt: z.string().min(1).describe('The page/section brief (required)'),
  briefAnswers: briefAnswersSchema.optional().describe('Turn 1 form answers from discovery'),
  brandSpec: z.string().optional().describe('Turn 2 brand specification markdown'),
  siblingArtifactSlugs: z.array(z.string()).optional().describe('Reserved for future cross-page consistency; currently ignored'),
});

export { inputSchema as composeBriefInputSchema };
export type BriefAnswers = z.infer<typeof briefAnswersSchema>;
export type ComposeBriefArgs = z.infer<typeof inputSchema>;

/**
 * Pure helper function that formats structured inputs into a Turn 3 prompt
 * recognized by upstream Open Design (skips re-asking discovery questions).
 *
 * Section order: [form answers — discovery] → [brand spec] → [page brief]
 * Empty sections (undefined/empty) are omitted entirely.
 * string[] values are joined with ", " (comma-space).
 */
export function composeBrief(args: ComposeBriefArgs): string {
  const sections: string[] = [];

  // [form answers — discovery] section
  // Only render if briefAnswers is defined and at least one field is non-empty
  if (args.briefAnswers && hasNonEmptyBriefAnswers(args.briefAnswers)) {
    const formLines: string[] = ['[form answers — discovery]'];
    const { output, platform, audience, tone, brand, scale, constraints } = args.briefAnswers;

    if (output) {
      formLines.push(`- output: ${output}`);
    }
    if (platform && platform.length > 0) {
      formLines.push(`- platform: ${platform.join(', ')}`);
    }
    if (audience) {
      formLines.push(`- audience: ${audience}`);
    }
    if (tone && tone.length > 0) {
      formLines.push(`- tone: ${tone.join(', ')}`);
    }
    if (brand) {
      formLines.push(`- brand: ${brand}`);
    }
    if (scale) {
      formLines.push(`- scale: ${scale}`);
    }
    if (constraints) {
      formLines.push(`- constraints: ${constraints}`);
    }

    sections.push(formLines.join('\n'));
  }

  // [brand spec] section
  if (args.brandSpec && args.brandSpec.trim()) {
    sections.push(`[brand spec]\n${args.brandSpec}`);
  }

  // [page brief] section (always rendered — pagePrompt is required)
  sections.push(`[page brief]\n${args.pagePrompt}`);

  // Join sections with exactly one blank line between them
  return sections.join('\n\n');
}

/**
 * Helper to check if briefAnswers has any non-empty field.
 */
function hasNonEmptyBriefAnswers(answers: BriefAnswers): boolean {
  if (answers.output) return true;
  if (answers.platform && answers.platform.length > 0) return true;
  if (answers.audience) return true;
  if (answers.tone && answers.tone.length > 0) return true;
  if (answers.brand) return true;
  if (answers.scale) return true;
  if (answers.constraints) return true;
  return false;
}

export function registerComposeBrief(server: McpServer): void {
  server.registerTool(
    'od_compose_brief',
    {
      title: 'Compose a Turn 3 prompt for od_generate_design',
      description:
        'Format a Turn 3 prompt for od_generate_design. Combines Turn 1 form answers, Turn 2 brand-spec, and the page brief into a single string that upstream Open Design recognizes (causes it to skip re-asking discovery questions). Pure function: no network, no env vars. Pass the same briefAnswers + brandSpec to every per-page generate_design call to enforce multi-page consistency.',
      inputSchema: inputSchema.shape,
    },
    async (args: ComposeBriefArgs) => {
      const composed = composeBrief(args);
      return {
        content: [{ type: 'text', text: composed }],
      };
    },
  );
}
