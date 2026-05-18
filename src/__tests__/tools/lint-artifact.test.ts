import { describe, it, expect, vi } from 'vitest';
import { OdClient, OdHttpError } from '../../od-client.js';
import { makeLintArtifactHandler, lintArtifactInputSchema } from '../../tools/lint-artifact.js';

function makeStubClient(overrides: Partial<OdClient> = {}): OdClient {
  const client = Object.create(OdClient.prototype) as OdClient;
  return Object.assign(client, overrides);
}

describe('makeLintArtifactHandler', () => {
  it('empty findings — returns "Lint: 0 findings."', async () => {
    const client = makeStubClient({
      lintArtifact: vi.fn().mockResolvedValue({ findings: [] }),
    });
    const handler = makeLintArtifactHandler(client);
    const result = await handler(
      { html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Lint: 0 findings.');
  });

  it('multiple findings with severity mix — formats all findings', async () => {
    const client = makeStubClient({
      lintArtifact: vi.fn().mockResolvedValue({
        findings: [
          { severity: 'warning', message: 'missing alt', path: 'index.html', line: 10 },
          { severity: 'error', message: 'bad tag', path: 'index.html', line: 20 },
          { severity: 'info', message: 'consider refactor' },
        ],
      }),
    });
    const handler = makeLintArtifactHandler(client);
    const result = await handler(
      { html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Lint: 3 finding(s):');
    expect(text).toContain('- [warning] index.html:10 — missing alt');
    expect(text).toContain('- [error] index.html:20 — bad tag');
    expect(text).toContain('- [info] consider refactor');
  });

  it('agentMessage included — appended after findings', async () => {
    const client = makeStubClient({
      lintArtifact: vi.fn().mockResolvedValue({
        findings: [{ severity: 'warning', message: 'fix me' }],
        agentMessage: 'Please review these issues',
      }),
    });
    const handler = makeLintArtifactHandler(client);
    const result = await handler(
      { html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Agent: Please review these issues');
  });

  it('no agentMessage — no "Agent:" line in output', async () => {
    const client = makeStubClient({
      lintArtifact: vi.fn().mockResolvedValue({
        findings: [{ severity: 'warning', message: 'fix me' }],
      }),
    });
    const handler = makeLintArtifactHandler(client);
    const result = await handler(
      { html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).not.toContain('Agent:');
  });

  it('500 error — isError true, mentions OD daemon error', async () => {
    const client = makeStubClient({
      lintArtifact: vi.fn().mockRejectedValue(
        new OdHttpError('500', 500, 'Internal Server Error'),
      ),
    });
    const handler = makeLintArtifactHandler(client);
    const result = await handler(
      { html: '<html/>' },
      { signal: new AbortController().signal },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('od daemon error');
  });

  it('AbortSignal is forwarded to client.lintArtifact', async () => {
    let capturedSignal: AbortSignal | undefined;
    const client = makeStubClient({
      lintArtifact: vi.fn().mockImplementation(
        async (_html: unknown, signal: AbortSignal) => {
          capturedSignal = signal;
          return { findings: [] };
        },
      ),
    });
    const handler = makeLintArtifactHandler(client);
    const callerSignal = new AbortController().signal;
    await handler({ html: '<html/>' }, { signal: callerSignal });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('inputSchema rejects empty html', () => {
    const result = lintArtifactInputSchema.safeParse({ html: '' });
    expect(result.success).toBe(false);
  });
});
