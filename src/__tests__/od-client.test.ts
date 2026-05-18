import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OdClient,
  OdHttpError,
  type ProxyStreamRequest,
} from '../od-client.js';

let fetchMock: ReturnType<typeof vi.fn>;
let lastCall: { url: string; init: RequestInit } | null;

function mockOk(
  body: unknown,
  init: ResponseInit = { status: 200 },
): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), init));
}

function mockErr(
  status: number,
  statusText: string,
  bodyText = '',
): void {
  fetchMock.mockResolvedValueOnce(
    new Response(bodyText, { status, statusText }),
  );
}

function captureCalls(): void {
  fetchMock.mockImplementation(
    async (url: string | URL, init?: RequestInit) => {
      lastCall = { url: String(url), init: init ?? {} };
      return new Response('{}', { status: 200 });
    },
  );
  // Reset to clear any previous calls
  fetchMock.mockClear();
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  lastCall = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OdClient', () => {
  describe('listProjects', () => {
    it('happy path returns ProjectsResponse', async () => {
      const client = new OdClient('http://localhost:7456');
      const body = { projects: [{ id: 'p1', name: 'Project X' }] };
      mockOk(body);

      const signal = AbortSignal.timeout(5000);
      const result = await client.listProjects(signal);

      expect(result).toEqual(body);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:7456/api/projects');
      expect(init?.method).toBe('GET');
      expect(init?.signal).toBe(signal);
    });

    it('does not include Authorization header when token is empty', async () => {
      const client = new OdClient('http://localhost:7456', '');
      mockOk({});

      const signal = AbortSignal.timeout(5000);
      await client.listProjects(signal);

      const [, init] = fetchMock.mock.calls[0];
      expect(init?.headers).toBeDefined();
      const headers = init?.headers as Record<string, string>;
      expect(Object.hasOwn(headers, 'authorization')).toBe(false);
    });

    it('includes Authorization header when token is set', async () => {
      const client = new OdClient('http://localhost:7456', 'tk_abc123');
      mockOk({});

      const signal = AbortSignal.timeout(5000);
      await client.listProjects(signal);

      const [, init] = fetchMock.mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe('Bearer tk_abc123');
    });

    it('throws OdHttpError on 500', async () => {
      const client = new OdClient('http://localhost:7456');
      mockErr(500, 'Internal Server Error');

      const signal = AbortSignal.timeout(5000);
      const err = await client.listProjects(signal).catch((e) => e);
      expect(err).toBeInstanceOf(OdHttpError);
      expect(err.status).toBe(500);
      expect(err.statusText).toBe('Internal Server Error');
    });
  });

  describe('getProject', () => {
    it('URL-encodes project id', async () => {
      const client = new OdClient('http://localhost:7456');
      captureCalls();

      const signal = AbortSignal.timeout(5000);
      await client.getProject('a/b c', signal);

      expect(lastCall?.url).toContain('a%2Fb%20c');
    });

    it('throws OdHttpError on 404', async () => {
      const client = new OdClient('http://localhost:7456');
      mockErr(404, 'Not Found');

      const signal = AbortSignal.timeout(5000);
      const err = await client.getProject('missing', signal).catch((e) => e);

      expect(err).toBeInstanceOf(OdHttpError);
      expect(err.status).toBe(404);
    });

    it('happy path returns ProjectDetailResponse', async () => {
      const client = new OdClient('http://localhost:7456');
      const body = { id: 'p1', name: 'Project X', files: [] };
      mockOk(body);

      const signal = AbortSignal.timeout(5000);
      const result = await client.getProject('p1', signal);

      expect(result).toEqual(body);
    });
  });

  describe('listFiles', () => {
    it('happy path returns ProjectFilesResponse', async () => {
      const client = new OdClient('http://localhost:7456');
      const body = { files: [{ id: 'f1', name: 'index.html' }] };
      mockOk(body);

      const signal = AbortSignal.timeout(5000);
      const result = await client.listFiles('p1', signal);

      expect(result).toEqual(body);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:7456/api/projects/p1/files');
    });
  });

  describe('proxyStream', () => {
    it('returns raw Response without consuming body', async () => {
      const client = new OdClient('http://localhost:7456');
      const mockResponse = new Response('event: start\ndata: {}', {
        status: 200,
      });
      fetchMock.mockResolvedValueOnce(mockResponse);

      const req: ProxyStreamRequest = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-123',
        model: 'gpt-4',
        systemPrompt: 'You are helpful.',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const signal = AbortSignal.timeout(5000);
      const result = await client.proxyStream(req, 'openai', signal);

      expect(result).toBe(mockResponse);
      expect(result.bodyUsed).toBe(false);
    });

    it('sets accept: text/event-stream header', async () => {
      const client = new OdClient('http://localhost:7456');
      const mockResponse = new Response('', { status: 200 });
      fetchMock.mockResolvedValueOnce(mockResponse);

      const req: ProxyStreamRequest = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-123',
        model: 'gpt-4',
        systemPrompt: 'You are helpful.',
        messages: [],
      };

      const signal = AbortSignal.timeout(5000);
      await client.proxyStream(req, 'openai', signal);

      const [, init] = fetchMock.mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers.accept).toBe('text/event-stream');
    });

    it('throws OdHttpError on 401', async () => {
      const client = new OdClient('http://localhost:7456');
      mockErr(401, 'Unauthorized', 'Invalid credentials');

      const req: ProxyStreamRequest = {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'bad-key',
        model: 'gpt-4',
        systemPrompt: 'You are helpful.',
        messages: [],
      };

      const signal = AbortSignal.timeout(5000);
      const err = await client.proxyStream(req, 'openai', signal).catch((e) => e);

      expect(err).toBeInstanceOf(OdHttpError);
      expect(err.status).toBe(401);
      expect(err.bodySnippet).toContain('Invalid credentials');
    });

    it('constructs correct URL with provider', async () => {
      const client = new OdClient('http://localhost:7456');
      captureCalls();

      const req: ProxyStreamRequest = {
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'key',
        model: 'claude-3',
        systemPrompt: 'prompt',
        messages: [],
      };

      const signal = AbortSignal.timeout(5000);
      await client.proxyStream(req, 'anthropic', signal);

      expect(lastCall?.url).toBe(
        'http://localhost:7456/api/proxy/anthropic/stream',
      );
    });
  });

  describe('saveArtifact', () => {
    it('happy path returns SaveArtifactResponse', async () => {
      const client = new OdClient('http://localhost:7456');
      const body = { url: 'http://example.com/a1', path: '/artifacts/a1' };
      mockOk(body);

      const req = {
        identifier: 'my-artifact',
        title: 'My Design',
        html: '<html><body>Test</body></html>',
      };

      const signal = AbortSignal.timeout(5000);
      const result = await client.saveArtifact(req, signal);

      expect(result).toEqual(body);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:7456/api/artifacts/save');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual(req);
    });

    it('throws OdHttpError on 422 with body snippet', async () => {
      const client = new OdClient('http://localhost:7456');
      mockErr(
        422,
        'Unprocessable Entity',
        'identifier already exists in this workspace',
      );

      const req = {
        identifier: 'duplicate',
        title: 'Duplicate',
        html: '<html></html>',
      };

      const signal = AbortSignal.timeout(5000);
      const err = await client.saveArtifact(req, signal).catch((e) => e);

      expect(err).toBeInstanceOf(OdHttpError);
      expect(err.status).toBe(422);
      expect(err.bodySnippet).toContain('identifier already exists');
    });
  });

  describe('lintArtifact', () => {
    it('happy path returns ArtifactLintResponse', async () => {
      const client = new OdClient('http://localhost:7456');
      const body = {
        findings: [
          {
            severity: 'warning' as const,
            message: 'Missing alt text',
            path: 'index.html',
            line: 5,
          },
        ],
        agentMessage: 'Found 1 warning',
      };
      mockOk(body);

      const signal = AbortSignal.timeout(5000);
      const result = await client.lintArtifact('<div></div>', signal);

      expect(result).toEqual(body);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:7456/api/artifacts/lint');
      expect(JSON.parse(init?.body as string)).toEqual({
        html: '<div></div>',
      });
    });
  });

  describe('AbortSignal handling', () => {
    it('forwards AbortSignal to fetch', async () => {
      const client = new OdClient('http://localhost:7456');
      mockOk({});

      const signal = AbortSignal.timeout(5000);
      await client.listProjects(signal);

      const [, init] = fetchMock.mock.calls[0];
      expect(init?.signal).toBe(signal);
    });

    it('propagates already-aborted signal', async () => {
      const client = new OdClient('http://localhost:7456');

      const controller = new AbortController();
      controller.abort();

      await expect(client.listProjects(controller.signal)).rejects.toThrow();
    });
  });

  describe('baseUrl trailing slash handling', () => {
    it('strips trailing slash from baseUrl', async () => {
      const client = new OdClient('http://localhost:7456/', '');
      captureCalls();

      const signal = AbortSignal.timeout(5000);
      await client.listProjects(signal);

      const url = lastCall?.url ?? '';
      expect(url).toBe('http://localhost:7456/api/projects');
      expect(url).not.toMatch('//api');
    });

    it('preserves baseUrl without trailing slash', async () => {
      const client = new OdClient('http://localhost:7456', '');
      captureCalls();

      const signal = AbortSignal.timeout(5000);
      await client.listProjects(signal);

      const url = lastCall?.url ?? '';
      expect(url).toBe('http://localhost:7456/api/projects');
    });
  });

  describe('OdHttpError', () => {
    it('is an Error instance', () => {
      const err = new OdHttpError('Test error', 500, 'Internal Server Error');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('OdHttpError');
    });

    it('carries status and statusText', () => {
      const err = new OdHttpError(
        'Not found',
        404,
        'Not Found',
        'Resource missing',
      );
      expect(err.status).toBe(404);
      expect(err.statusText).toBe('Not Found');
      expect(err.bodySnippet).toBe('Resource missing');
    });

    it('can be instanceof checked', () => {
      const err = new OdHttpError('Test', 500, 'Error');
      expect(err instanceof OdHttpError).toBe(true);
    });
  });

  describe('content-type header', () => {
    it('sets content-type: application/json on all requests', async () => {
      const client = new OdClient('http://localhost:7456');
      mockOk({});

      const signal = AbortSignal.timeout(5000);
      await client.listProjects(signal);

      const [, init] = fetchMock.mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
    });
  });

  describe('error response body truncation', () => {
    it('truncates error body snippet to 200 chars', async () => {
      const client = new OdClient('http://localhost:7456');
      const longBody = 'x'.repeat(300);
      mockErr(500, 'Error', longBody);

      const signal = AbortSignal.timeout(5000);
      const err = await client.listProjects(signal).catch((e) => e);

      expect(err.bodySnippet?.length).toBeLessThanOrEqual(200);
      expect(err.bodySnippet).toBe('x'.repeat(200));
    });

    it('handles response body read errors gracefully', async () => {
      const client = new OdClient('http://localhost:7456');
      const badResponse = new Response(null, { status: 500 });
      badResponse.text = vi.fn().mockRejectedValueOnce(new Error('Read error'));
      fetchMock.mockResolvedValueOnce(badResponse);

      const signal = AbortSignal.timeout(5000);
      const err = await client.listProjects(signal).catch((e) => e);

      expect(err).toBeInstanceOf(OdHttpError);
      expect(err.bodySnippet).toBeUndefined();
    });
  });

  describe('POST body JSON encoding', () => {
    it('encodes request body as JSON', async () => {
      const client = new OdClient('http://localhost:7456');
      mockOk({});

      const req = {
        identifier: 'test',
        title: 'Test',
        html: '<div>content</div>',
      };

      const signal = AbortSignal.timeout(5000);
      await client.saveArtifact(req, signal);

      const [, init] = fetchMock.mock.calls[0];
      const bodyParsed = JSON.parse(init?.body as string);
      expect(bodyParsed).toEqual(req);
    });
  });
});
