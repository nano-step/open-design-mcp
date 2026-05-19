import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import { makeUpdateProjectHandler } from '../../tools/update-project.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

describe('makeUpdateProjectHandler', () => {
  it('happy path — returns text summary and structuredContent', async () => {
    const client = makeStubClient({
      updateProject: vi.fn().mockResolvedValue({
        project: { id: 'p1', name: 'Updated Name' },
        resolvedDir: '/tmp/od/p1',
      }),
    });
    const handler = makeUpdateProjectHandler(client);
    const result = await handler(
      { projectId: 'p1', name: 'Updated Name' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Updated project "Updated Name"');
    expect(result.structuredContent?.project.id).toBe('p1');
  });

  it('maps kind/fidelity/linkedDirs to nested metadata', async () => {
    const updateFn = vi.fn().mockResolvedValue({
      project: { id: 'p1', name: 'Test' },
      resolvedDir: '/tmp/od/p1',
    });
    const client = makeStubClient({ updateProject: updateFn });
    const handler = makeUpdateProjectHandler(client);
    await handler(
      { projectId: 'p1', kind: 'deck', fidelity: 'wireframe', linkedDirs: ['/tmp/a'] },
      { signal: new AbortController().signal },
    );

    const [, patch] = updateFn.mock.calls[0];
    expect(patch.metadata).toEqual({
      kind: 'deck',
      fidelity: 'wireframe',
      linkedDirs: ['/tmp/a'],
    });
  });

  it('404 — isError true, text contains "Project not found"', async () => {
    const client = makeStubClient({
      updateProject: vi
        .fn()
        .mockRejectedValue(new OdHttpError('404', 404, 'Not Found')),
    });
    const handler = makeUpdateProjectHandler(client);
    const result = await handler(
      { projectId: 'missing', name: 'X' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found: missing');
  });

  it('400 — isError true', async () => {
    const client = makeStubClient({
      updateProject: vi
        .fn()
        .mockRejectedValue(new OdHttpError('400', 400, 'Bad Request', 'name too long')),
    });
    const handler = makeUpdateProjectHandler(client);
    const result = await handler(
      { projectId: 'p1', name: 'x'.repeat(9999) },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('400');
  });

  it('network error — isError true, mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      updateProject: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const handler = makeUpdateProjectHandler(client);
    const result = await handler(
      { projectId: 'p1', name: 'X' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
  });

  it('customInstructions → patch includes BOTH top-level and metadata.customInstructions (issue #43)', async () => {
    const updateFn = vi.fn().mockResolvedValue({
      project: { id: 'p1', name: 'Test' },
      resolvedDir: '/tmp/od/p1',
    });
    const client = makeStubClient({ updateProject: updateFn });
    const handler = makeUpdateProjectHandler(client);
    await handler(
      { projectId: 'p1', customInstructions: 'brand: indigo' },
      { signal: new AbortController().signal },
    );

    const [, patch] = updateFn.mock.calls[0];
    expect(patch.customInstructions).toBe('brand: indigo');
    expect(patch.metadata.customInstructions).toBe('brand: indigo');
  });
});
