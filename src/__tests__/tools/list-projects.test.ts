import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import { makeListProjectsHandler } from '../../tools/list-projects.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

const PROJECTS_FIXTURE = [
  {
    id: 'p1',
    name: 'Hello',
    kind: 'prototype',
    statusInfo: { displayStatus: 'succeeded' },
    skillId: null,
    designSystemId: null,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'p2',
    name: 'World',
    kind: 'deck',
    skillId: null,
    designSystemId: null,
    createdAt: 0,
    updatedAt: 0,
  },
];

describe('makeListProjectsHandler', () => {
  it('happy path — returns text summary and structuredContent', async () => {
    const client = makeStubClient({
      listProjects: vi.fn().mockResolvedValue({ projects: PROJECTS_FIXTURE }),
    });
    const handler = makeListProjectsHandler(client);
    const result = await handler({}, { signal: new AbortController().signal });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.projects).toHaveLength(2);
    expect(result.structuredContent?.projects[0]).toMatchObject({ id: 'p1', name: 'Hello' });
    expect(result.content[0].text).toContain('p1');
    expect(result.content[0].text).toContain('Hello');
    expect(result.content[0].text).toContain('[succeeded]');
    expect(result.content[0].text).toContain('p2');
    expect(result.content[0].text).toContain('World');
  });

  it('empty list — returns "No projects found." and empty array', async () => {
    const client = makeStubClient({
      listProjects: vi.fn().mockResolvedValue({ projects: [] }),
    });
    const handler = makeListProjectsHandler(client);
    const result = await handler({}, { signal: new AbortController().signal });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.projects).toEqual([]);
    expect(result.content[0].text).toBe('No projects found.');
  });

  it('OdHttpError 401 — isError true, mentions OD_API_TOKEN', async () => {
    const client = makeStubClient({
      listProjects: vi.fn().mockRejectedValue(new OdHttpError('401', 401, 'Unauthorized')),
    });
    const handler = makeListProjectsHandler(client);
    const result = await handler({}, { signal: new AbortController().signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD_API_TOKEN');
  });

  it('OdHttpError 500 — isError true, mentions OD daemon error', async () => {
    const client = makeStubClient({
      listProjects: vi.fn().mockRejectedValue(
        new OdHttpError('500', 500, 'Internal Server Error'),
      ),
    });
    const handler = makeListProjectsHandler(client);
    const result = await handler({}, { signal: new AbortController().signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('od daemon error');
  });

  it('network error — isError true, mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      listProjects: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const handler = makeListProjectsHandler(client);
    const result = await handler({}, { signal: new AbortController().signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  it('surfaces kind from metadata.kind (regression for pre-existing bug)', async () => {
    const client = makeStubClient({
      listProjects: vi.fn().mockResolvedValue({
        projects: [
          {
            id: 'p1',
            name: 'Hello',
            metadata: { kind: 'prototype' },
            statusInfo: { displayStatus: 'succeeded' },
            skillId: null,
            designSystemId: null,
            createdAt: 0,
            updatedAt: 0,
          },
          {
            id: 'p2',
            name: 'World',
            metadata: { kind: 'deck' },
            skillId: null,
            designSystemId: null,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      }),
    });
    const handler = makeListProjectsHandler(client);
    const result = await handler({}, { signal: new AbortController().signal });

    expect(result.structuredContent?.projects[0].kind).toBe('prototype');
    expect(result.structuredContent?.projects[1].kind).toBe('deck');
  });

  it('AbortSignal is forwarded to client.listProjects', async () => {
    let capturedSignal: AbortSignal | undefined;
    const client = makeStubClient({
      listProjects: vi.fn().mockImplementation(async (signal: AbortSignal) => {
        capturedSignal = signal;
        return { projects: [] };
      }),
    });
    const handler = makeListProjectsHandler(client);
    const callerSignal = new AbortController().signal;
    await handler({}, { signal: callerSignal });

    expect(capturedSignal).toBeDefined();
    // The signal forwarded is a composed AbortSignal.any([timeout, callerSignal])
    // It should be an AbortSignal instance.
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});
