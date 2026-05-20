import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { OdClient } from '../../od-client.js';
import {
  DESIGN_SYSTEM_CHARTER,
  makeGenerateDesignSystemHandler,
  generateDesignSystemInputSchema,
  type GenerateDesignSystemArgs,
} from '../../tools/generate-design-system.js';
import type { ByokConfig } from '../../config.js';

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

const VALID_DESIGN_SYSTEM_HTML = `<!DOCTYPE html>
<html data-od-artifact="design-system" data-od-version="1">
<head>
<style id="od-tokens">:root { --color-primary: #4F46E5; }</style>
<style id="od-components">.btn { background: var(--color-primary); }</style>
<style id="od-layout">.container { max-width: 1200px; }</style>
<script type="application/json" id="od-design-system-manifest">
{
  "version": 1,
  "tokens": {
    "colors": { "primary": "#4F46E5" },
    "type": { "fontFamily": "Inter", "scale": [12, 14, 16, 20, 24] },
    "space": [0, 4, 8, 16, 24, 32],
    "unit": "px",
    "radii": [0, 4, 8],
    "shadows": ["0 1px 2px rgba(0,0,0,0.1)"],
    "breakpoints": [{ "name": "md", "min": 768 }],
    "zIndex": { "modal": 100 }
  },
  "components": [{ "name": "Button", "selector": ".btn", "role": "button", "snippet": "<button>Click</button>" }],
  "layout": [{ "name": "Container", "selector": ".container", "purpose": "max-width wrapper" }]
}
</script>
</head>
<body><div class="container"><button class="btn">Click</button></div></body>
</html>`;

const DEFAULT_ARGS: GenerateDesignSystemArgs = {
  prompt: 'Create a minimal design system',
};

describe('DESIGN_SYSTEM_CHARTER', () => {
  it('1. charter contains od-tokens slot requirement', () => {
    expect(DESIGN_SYSTEM_CHARTER).toContain('od-tokens');
  });

  it('2. charter contains od-components slot requirement', () => {
    expect(DESIGN_SYSTEM_CHARTER).toContain('od-components');
  });

  it('3. charter contains od-layout slot requirement', () => {
    expect(DESIGN_SYSTEM_CHARTER).toContain('od-layout');
  });

  it('4. charter contains od-design-system-manifest slot requirement', () => {
    expect(DESIGN_SYSTEM_CHARTER).toContain('od-design-system-manifest');
  });
});

describe('makeGenerateDesignSystemHandler', () => {
  it('5. BYOK not configured (ZodError from loadByok) — isError true, text starts with BYOK not configured', async () => {
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
    const handler = makeGenerateDesignSystemHandler(client, 600_000, throwingByok);
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^BYOK not configured/);
    expect(result.content[0].text).toContain('BYOK_BASE_URL');
    expect(vi.mocked(client.proxyStream)).not.toHaveBeenCalled();
  });

  it('6. extractor failure path — invalid HTML returns isError true with two content items, second mentions Post-generation validation failed', async () => {
    const invalidHtml = '<html><body>Not a design system at all</body></html>';
    const blocks = [
      `event: delta\ndata: {"delta":"${invalidHtml}"}\n\n`,
      'event: end\ndata: {}\n\n',
    ];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const handler = makeGenerateDesignSystemHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(2);
    expect(result.content[1].text).toContain('Post-generation validation failed');
  });

  it('7. maxTokens forwarded to proxy request body', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const handler = makeGenerateDesignSystemHandler(client, 600_000, stubByok());
    await handler({ ...DEFAULT_ARGS, maxTokens: 32_000 });

    expect(proxyStreamMock).toHaveBeenCalledOnce();
    const [req] = proxyStreamMock.mock.calls[0];
    expect(req.maxTokens).toBe(32_000);
  });

  it('8. happy path — valid design-system HTML returns no isError and content contains the HTML', async () => {
    const sseBlock = `event: delta\ndata: ${JSON.stringify({ delta: VALID_DESIGN_SYSTEM_HTML })}\n\n`;
    const blocks = [sseBlock, 'event: end\ndata: {}\n\n'];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const handler = makeGenerateDesignSystemHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('od-tokens');
  });

  it('9. systemPrompt sent to proxy is the DESIGN_SYSTEM_CHARTER', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const handler = makeGenerateDesignSystemHandler(client, 600_000, stubByok());
    await handler(DEFAULT_ARGS);

    const [req] = proxyStreamMock.mock.calls[0];
    expect(req.systemPrompt).toBe(DESIGN_SYSTEM_CHARTER);
  });

  it('10. briefAnswers and brandSpec are prepended to user message', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const handler = makeGenerateDesignSystemHandler(client, 600_000, stubByok());
    await handler({
      prompt: 'My brand',
      briefAnswers: { tone: 'minimal' },
      brandSpec: '## Brand\nIndigo palette',
    });

    const [req] = proxyStreamMock.mock.calls[0];
    expect(req.messages[0].content).toContain('Brief answers:');
    expect(req.messages[0].content).toContain('minimal');
    expect(req.messages[0].content).toContain('Brand specification:');
    expect(req.messages[0].content).toContain('Indigo palette');
    expect(req.messages[0].content).toContain('My brand');
  });

  it('11. prompt without briefAnswers/brandSpec is sent as-is', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const handler = makeGenerateDesignSystemHandler(client, 600_000, stubByok());
    await handler(DEFAULT_ARGS);

    const [req] = proxyStreamMock.mock.calls[0];
    expect(req.messages[0].content).toBe('Create a minimal design system');
  });

  it('12. inputSchema rejects empty prompt', () => {
    const result = generateDesignSystemInputSchema.safeParse({ prompt: '' });
    expect(result.success).toBe(false);
  });

  it('13. inputSchema defaults maxTokens to 64000', () => {
    const result = generateDesignSystemInputSchema.safeParse({ prompt: 'hello' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxTokens).toBe(64_000);
    }
  });

  it('14. inputSchema rejects maxTokens above 200000', () => {
    const result = generateDesignSystemInputSchema.safeParse({ prompt: 'x', maxTokens: 300_000 });
    expect(result.success).toBe(false);
  });
});
