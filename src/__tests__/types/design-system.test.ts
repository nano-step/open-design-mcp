import { describe, it, expect } from 'vitest';
import {
  tokensSchema,
  componentVariantSchema,
  layoutPrimitiveSchema,
  designSystemManifestSchema,
  type DesignSystemManifest,
} from '../../types/design-system.js';

describe('design-system schemas', () => {
  const validTokens = {
    colors: { primary: '#000000', secondary: '#ffffff' },
    type: {
      fontFamily: 'Inter, sans-serif',
      scale: [12, 14, 16, 18, 20, 24, 32],
    },
    space: [0, 4, 8, 16, 24, 32],
    unit: 'rem' as const,
    radii: [0, 2, 4, 8, 16],
    shadows: ['0 1px 3px rgba(0,0,0,0.1)', '0 4px 6px rgba(0,0,0,0.1)'],
    breakpoints: [
      { name: 'mobile', min: 0 },
      { name: 'tablet', min: 768 },
      { name: 'desktop', min: 1024 },
    ],
    zIndex: { base: 0, dropdown: 100, modal: 1000 },
  };

  const validComponent = {
    name: 'Primary Button',
    selector: '.btn-primary',
    role: 'button' as const,
    snippet: '<button class="btn-primary">Click me</button>',
  };

  const validLayoutPrimitive = {
    name: 'Container',
    selector: '.container',
    purpose: 'Wraps main content',
  };

  describe('tokensSchema', () => {
    it('accepts valid tokens', () => {
      const result = tokensSchema.safeParse(validTokens);
      expect(result.success).toBe(true);
    });

    it('rejects missing colors', () => {
      const invalid = { ...validTokens, colors: undefined };
      const result = tokensSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('colors');
      }
    });

    it('rejects invalid unit (% not allowed)', () => {
      const invalid = { ...validTokens, unit: '%' };
      const result = tokensSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.errors[0];
        expect(error.message).toContain('Invalid enum value');
      }
    });

    it('accepts unit: px', () => {
      const tokensWithPx = { ...validTokens, unit: 'px' as const };
      const result = tokensSchema.safeParse(tokensWithPx);
      expect(result.success).toBe(true);
    });

    it('accepts unit: rem', () => {
      const tokensWithRem = { ...validTokens, unit: 'rem' as const };
      const result = tokensSchema.safeParse(tokensWithRem);
      expect(result.success).toBe(true);
    });
  });

  describe('componentVariantSchema', () => {
    it('accepts valid component variant', () => {
      const result = componentVariantSchema.safeParse(validComponent);
      expect(result.success).toBe(true);
    });

    it('accepts all valid roles', () => {
      const roles = ['button', 'input', 'card', 'nav', 'section', 'other'] as const;
      roles.forEach((role) => {
        const component = { ...validComponent, role };
        const result = componentVariantSchema.safeParse(component);
        expect(result.success).toBe(true);
      });
    });

    it('rejects invalid role', () => {
      const invalid = { ...validComponent, role: 'invalid' };
      const result = componentVariantSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('layoutPrimitiveSchema', () => {
    it('accepts valid layout primitive', () => {
      const result = layoutPrimitiveSchema.safeParse(validLayoutPrimitive);
      expect(result.success).toBe(true);
    });

    it('requires name, selector, and purpose', () => {
      const incomplete = { name: 'Container' };
      const result = layoutPrimitiveSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
    });
  });

  describe('designSystemManifestSchema', () => {
    it('accepts valid v1 manifest with all required fields', () => {
      const manifest: DesignSystemManifest = {
        version: 1,
        tokens: validTokens,
        components: [validComponent],
        layout: [validLayoutPrimitive],
      };
      const result = designSystemManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });

    it('rejects version: 2', () => {
      const invalidVersion = {
        version: 2,
        tokens: validTokens,
        components: [validComponent],
        layout: [validLayoutPrimitive],
      };
      const result = designSystemManifestSchema.safeParse(invalidVersion);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.errors[0];
        expect(error.message).toContain('Invalid literal value');
      }
    });

    it('rejects manifest with version as string', () => {
      const invalidVersion = {
        version: '1',
        tokens: validTokens,
        components: [validComponent],
        layout: [validLayoutPrimitive],
      };
      const result = designSystemManifestSchema.safeParse(invalidVersion);
      expect(result.success).toBe(false);
    });

    it('rejects empty components array', () => {
      const invalidManifest = {
        version: 1,
        tokens: validTokens,
        components: [],
        layout: [validLayoutPrimitive],
      };
      const result = designSystemManifestSchema.safeParse(invalidManifest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.errors[0];
        expect(error.path).toContain('components');
        expect(error.message).toContain('at least 1 element');
      }
    });

    it('rejects empty layout array', () => {
      const invalidManifest = {
        version: 1,
        tokens: validTokens,
        components: [validComponent],
        layout: [],
      };
      const result = designSystemManifestSchema.safeParse(invalidManifest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.errors[0];
        expect(error.path).toContain('layout');
        expect(error.message).toContain('at least 1 element');
      }
    });

    it('accepts multiple components and layouts', () => {
      const manifest: DesignSystemManifest = {
        version: 1,
        tokens: validTokens,
        components: [
          validComponent,
          {
            name: 'Secondary Button',
            selector: '.btn-secondary',
            role: 'button' as const,
            snippet: '<button class="btn-secondary">Cancel</button>',
          },
          {
            name: 'Text Input',
            selector: 'input[type="text"]',
            role: 'input' as const,
            snippet: '<input type="text" class="input" />',
          },
        ],
        layout: [
          validLayoutPrimitive,
          {
            name: 'Grid',
            selector: '.grid',
            purpose: 'Two-column responsive grid',
          },
        ],
      };
      const result = designSystemManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });

    it('parses successfully and produces typed data', () => {
      const manifest: DesignSystemManifest = {
        version: 1,
        tokens: validTokens,
        components: [validComponent],
        layout: [validLayoutPrimitive],
      };
      const result = designSystemManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
        expect(result.data.tokens.colors).toEqual(validTokens.colors);
        expect(result.data.components[0].role).toBe('button');
      }
    });

    it('rejects manifest missing tokens', () => {
      const incomplete = {
        version: 1,
        components: [validComponent],
        layout: [validLayoutPrimitive],
      };
      const result = designSystemManifestSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('tokens');
      }
    });

    it('rejects manifest missing components', () => {
      const incomplete = {
        version: 1,
        tokens: validTokens,
        layout: [validLayoutPrimitive],
      };
      const result = designSystemManifestSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('components');
      }
    });

    it('rejects manifest missing layout', () => {
      const incomplete = {
        version: 1,
        tokens: validTokens,
        components: [validComponent],
      };
      const result = designSystemManifestSchema.safeParse(incomplete);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain('layout');
      }
    });
  });
});
