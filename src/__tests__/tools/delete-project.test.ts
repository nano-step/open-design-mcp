import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import { makeDeleteProjectHandler } from '../../tools/delete-project.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

describe('makeDeleteProjectHandler', () => {
  it('happy path — returns text "Deleted project: <id>"', async () => {
    const client = makeStubClient({
      deleteProject: vi.fn().mockResolvedValue({ ok: true }),
    });
    const handler = makeDeleteProjectHandler(client);
    const result = await handler(
      { projectId: 'p1' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Deleted project: p1');
  });

  it('404 — isError true, text contains "Project not found"', async () => {
    const client = makeStubClient({
      deleteProject: vi
        .fn()
        .mockRejectedValue(new OdHttpError('404', 404, 'Not Found')),
    });
    const handler = makeDeleteProjectHandler(client);
    const result = await handler(
      { projectId: 'missing' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found: missing');
  });

  it('401 — isError true, mentions OD_API_TOKEN', async () => {
    const client = makeStubClient({
      deleteProject: vi
        .fn()
        .mockRejectedValue(new OdHttpError('401', 401, 'Unauthorized')),
    });
    const handler = makeDeleteProjectHandler(client);
    const result = await handler(
      { projectId: 'p1' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD_API_TOKEN');
  });

  it('network error — isError true, mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      deleteProject: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const handler = makeDeleteProjectHandler(client);
    const result = await handler(
      { projectId: 'p1' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
  });
});
