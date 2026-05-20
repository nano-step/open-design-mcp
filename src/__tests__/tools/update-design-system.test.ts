import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { OdClient } from '../../od-client.js';
import {
  bumpVersion,
  makeUpdateDesignSystemHandler,
} from '../../tools/update-design-system.js';
import type { ByokConfig } from '../../config.js';
import { extractDesignSystem } from '../../tools/extract-design-system.js';

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
    space: [4, 8],
    unit: 'px',
    radii: [2, 4, 8],
    shadows: ['0 1px 2px rgba(0,0,0,0.1)'],
    breakpoints: [
      { name: 'sm', min: 640 },
      { name: 'md', min: 768 },
    ],
    zIndex: { dropdown: 100 },
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
} as const;

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

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

function sseStream(blocks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const b of blocks) c.enqueue(encoder.encode(b));
      c.close();
    },
  });
}

function sseResponse(blocks: string[]): Response {
  return new Response(sseStream(blocks), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function stubByok(overrides: Partial<ByokConfig> = {}): () => ByokConfig {
  return () => ({
    BYOK_BASE_URL: 'http://test.local/v1',
    BYOK_API_KEY: 'sk-test',
    BYOK_MODEL: 'open-design',
    BYOK_PROVIDER: 'openai',
    ...overrides,
  });
}

describe('bumpVersion', () => {
  it('increments data-od-version from 3 to 4', () => {
    const html = '<html data-od-artifact="design-system" data-od-version="3"><head></head></html>';
    const result = bumpVersion(html);
    expect(result).toContain('data-od-version="4"');
    expect(result).not.toContain('data-od-version="3"');
  });

  it('throws when data-od-version is absent', () => {
    const html = '<html data-od-artifact="design-system"><head></head></html>';
    expect(() => bumpVersion(html)).toThrow(/data-od-version/);
  });
});

describe('od_update_design_system — delta mode', () => {
  it('primary color change updates manifest and CSS', async () => {
    const client = makeStubClient();
    const handler = makeUpdateDesignSystemHandler(client, 600_000, stubByok());
    const result = await handler({
      html: VALID_DS_HTML,
      mode: 'delta',
      patch: { tokens: { colors: { primary: '#2563eb' } } },
    });

    expect(result.isError).toBeUndefined();
    const ds = extractDesignSystem(result.content[0].text);
    expect(ds.manifest.tokens.colors.primary).toBe('#2563eb');
    expect(ds.tokensCss).toContain('--color-primary:#2563eb');
  });

  it('bumps version from 1 to 2 after delta patch', async () => {
    const client = makeStubClient();
    const handler = makeUpdateDesignSystemHandler(client, 600_000, stubByok());
    const result = await handler({
      html: VALID_DS_HTML,
      mode: 'delta',
      patch: { tokens: { colors: { primary: '#2563eb' } } },
    });

    expect(result.isError).toBeUndefined();
    const ds = extractDesignSystem(result.content[0].text);
    expect(ds.version).toBe(2);
  });

  it('invalid unit in patch → isError true', async () => {
    const client = makeStubClient();
    const handler = makeUpdateDesignSystemHandler(client, 600_000, stubByok());
    const result = await handler({
      html: VALID_DS_HTML,
      mode: 'delta',
      patch: { tokens: { unit: '%' } },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/validation failed/i);
  });
});

describe('od_update_design_system — semantic mode', () => {
  it('happy path with mocked BYOK: result passes extractor and version is bumped', async () => {
    const updatedHtml = VALID_DS_HTML.replace('data-od-version="1"', 'data-od-version="1"');
    const blocks = [
      'event: start\ndata: {"model":"m"}\n\n',
      `event: delta\ndata: {"delta":${JSON.stringify(updatedHtml)}}\n\n`,
      'event: end\ndata: {}\n\n',
    ];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const handler = makeUpdateDesignSystemHandler(client, 600_000, stubByok());
    const result = await handler({
      html: VALID_DS_HTML,
      mode: 'semantic',
      instruction: 'Add a destructive button variant in red',
    });

    expect(result.isError).toBeUndefined();
    const ds = extractDesignSystem(result.content[0].text);
    expect(ds.version).toBe(2);
  });

  it('missing BYOK config → isError with BYOK not configured message', async () => {
    const client = makeStubClient({ proxyStream: vi.fn() });
    const throwingByok = () => {
      throw new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'undefined',
          path: ['BYOK_BASE_URL'],
          message: 'Required',
        },
      ]);
    };
    const handler = makeUpdateDesignSystemHandler(client, 600_000, throwingByok);
    const result = await handler({
      html: VALID_DS_HTML,
      mode: 'semantic',
      instruction: 'Update colors',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^BYOK not configured/);
    expect(vi.mocked(client.proxyStream)).not.toHaveBeenCalled();
  });
});
