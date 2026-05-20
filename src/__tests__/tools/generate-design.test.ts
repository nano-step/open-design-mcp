import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { OdClient, OdHttpError } from '../../od-client.js';
import {
  makeGenerateDesignHandler,
  mergeProjectInstructions,
  generateDesignInputSchema,
  buildDesignSystemContract,
  type GenerateDesignArgs,
} from '../../tools/generate-design.js';
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

const DEFAULT_ARGS: GenerateDesignArgs = { prompt: 'Create a dashboard', kind: 'prototype' };

describe('makeGenerateDesignHandler', () => {
  it('1. happy path with 3 deltas + end', async () => {
    const blocks = [
      'event: start\ndata: {"model":"m"}\n\n',
      'event: delta\ndata: {"delta":"Hello"}\n\n',
      'event: delta\ndata: {"delta":" World"}\n\n',
      'event: delta\ndata: {"delta":"!"}\n\n',
      'event: end\ndata: {}\n\n',
    ];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Hello World!');
  });

  it('2. empty stream (just end) — returns empty string, no isError', async () => {
    const blocks = ['event: end\ndata: {}\n\n'];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('');
  });

  it('3. error event mid-stream — isError true, text contains error message, prior deltas discarded', async () => {
    const blocks = [
      'event: start\ndata: {"model":"m"}\n\n',
      'event: delta\ndata: {"delta":"partial"}\n\n',
      'event: delta\ndata: {"delta":" text"}\n\n',
      'event: error\ndata: {"message":"rate limit","code":"429"}\n\n',
    ];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('rate limit');
  });

  it('4. proxyStream throws OdHttpError(401) — text mentions OD_API_TOKEN', async () => {
    const client = makeStubClient({
      proxyStream: vi.fn().mockRejectedValue(
        new OdHttpError('proxyStream: 401 Unauthorized', 401, 'Unauthorized'),
      ),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD_API_TOKEN');
  });

  it('5. proxyStream throws OdHttpError(500) — text mentions OD daemon error', async () => {
    const client = makeStubClient({
      proxyStream: vi.fn().mockRejectedValue(
        new OdHttpError('proxyStream: 500 Internal Server Error', 500, 'Internal Server Error'),
      ),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('od daemon error');
  });

  it('6. proxyStream throws generic network error — text mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      proxyStream: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  it('7. missing BYOK config (ZodError from loadByok) — isError true, text starts with BYOK not configured', async () => {
    const client = makeStubClient({
      proxyStream: vi.fn(),
    });
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
    const handler = makeGenerateDesignHandler(client, 600_000, throwingByok);
    const result = await handler(DEFAULT_ARGS);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/^BYOK not configured/);
    expect(result.content[0].text).toContain('BYOK_BASE_URL');
    expect(vi.mocked(client.proxyStream)).not.toHaveBeenCalled();
  });

  it('8. composeSystemPrompt is called with correct args — verifies proxyReq fields', async () => {
    const blocks = ['event: end\ndata: {}\n\n'];
    const proxyStreamMock = vi.fn().mockResolvedValue(sseResponse(blocks));
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const byok = stubByok();
    const handler = makeGenerateDesignHandler(client, 600_000, byok);
    await handler({
      prompt: 'Build a landing page',
      kind: 'prototype',
      userInstructions: 'Keep it minimal',
    });

    expect(proxyStreamMock).toHaveBeenCalledOnce();
    const [req] = proxyStreamMock.mock.calls[0];
    expect(req.baseUrl).toBe('http://test.local/v1');
    expect(req.apiKey).toBe('sk-test');
    expect(req.model).toBe('open-design');
    expect(req.messages).toEqual([{ role: 'user', content: 'Build a landing page' }]);
    expect(typeof req.systemPrompt).toBe('string');
    expect(req.systemPrompt.length).toBeGreaterThan(100);
    expect(req.systemPrompt).toContain('plain');
  });

  it('9. progress notification fires every 25 deltas', async () => {
    const deltas = Array.from({ length: 60 }, (_, i) =>
      `event: delta\ndata: {"delta":"x${i}"}\n\n`,
    );
    const blocks = [...deltas, 'event: end\ndata: {}\n\n'];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(DEFAULT_ARGS, {
      sendNotification,
      _meta: { progressToken: 'tok-42' },
    });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification.mock.calls[0][0]).toMatchObject({
      method: 'notifications/progress',
      params: { progress: 25, progressToken: 'tok-42' },
    });
    expect(sendNotification.mock.calls[1][0]).toMatchObject({
      method: 'notifications/progress',
      params: { progress: 50, progressToken: 'tok-42' },
    });
  });

  it('10. progress notification NOT fired when progressToken absent', async () => {
    const deltas = Array.from({ length: 60 }, (_, i) =>
      `event: delta\ndata: {"delta":"x${i}"}\n\n`,
    );
    const blocks = [...deltas, 'event: end\ndata: {}\n\n'];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(DEFAULT_ARGS, { sendNotification });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('11. abort signal forwarded to proxyStream as AbortSignal', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const controller = new AbortController();
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(DEFAULT_ARGS, { signal: controller.signal });

    expect(proxyStreamMock).toHaveBeenCalledOnce();
    const [, , signal] = proxyStreamMock.mock.calls[0];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('12. no API key leaks via stderr — sk-test must not appear in stderr output', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const blocks = [
      'event: delta\ndata: {"delta":"result"}\n\n',
      'event: end\ndata: {}\n\n',
    ];
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(sseResponse(blocks)),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(DEFAULT_ARGS);

    const allWrites = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(allWrites).not.toContain('sk-test');
    stderrSpy.mockRestore();
  });

  it('13. inputSchema rejects empty prompt', () => {
    const result = generateDesignInputSchema.safeParse({ prompt: '' });
    expect(result.success).toBe(false);
  });

  it('14. inputSchema defaults kind to prototype when omitted', () => {
    const result = generateDesignInputSchema.safeParse({ prompt: 'hi' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('prototype');
    }
  });

  it('15. inputSchema accepts all 7 ProjectKind values', () => {
    const kinds = ['prototype', 'deck', 'template', 'other', 'image', 'video', 'audio'] as const;
    for (const k of kinds) {
      const parsed = generateDesignInputSchema.safeParse({ prompt: 'x', kind: k });
      expect(parsed.success).toBe(true);
    }
  });

  it('16. inputSchema rejects design-system as kind (not a valid ProjectKind)', () => {
    const parsed = generateDesignInputSchema.safeParse({ prompt: 'x', kind: 'design-system' });
    expect(parsed.success).toBe(false);
  });

  it('17. returns isError when composeSystemPrompt throws', async () => {
    const sys = await import('../../../vendor/od-contracts/src/prompts/system.js');
    const spy = vi.spyOn(sys, 'composeSystemPrompt').mockImplementation(() => {
      throw new Error('synthetic compose failure');
    });
    try {
      const client = makeStubClient({ proxyStream: vi.fn() });
      const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
      const result = await handler({ prompt: 'x', kind: 'prototype' }, { signal: new AbortController().signal });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('synthetic compose failure');
      expect(vi.mocked(client.proxyStream)).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('18. returns isError when response has no body', async () => {
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler({ prompt: 'x', kind: 'prototype' }, { signal: new AbortController().signal });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('empty response body');
  });

  it('19. partial recovery on TimeoutError mid-stream (issue #33)', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: delta\ndata: {"delta":"<header>"}\n\n',
      'event: delta\ndata: {"delta":"<nav>"}\n\n',
      'event: delta\ndata: {"delta":"<hero>"}\n\n',
    ];
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (i < chunks.length) {
          c.enqueue(encoder.encode(chunks[i++]));
        } else {
          c.error(new DOMException('signal timed out', 'TimeoutError'));
        }
      },
    });
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    });
    const handler = makeGenerateDesignHandler(client, 300_000, stubByok());
    const result = await handler(DEFAULT_ARGS, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('<header><nav><hero>');
    expect(result.content[0].text).toContain('timed out after 300000ms');
    expect(result.content[0].text).toContain('3 deltas');
    expect(result.content[0].text).toContain('OD_GENERATE_TIMEOUT_MS');
  });

  it('20. partial recovery on AbortError client-cancel mid-stream (issue #33)', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: delta\ndata: {"delta":"part1"}\n\n',
      'event: delta\ndata: {"delta":"part2"}\n\n',
    ];
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (i < chunks.length) {
          c.enqueue(encoder.encode(chunks[i++]));
        } else {
          c.error(new DOMException('caller cancelled', 'AbortError'));
        }
      },
    });
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('part1part2');
    expect(result.content[0].text).toContain('cancelled by client');
    expect(result.content[0].text).not.toContain('timed out after');
  });

  it('21. TimeoutError with zero deltas falls through to mapErrorToToolResult (issue #33)', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(new DOMException('signal timed out', 'TimeoutError'));
      },
    });
    const client = makeStubClient({
      proxyStream: vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(DEFAULT_ARGS, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
    expect(result.content[0].text).not.toContain('Output is incomplete');
  });

  it('22. projectId + stored customInstructions → composeSystemPrompt receives stored value (issue #37)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn().mockResolvedValue({
      project: {
        id: 'proj-abc',
        name: 'Acme',
        customInstructions: 'brand: indigo #4F46E5, type: Inter',
      },
      resolvedDir: '/tmp/proj-abc',
    });
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(
      { prompt: 'pricing page', kind: 'prototype', projectId: 'proj-abc' },
      {},
    );
    expect(getProjectMock).toHaveBeenCalledOnce();
    expect(getProjectMock.mock.calls[0][0]).toBe('proj-abc');
    const proxyReq = proxyStreamMock.mock.calls[0][0];
    expect(proxyReq.systemPrompt).toContain('brand: indigo #4F46E5, type: Inter');
  });

  it('23. projectId + per-call projectInstructions → merged with separator (issue #37)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn().mockResolvedValue({
      project: { id: 'p', name: 'P', customInstructions: 'STORED brand rules' },
      resolvedDir: '/tmp/p',
    });
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(
      {
        prompt: 'pricing page',
        kind: 'prototype',
        projectId: 'p',
        projectInstructions: 'PERCALL refinement',
      },
      {},
    );
    const proxyReq = proxyStreamMock.mock.calls[0][0];
    expect(proxyReq.systemPrompt).toContain('STORED brand rules');
    expect(proxyReq.systemPrompt).toContain('PERCALL refinement');
    expect(proxyReq.systemPrompt).toMatch(/STORED brand rules[\s\S]*---[\s\S]*PERCALL refinement/);
  });

  it('24. projectId + project has NO customInstructions → falls back to per-call (issue #37)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn().mockResolvedValue({
      project: { id: 'p', name: 'P' },
      resolvedDir: '/tmp/p',
    });
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(
      {
        prompt: 'x',
        kind: 'prototype',
        projectId: 'p',
        projectInstructions: 'ONLY PERCALL',
      },
      {},
    );
    expect(getProjectMock).toHaveBeenCalledOnce();
    const proxyReq = proxyStreamMock.mock.calls[0][0];
    expect(proxyReq.systemPrompt).toContain('ONLY PERCALL');
    // Merge helper returned the per-call value unchanged (no stored + separator + percall pattern)
    expect(proxyReq.systemPrompt).not.toMatch(/STORED[\s\S]*\n\n---\n\nONLY PERCALL/);
  });

  it('25. projectId points at missing project → mapErrorToToolResult 404 path (issue #37)', async () => {
    const getProjectMock = vi.fn().mockRejectedValue(
      new OdHttpError(404, 'Not Found', 'Project not found'),
    );
    const proxyStreamMock = vi.fn();
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler(
      { prompt: 'x', kind: 'prototype', projectId: 'proj-nonexistent' },
      {},
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('not found');
    expect(proxyStreamMock).not.toHaveBeenCalled();
  });

  it('26. no projectId → getProject is NEVER called (backwards compat, issue #37)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn();
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(DEFAULT_ARGS, {});
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(proxyStreamMock).toHaveBeenCalledOnce();
  });

  it('27. projectId + only metadata.customInstructions present → composeSystemPrompt receives stashed value (issue #43)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn().mockResolvedValue({
      project: {
        id: 'p',
        name: 'P',
        metadata: { kind: 'page', customInstructions: 'STASHED brand rules' },
      },
      resolvedDir: '/tmp/p',
    });
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(
      { prompt: 'pricing page', kind: 'prototype', projectId: 'p' },
      {},
    );
    const proxyReq = proxyStreamMock.mock.calls[0][0];
    expect(proxyReq.systemPrompt).toContain('STASHED brand rules');
  });

  it('28. projectId + BOTH metadata and top-level set → metadata wins (issue #43)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn().mockResolvedValue({
      project: {
        id: 'p',
        name: 'P',
        customInstructions: 'TOP_LEVEL',
        metadata: { kind: 'page', customInstructions: 'METADATA_STASH' },
      },
      resolvedDir: '/tmp/p',
    });
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler(
      { prompt: 'pricing page', kind: 'prototype', projectId: 'p' },
      {},
    );
    const proxyReq = proxyStreamMock.mock.calls[0][0];
    expect(proxyReq.systemPrompt).toContain('METADATA_STASH');
    expect(proxyReq.systemPrompt).not.toContain('TOP_LEVEL');
  });

  it('29. maxTokens explicit value → forwarded to proxyStream (issue #36)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler({ prompt: 'x', kind: 'prototype', maxTokens: 32_000 }, {});
    expect(proxyStreamMock.mock.calls[0][0].maxTokens).toBe(32_000);
  });

  it('30. maxTokens omitted → default 64000 forwarded (issue #36)', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const client = makeStubClient({ proxyStream: proxyStreamMock });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const parsed = generateDesignInputSchema.parse({ prompt: 'x' });
    await handler(parsed, {});
    expect(proxyStreamMock.mock.calls[0][0].maxTokens).toBe(64_000);
  });

  it('31. maxTokens out of range (0 and 300000) → zod rejects', () => {
    const r1 = generateDesignInputSchema.safeParse({ prompt: 'x', maxTokens: 0 });
    expect(r1.success).toBe(false);
    if (!r1.success) {
      expect(r1.error.issues.some((i) => i.path.includes('maxTokens'))).toBe(true);
    }

    const r2 = generateDesignInputSchema.safeParse({ prompt: 'x', maxTokens: 300_000 });
    expect(r2.success).toBe(false);
    if (!r2.success) {
      expect(r2.error.issues.some((i) => i.path.includes('maxTokens'))).toBe(true);
    }
  });

  it('32. maxTokens non-integer (1.5) → zod rejects', () => {
    const r = generateDesignInputSchema.safeParse({ prompt: 'x', maxTokens: 1.5 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('maxTokens'))).toBe(true);
    }
  });
});

