import { describe, it, expect } from 'vitest';
import {
  extractDesignSystem,
  DesignSystemExtractionError,
  registerExtractDesignSystem,
} from '../../tools/extract-design-system.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const TOKENS_CSS = ':root{--color-primary:#3b82f6;--color-bg:#ffffff;--space-1:4px;--space-2:8px}';
const COMPONENTS_CSS =
  '.btn{padding:var(--space-2);border-radius:4px}.btn-primary{background:var(--color-primary);color:#fff}';
const LAYOUT_CSS =
  '.container{max-width:1200px;margin:0 auto}.stack-md{display:flex;flex-direction:column;gap:var(--space-2)}';

const MANIFEST_OBJ = {
  version: 1,
  tokens: {
    colors: { primary: '#3b82f6', bg: '#ffffff' },
    type: { fontFamily: 'Inter, sans-serif', scale: [12, 14, 16, 20, 24, 32] },
    space: [4, 8, 12, 16, 24, 32, 48],
    unit: 'px',
    radii: [2, 4, 8],
    shadows: ['0 1px 2px rgba(0,0,0,0.1)'],
    breakpoints: [
      { name: 'sm', min: 640 },
      { name: 'md', min: 768 },
      { name: 'lg', min: 1024 },
    ],
    zIndex: { dropdown: 100, modal: 200 },
  },
  components: [
    {
      name: 'btn-primary',
      selector: '.btn-primary',
      role: 'button',
      snippet: '<button class="btn btn-primary">Label</button>',
    },
  ],
  layout: [{ name: 'container', selector: '.container', purpose: 'Centered content wrapper' }],
};

const VALID_DS_HTML = `<!doctype html>
<html data-od-artifact="design-system" data-od-version="1">
<head>
<style id="od-tokens">${TOKENS_CSS}</style>
<style id="od-components">${COMPONENTS_CSS}</style>
<style id="od-layout">${LAYOUT_CSS}</style>
<script type="application/json" id="od-design-system-manifest">
${JSON.stringify(MANIFEST_OBJ)}
</script>
</head>
<body>
<section data-od-gallery="buttons"><button class="btn btn-primary">Label</button></section>
</body>
</html>`;

describe('extractDesignSystem', () => {
  it('happy path: extracts version, manifest, and CSS blocks', () => {
    const ds = extractDesignSystem(VALID_DS_HTML);
    expect(ds.version).toBe(1);
    expect(ds.manifest.tokens.colors.primary).toBe('#3b82f6');
    expect(ds.tokensCss).toContain('--color-primary:#3b82f6');
    expect(ds.componentsCss).toContain('.btn-primary');
    expect(ds.layoutCss).toContain('.container');
  });

  it('CSS round-trip: tokensCss is byte-for-byte identical to fixture', () => {
    const ds = extractDesignSystem(VALID_DS_HTML);
    expect(ds.tokensCss).toBe(TOKENS_CSS);
  });

  it('missing od-tokens style block: throws DesignSystemExtractionError mentioning od-tokens', () => {
    const html = VALID_DS_HTML.replace(/<style id="od-tokens">[\s\S]*?<\/style>/, '');
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: expect.stringContaining('od-tokens'),
      }),
    );
  });

  it('missing od-components style block: throws DesignSystemExtractionError mentioning od-components', () => {
    const html = VALID_DS_HTML.replace(/<style id="od-components">[\s\S]*?<\/style>/, '');
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: expect.stringContaining('od-components'),
      }),
    );
  });

  it('missing od-layout style block: throws DesignSystemExtractionError mentioning od-layout', () => {
    const html = VALID_DS_HTML.replace(/<style id="od-layout">[\s\S]*?<\/style>/, '');
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: expect.stringContaining('od-layout'),
      }),
    );
  });

  it('missing manifest script: throws DesignSystemExtractionError mentioning od-design-system-manifest', () => {
    const html = VALID_DS_HTML.replace(
      /<script type="application\/json" id="od-design-system-manifest">[\s\S]*?<\/script>/,
      '',
    );
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: expect.stringContaining('od-design-system-manifest'),
      }),
    );
  });

  it('wrong artifact marker: throws with "not a design-system artifact"', () => {
    const html = VALID_DS_HTML.replace(
      'data-od-artifact="design-system"',
      'data-od-artifact="prototype"',
    );
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: expect.stringContaining('not a design-system artifact'),
      }),
    );
  });

  it('missing artifact marker entirely: throws with "not a design-system artifact"', () => {
    const html = VALID_DS_HTML.replace('data-od-artifact="design-system" ', '');
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: expect.stringContaining('not a design-system artifact'),
      }),
    );
  });

  it('malformed JSON in manifest: throws with message starting "design system manifest is not valid JSON"', () => {
    const html = VALID_DS_HTML.replace(
      /(<script type="application\/json" id="od-design-system-manifest"[^>]*>)[\s\S]*?(<\/script>)/,
      '$1{broken$2',
    );
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: expect.stringMatching(/^design system manifest is not valid JSON/),
      }),
    );
  });

  it('unsupported version 2: throws with "unsupported design system manifest version: 2"', () => {
    const manifest2 = { ...MANIFEST_OBJ, version: 2 };
    const html = VALID_DS_HTML.replace(
      /(<script type="application\/json" id="od-design-system-manifest"[^>]*>)[\s\S]*?(<\/script>)/,
      `$1\n${JSON.stringify(manifest2)}\n$2`,
    );
    expect(() => extractDesignSystem(html)).toThrowError(
      expect.objectContaining({
        name: 'DesignSystemExtractionError',
        message: 'unsupported design system manifest version: 2 (this MCP supports version 1)',
      }),
    );
  });

  it('missing tokens.colors: throws ZodError', () => {
    const { colors: _colors, ...tokensWithoutColors } = MANIFEST_OBJ.tokens;
    const manifestNoColors = { ...MANIFEST_OBJ, tokens: tokensWithoutColors };
    const html = VALID_DS_HTML.replace(
      /(<script type="application\/json" id="od-design-system-manifest"[^>]*>)[\s\S]*?(<\/script>)/,
      `$1\n${JSON.stringify(manifestNoColors)}\n$2`,
    );
    expect(() => extractDesignSystem(html)).toThrow();
  });
});

describe('od_extract_design_system MCP wrapper', () => {
  function makeStubServer(): { server: McpServer; getLastHandler: () => Function } {
    let lastHandler: Function = () => {};
    const server = {
      registerTool: (_name: string, _meta: unknown, handler: Function) => {
        lastHandler = handler;
      },
    } as unknown as McpServer;
    return { server, getLastHandler: () => lastHandler };
  }

  it('DesignSystemExtractionError maps to isError: true with error message', async () => {
    const { server, getLastHandler } = makeStubServer();
    registerExtractDesignSystem(server);
    const handler = getLastHandler();
    const result = await handler({ html: '<html><head></head></html>' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a design-system artifact');
  });

  it('success: returns parseable JSON containing tokensCss field', async () => {
    const { server, getLastHandler } = makeStubServer();
    registerExtractDesignSystem(server);
    const handler = getLastHandler();
    const result = await handler({ html: VALID_DS_HTML });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(typeof parsed.tokensCss).toBe('string');
    expect(parsed.tokensCss).toContain('--color-primary');
  });
});
