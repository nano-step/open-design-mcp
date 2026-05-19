import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import {
  makeSaveProjectFileHandler,
  saveProjectFileInputSchema,
} from '../../tools/save-project-file.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

const canonicalFile = {
  name: 'index.html',
  path: 'index.html',
  size: 32400,
  mtime: 1779175480773.302,
  kind: 'html' as const,
  mime: 'text/html; charset=utf-8',
  artifactKind: 'html' as const,
  artifactManifest: {
    version: 1 as const,
    kind: 'html' as const,
    title: 'index.html',
    entry: 'index.html',
    renderer: 'html',
    status: 'complete',
    exports: ['html', 'pdf', 'zip'],
    metadata: { inferred: true },
  },
};

describe('makeSaveProjectFileHandler', () => {
  it('happy path — returns text with file details and structuredContent', async () => {
    const client = makeStubClient({
      saveProjectFile: vi.fn().mockResolvedValue({ file: canonicalFile }),
    });
    const handler = makeSaveProjectFileHandler(client);
    const result = await handler(
      { projectId: 'demo', name: 'index.html', content: '<html>hello</html>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Saved: index.html');
    expect(result.content[0].text).toContain('size: 32400');
    expect(result.content[0].text).toContain("project 'demo'");
    expect(result.structuredContent?.file).toEqual(canonicalFile);
  });

  it('404 → "Project not found" custom text', async () => {
    const client = makeStubClient({
      saveProjectFile: vi.fn().mockRejectedValue(
        new OdHttpError('404', 404, 'Not Found'),
      ),
    });
    const handler = makeSaveProjectFileHandler(client);
    const result = await handler(
      { projectId: 'demo', name: 'index.html', content: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found: demo');
  });

  it('401 → auth-mode hint', async () => {
    const client = makeStubClient({
      saveProjectFile: vi.fn().mockRejectedValue(
        new OdHttpError('401', 401, 'Unauthorized'),
      ),
    });
    const handler = makeSaveProjectFileHandler(client);
    const result = await handler(
      { projectId: 'demo', name: 'index.html', content: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD_API_TOKEN');
  });

  it('network unreachable — mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      saveProjectFile: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    });
    const handler = makeSaveProjectFileHandler(client);
    const result = await handler(
      { projectId: 'demo', name: 'index.html', content: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
  });

  it('AbortSignal is forwarded to client.saveProjectFile', async () => {
    let capturedSignal: AbortSignal | undefined;
    const client = makeStubClient({
      saveProjectFile: vi.fn().mockImplementation(
        async (_id: string, _body: unknown, signal: AbortSignal) => {
          capturedSignal = signal;
          return { file: canonicalFile };
        },
      ),
    });
    const handler = makeSaveProjectFileHandler(client);
    const callerSignal = new AbortController().signal;
    await handler(
      { projectId: 'demo', name: 'index.html', content: '<html/>' },
      { signal: callerSignal },
    );

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('path separator rejected — zod rejects name with "/"', () => {
    const result = saveProjectFileInputSchema.safeParse({
      projectId: 'demo',
      name: 'foo/bar.html',
      content: 'hello',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('path separators');
    }
  });

  it('content size cap — rejects content exceeding 5 MB by byte length', () => {
    const bigContent = '\u{1F600}'.repeat(1310721);
    expect(Buffer.byteLength(bigContent, 'utf8')).toBeGreaterThan(5 * 1024 * 1024);
    const result = saveProjectFileInputSchema.safeParse({
      projectId: 'demo',
      name: 'big.html',
      content: bigContent,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('5 MB');
    }
  });

  it('empty content rejected — zod .min(1) fires', () => {
    const result = saveProjectFileInputSchema.safeParse({
      projectId: 'demo',
      name: 'index.html',
      content: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('content must not be empty');
    }
  });
});