describe('buildDesignSystemContract', () => {
  const fakeExtracted = {
    version: 1,
    manifest: {
      version: 1 as const,
      tokens: {
        colors: { primary: '#4F46E5' },
        type: { fontFamily: 'Inter', scale: [12, 14, 16] },
        space: [4, 8, 16],
        unit: 'px' as const,
        radii: [4, 8],
        shadows: ['0 1px 3px rgba(0,0,0,0.1)'],
        breakpoints: [{ name: 'md', min: 768 }],
        zIndex: { modal: 100 },
      },
      components: [{ name: 'btn-primary', selector: '.btn-primary', role: 'button' as const, snippet: '<button class="btn-primary">Click</button>' }],
      layout: [{ name: 'container', selector: '.container', purpose: 'page width constraint' }],
    },
    tokensCss: ':root { --color-primary: #4F46E5; }',
    componentsCss: '.btn-primary { background: var(--color-primary); }',
    layoutCss: '.container { max-width: 1200px; }',
  };

  it('33. strict mode — heading and MUST rules present', () => {
    const result = buildDesignSystemContract(fakeExtracted, 'strict');
    expect(result).toContain('### Design System Contract (strict)');
    expect(result).toContain('You MUST inline the three');
    expect(result).toContain('You MUST NOT introduce new CSS custom properties');
    expect(result).toContain('<!-- need:');
  });

  it('34. advisory mode — heading present, no MUST rules', () => {
    const result = buildDesignSystemContract(fakeExtracted, 'advisory');
    expect(result).toContain('### Design System Contract (advisory)');
    expect(result).toContain('Prefer the documented tokens');
    expect(result).not.toContain('MUST');
  });

  it('35. off mode skips injection — no designSystemId, system prompt unchanged', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn().mockResolvedValue({
      project: { id: 'p', name: 'P' },
      resolvedDir: '/tmp/p',
    });
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    await handler({ prompt: 'x', kind: 'prototype', projectId: 'p' }, {});
    const proxyReq = proxyStreamMock.mock.calls[0][0];
    expect(proxyReq.systemPrompt).not.toContain('Design System Contract');
  });

  it('36. no designSystemId → system prompt identical to one from project without it', async () => {
    const proxyStreamMock1 = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const proxyStreamMock2 = vi.fn().mockResolvedValue(
      sseResponse(['event: end\ndata: {}\n\n']),
    );
    const getProjectMock = vi.fn().mockResolvedValue({
      project: { id: 'p', name: 'P' },
      resolvedDir: '/tmp/p',
    });

    const handler1 = makeGenerateDesignHandler(
      makeStubClient({ proxyStream: proxyStreamMock1, getProject: getProjectMock }),
      600_000,
      stubByok(),
    );
    const handler2 = makeGenerateDesignHandler(
      makeStubClient({ proxyStream: proxyStreamMock2, getProject: getProjectMock }),
      600_000,
      stubByok(),
    );

    await handler1({ prompt: 'x', kind: 'prototype', projectId: 'p' }, {});
    await handler2({ prompt: 'x', kind: 'prototype', projectId: 'p' }, {});

    const sp1 = proxyStreamMock1.mock.calls[0][0].systemPrompt;
    const sp2 = proxyStreamMock2.mock.calls[0][0].systemPrompt;
    expect(sp1).toBe(sp2);
  });

  it('37. designSystemMode "loose" is rejected by Zod', () => {
    const result = generateDesignInputSchema.safeParse({ prompt: 'x', designSystemMode: 'loose' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('designSystemMode'))).toBe(true);
    }
  });

  it('falls back to advisory comment when designSystemId is linked but file content is unavailable', async () => {
    const proxyStreamMock = vi.fn().mockResolvedValue(
      sseResponse(['event: delta\ndata: {"delta":"<html>page</html>"}\n\n', 'event: end\ndata: {}\n\n']),
    );
    const listFilesMock = vi.fn().mockResolvedValue({
      files: [
        { name: 'design-system.html', size: 1024, mtime: Date.now(), kind: 'html' as const, mime: 'text/html' },
      ],
    });
    const getProjectMock = vi.fn().mockResolvedValue({
      project: { id: 'p', name: 'P', designSystemId: 'design-system.html' },
      resolvedDir: '/tmp/p',
    });
    const client = makeStubClient({
      proxyStream: proxyStreamMock,
      listFiles: listFilesMock,
      getProject: getProjectMock,
    });
    const handler = makeGenerateDesignHandler(client, 600_000, stubByok());
    const result = await handler({ prompt: 'test design', kind: 'prototype', projectId: 'p' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe('text');
    const text = result.content[0].text;
    expect(text).toContain('<!-- Warning: design system file "design-system.html" found but content is not available via the files list API. Design system contract skipped. -->');
    expect(text).toContain('<html>page</html>');
    expect(text.indexOf('<!-- Warning:')).toBeLessThan(text.indexOf('<html>'));

    const proxyReq = proxyStreamMock.mock.calls[0][0];
    expect(proxyReq.systemPrompt).not.toContain('Design System Contract');
  });
});

describe('mergeProjectInstructions (issue #37)', () => {
  it('27. both undefined → undefined', () => {
    expect(mergeProjectInstructions(undefined, undefined)).toBeUndefined();
  });

  it('28. only stored → stored', () => {
    expect(mergeProjectInstructions('brand rules', undefined)).toBe('brand rules');
  });

  it('29. only per-call → per-call', () => {
    expect(mergeProjectInstructions(undefined, 'override')).toBe('override');
  });

  it('30. both → stored + separator + per-call', () => {
    expect(mergeProjectInstructions('STORED', 'PERCALL')).toBe(
      'STORED\n\n---\n\nPERCALL',
    );
  });

  it('31. empty string stored → treated as missing', () => {
    expect(mergeProjectInstructions('', 'percall')).toBe('percall');
  });
});
