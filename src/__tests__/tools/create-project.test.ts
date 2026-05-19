import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import { makeCreateProjectHandler } from '../../tools/create-project.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

describe('makeCreateProjectHandler', () => {
  it('happy path — returns text summary and structuredContent', async () => {
    const client = makeStubClient({
      createProject: vi.fn().mockResolvedValue({
        project: { id: 'my-proj', name: 'My Project' },
        conversationId: 'conv-1',
      }),
    });
    const handler = makeCreateProjectHandler(client);
    const result = await handler(
      { id: 'my-proj', name: 'My Project' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Created project "My Project"');
    expect(result.content[0].text).toContain('my-proj');
    expect(result.content[0].text).toContain('conv-1');
    expect(result.structuredContent?.project.id).toBe('my-proj');
    expect(result.structuredContent?.conversationId).toBe('conv-1');
  });

  it('maps kind/fidelity to nested metadata', async () => {
    const createFn = vi.fn().mockResolvedValue({
      project: { id: 'p1', name: 'Test' },
      conversationId: 'c1',
    });
    const client = makeStubClient({ createProject: createFn });
    const handler = makeCreateProjectHandler(client);
    await handler(
      { id: 'p1', name: 'Test', kind: 'deck', fidelity: 'wireframe' },
      { signal: new AbortController().signal },
    );

    const body = createFn.mock.calls[0][0];
    expect(body.metadata).toEqual({ kind: 'deck', fidelity: 'wireframe' });
  });

  it('omits metadata when kind and fidelity are absent', async () => {
    const createFn = vi.fn().mockResolvedValue({
      project: { id: 'p1', name: 'Test' },
      conversationId: 'c1',
    });
    const client = makeStubClient({ createProject: createFn });
    const handler = makeCreateProjectHandler(client);
    await handler(
      { id: 'p1', name: 'Test' },
      { signal: new AbortController().signal },
    );

    const body = createFn.mock.calls[0][0];
    expect(body.metadata).toBeUndefined();
  });

  it('OdHttpError 400 — isError true, maps via mapErrorToToolResult', async () => {
    const client = makeStubClient({
      createProject: vi
        .fn()
        .mockRejectedValue(new OdHttpError('400', 400, 'Bad Request', 'invalid project id')),
    });
    const handler = makeCreateProjectHandler(client);
    const result = await handler(
      { id: 'bad id!', name: 'Test' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('400');
  });

  it('OdHttpError 401 — isError true, mentions OD_API_TOKEN', async () => {
    const client = makeStubClient({
      createProject: vi
        .fn()
        .mockRejectedValue(new OdHttpError('401', 401, 'Unauthorized')),
    });
    const handler = makeCreateProjectHandler(client);
    const result = await handler(
      { id: 'p1', name: 'Test' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD_API_TOKEN');
  });

  it('network error — isError true, mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      createProject: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const handler = makeCreateProjectHandler(client);
    const result = await handler(
      { id: 'p1', name: 'Test' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
  });

  it('customInstructions → create body includes BOTH top-level and metadata.customInstructions (issue #43)', async () => {
    const createFn = vi.fn().mockResolvedValue({
      project: { id: 'p1', name: 'Test' },
      conversationId: 'c1',
    });
    const client = makeStubClient({ createProject: createFn });
    const handler = makeCreateProjectHandler(client);
    await handler(
      { id: 'p1', name: 'Test', customInstructions: 'use dark theme' },
      { signal: new AbortController().signal },
    );

    const body = createFn.mock.calls[0][0];
    expect(body.customInstructions).toBe('use dark theme');
    expect(body.metadata.customInstructions).toBe('use dark theme');
  });
});
