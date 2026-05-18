import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import { makeSaveArtifactHandler, saveArtifactInputSchema } from '../../tools/save-artifact.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

describe('makeSaveArtifactHandler', () => {
  it('happy path — returns text with path and URL', async () => {
    const client = makeStubClient({
      saveArtifact: vi.fn().mockResolvedValue({
        url: 'http://localhost:7456/artifacts/my-slug/index.html',
        path: '/od/artifacts/my-slug/index.html',
      }),
    });
    const handler = makeSaveArtifactHandler(client);
    const result = await handler(
      { identifier: 'my-slug', title: 'My Artifact', html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('my-slug');
    expect(result.content[0].text).toContain('/od/artifacts/my-slug/index.html');
    expect(result.content[0].text).toContain('http://localhost:7456/artifacts/my-slug/index.html');
  });

  it('422 (duplicate identifier) — isError true, text contains "422"', async () => {
    const client = makeStubClient({
      saveArtifact: vi.fn().mockRejectedValue(
        new OdHttpError('422', 422, 'Unprocessable Entity'),
      ),
    });
    const handler = makeSaveArtifactHandler(client);
    const result = await handler(
      { identifier: 'dup-slug', title: 'Dup', html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('422');
  });

  it('401 — isError true, text mentions OD_API_TOKEN', async () => {
    const client = makeStubClient({
      saveArtifact: vi.fn().mockRejectedValue(
        new OdHttpError('401', 401, 'Unauthorized'),
      ),
    });
    const handler = makeSaveArtifactHandler(client);
    const result = await handler(
      { identifier: 'my-slug', title: 'My Artifact', html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD_API_TOKEN');
  });

  it('network error — isError true, text mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      saveArtifact: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const handler = makeSaveArtifactHandler(client);
    const result = await handler(
      { identifier: 'my-slug', title: 'My Artifact', html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  it('AbortSignal is forwarded to client.saveArtifact', async () => {
    let capturedSignal: AbortSignal | undefined;
    const client = makeStubClient({
      saveArtifact: vi.fn().mockImplementation(
        async (_req: unknown, signal: AbortSignal) => {
          capturedSignal = signal;
          return { url: 'http://x/p.html', path: '/dir/p.html' };
        },
      ),
    });
    const handler = makeSaveArtifactHandler(client);
    const callerSignal = new AbortController().signal;
    await handler(
      { identifier: 'my-slug', title: 'My Artifact', html: '<html/>' },
      { signal: callerSignal },
    );

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('inputSchema rejects identifier with uppercase/special chars', () => {
    const result = saveArtifactInputSchema.safeParse({
      identifier: 'BAD/UPPER',
      title: 'x',
      html: '<x/>',
    });
    expect(result.success).toBe(false);
  });
});
