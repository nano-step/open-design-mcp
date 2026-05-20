import { z } from 'zod';

const tokensSchema = z.object({
  colors: z.record(z.string(), z.string()),
  type: z.object({
    fontFamily: z.string(),
    scale: z.array(z.number()),
  }),
  space: z.array(z.number()),
  unit: z.enum(['px', 'rem']),
  radii: z.array(z.number()),
  shadows: z.array(z.string()),
  breakpoints: z.array(z.object({ name: z.string(), min: z.number() })),
  zIndex: z.record(z.string(), z.number()),
});

const componentVariantSchema = z.object({
  name: z.string(),
  selector: z.string(),
  role: z.enum(['button', 'input', 'card', 'nav', 'section', 'other']),
  snippet: z.string(),
});

const layoutPrimitiveSchema = z.object({
  name: z.string(),
  selector: z.string(),
  purpose: z.string(),
});

const designSystemManifestSchema = z.object({
  version: z.literal(1),
  tokens: tokensSchema,
  components: z.array(componentVariantSchema).min(1),
  layout: z.array(layoutPrimitiveSchema).min(1),
});

export interface ExtractedDesignSystem {
  manifest: DesignSystemManifest;
  tokensCss: string;
  componentsCss: string;
  layoutCss: string;
  version: number;
}

export type Tokens = z.infer<typeof tokensSchema>;
export type ComponentVariant = z.infer<typeof componentVariantSchema>;
export type LayoutPrimitive = z.infer<typeof layoutPrimitiveSchema>;
export type DesignSystemManifest = z.infer<typeof designSystemManifestSchema>;

export { tokensSchema, componentVariantSchema, layoutPrimitiveSchema, designSystemManifestSchema };
