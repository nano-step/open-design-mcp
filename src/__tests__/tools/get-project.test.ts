import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import { makeGetProjectHandler } from '../../tools/get-project.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  Object.defineProperty(client, 'authMode', {
    value: 'bearer',
    writable: true,
    configurable: true,
  });
  return Object.assign(client, overrides);
}

const PROJECT_DETAIL = {
  project: {
    id: 'p1',
    name: 'Hello',
    kind: 'prototype',
    statusInfo: { displayStatus: 'succeeded' },
    skillId: null,
    designSystemId: null,
    createdAt: 0,
    updatedAt: 0,
  },
  resolvedDir: '/tmp/od/p1',
};

const FILES_RESP = {
  files: [
    { name: 'index.html', path: 'index.html', kind: 'html', size: 100, mtime: 0, mime: 'text/html' },
    { name: 'style.css', path: 'style.css', kind: 'code', size: 50, mtime: 0, mime: 'text/css' },
  ],
};

describe('makeGetProjectHandler', () => {
  it('happy path — merges project + files, returns structuredContent', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.project.id).toBe('p1');
    expect(result.structuredContent?.project.name).toBe('Hello');
    expect(result.structuredContent?.project.resolvedDir).toBe('/tmp/od/p1');
    expect(result.structuredContent?.files).toHaveLength(2);
    expect(result.structuredContent?.files[0].path).toBe('index.html');
    expect(result.content[0].text).toContain('Hello');
    expect(result.content[0].text).toContain('Files (2)');
  });

  it('parallel fetch — both getProject and listFiles are called', async () => {
    const getProjectFn = vi.fn().mockResolvedValue(PROJECT_DETAIL);
    const listFilesFn = vi.fn().mockResolvedValue(FILES_RESP);
    const client = makeStubClient({
      getProject: getProjectFn,
      listFiles: listFilesFn,
    });
    const handler = makeGetProjectHandler(client);
    await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(getProjectFn).toHaveBeenCalledOnce();
    expect(listFilesFn).toHaveBeenCalledOnce();
  });

  it('404 on getProject — isError true, text contains "Project not found"', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockRejectedValue(new OdHttpError('404', 404, 'Not Found')),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'missing' }, { signal: new AbortController().signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found: missing');
  });

  it('404 on listFiles — isError true, text contains "Project not found"', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
      listFiles: vi.fn().mockRejectedValue(new OdHttpError('404', 404, 'Not Found')),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Project not found: p1');
  });

  it('500 on getProject — isError true, mentions OD daemon error', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockRejectedValue(
        new OdHttpError('500', 500, 'Internal Server Error'),
      ),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('od daemon error');
  });

  it('network error — isError true, mentions OD daemon unreachable', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('OD daemon unreachable');
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  it('empty files list — text shows Files (0)', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
      listFiles: vi.fn().mockResolvedValue({ files: [] }),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent?.files).toEqual([]);
    expect(result.content[0].text).toContain('Files (0)');
  });

  it('surfaces customInstructions from metadata.customInstructions in both text and structuredContent', async () => {
    const ci = 'BRAND SPEC FIXTURE — oklch palette + posture rules + anti-slop guard';
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue({
        project: {
          id: 'p1',
          name: 'Hello',
          metadata: { kind: 'prototype', customInstructions: ci },
          skillId: null,
          designSystemId: null,
          createdAt: 0,
          updatedAt: 0,
        },
        resolvedDir: '/tmp/od/p1',
      }),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.structuredContent?.project.customInstructions).toBe(ci);
    expect(result.content[0].text).toContain(`Custom Instructions (${ci.length} chars):`);
    expect(result.content[0].text).toContain(ci);
  });

  it('falls through to project.customInstructions when metadata.customInstructions is absent', async () => {
    const ci = 'top-level brand spec fallback';
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue({
        project: {
          id: 'p1',
          name: 'Hello',
          metadata: { kind: 'prototype' },
          customInstructions: ci,
          skillId: null,
          designSystemId: null,
          createdAt: 0,
          updatedAt: 0,
        },
        resolvedDir: '/tmp/od/p1',
      }),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.structuredContent?.project.customInstructions).toBe(ci);
  });

  it('returns customInstructions: undefined when daemon has neither', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue({
        project: {
          id: 'p1',
          name: 'Hello',
          metadata: { kind: 'prototype' },
          skillId: null,
          designSystemId: null,
          createdAt: 0,
          updatedAt: 0,
        },
        resolvedDir: '/tmp/od/p1',
      }),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.structuredContent?.project.customInstructions).toBeUndefined();
    expect(result.content[0].text).not.toContain('Custom Instructions (');
  });

  it('treats empty string customInstructions as undefined', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue({
        project: {
          id: 'p1',
          name: 'Hello',
          metadata: { kind: 'prototype', customInstructions: '' },
          skillId: null,
          designSystemId: null,
          createdAt: 0,
          updatedAt: 0,
        },
        resolvedDir: '/tmp/od/p1',
      }),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.structuredContent?.project.customInstructions).toBeUndefined();
  });

  it('surfaces kind from metadata.kind (regression for pre-existing bug)', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue({
        project: {
          id: 'p1',
          name: 'Hello',
          metadata: { kind: 'prototype' },
          skillId: null,
          designSystemId: null,
          createdAt: 0,
          updatedAt: 0,
        },
        resolvedDir: '/tmp/od/p1',
      }),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.structuredContent?.project.kind).toBe('prototype');
  });

  it('surfaces fidelity, skillId, designSystemId, createdAt, updatedAt when present', async () => {
    const client = makeStubClient({
      getProject: vi.fn().mockResolvedValue({
        project: {
          id: 'p1',
          name: 'Hello',
          metadata: { kind: 'prototype', fidelity: 'high-fidelity' },
          skillId: 'skill-42',
          designSystemId: 'ds-99',
          createdAt: 1716100000000,
          updatedAt: 1716200000000,
        },
        resolvedDir: '/tmp/od/p1',
      }),
      listFiles: vi.fn().mockResolvedValue(FILES_RESP),
    });
    const handler = makeGetProjectHandler(client);
    const result = await handler({ projectId: 'p1' }, { signal: new AbortController().signal });

    expect(result.structuredContent?.project.fidelity).toBe('high-fidelity');
    expect(result.structuredContent?.project.skillId).toBe('skill-42');
    expect(result.structuredContent?.project.designSystemId).toBe('ds-99');
    expect(result.structuredContent?.project.createdAt).toBe(1716100000000);
    expect(result.structuredContent?.project.updatedAt).toBe(1716200000000);
  });
});
