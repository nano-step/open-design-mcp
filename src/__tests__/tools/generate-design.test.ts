import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { OdClient, OdHttpError } from '../../od-client.js';
import {
  makeGenerateDesignHandler,
  generateDesignInputSchema,
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
});
