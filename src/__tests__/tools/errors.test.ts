import { describe, it, expect } from 'vitest';
import { OdHttpError } from '../../od-client.js';
import {
  mapErrorToToolResult,
  mapErrorToToolResultWith404,
} from '../../tools/errors.js';

const err401 = new OdHttpError('401 Unauthorized', 401, 'Unauthorized');
const err403 = new OdHttpError('403 Forbidden', 403, 'Forbidden');
const err404 = new OdHttpError('404 Not Found', 404, 'Not Found');
const err429 = new OdHttpError('429 Too Many', 429, 'Too Many Requests');
const err500 = new OdHttpError('500 Server', 500, 'Internal Server Error');
const networkErr = new TypeError('fetch failed');

describe('mapErrorToToolResult — mode-aware 401', () => {
  it('401 in bearer mode names OD_API_TOKEN', () => {
    const r = mapErrorToToolResult(err401, 'bearer');
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe('OD auth failed — check OD_API_TOKEN');
  });

  it('401 in basic mode names OD_BASIC_USER + OD_BASIC_PASS', () => {
    const r = mapErrorToToolResult(err401, 'basic');
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe(
      'OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS',
    );
  });

  it('401 in none mode advises setting OD_AUTH_MODE + credentials', () => {
    const r = mapErrorToToolResult(err401, 'none');
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe(
      'OD daemon returned 401 — set OD_AUTH_MODE and credentials',
    );
  });

  it('401 with default arg (no mode supplied) falls back to bearer message', () => {
    const r = mapErrorToToolResult(err401);
    expect(r.content[0]?.text).toBe('OD auth failed — check OD_API_TOKEN');
  });

  it('does not leak the mode value into non-401 messages', () => {
    const r = mapErrorToToolResult(err500, 'basic');
    expect(r.content[0]?.text).not.toMatch(/OD_BASIC/);
    expect(r.content[0]?.text).not.toMatch(/OD_API_TOKEN/);
  });
});

describe('mapErrorToToolResult — non-401 unchanged across modes', () => {
  const cases: Array<[string, 'none' | 'bearer' | 'basic']> = [
    ['none', 'none'],
    ['bearer', 'bearer'],
    ['basic', 'basic'],
  ];

  for (const [label, mode] of cases) {
    it(`403 in ${label} mode is the SSRF message`, () => {
      const r = mapErrorToToolResult(err403, mode);
      expect(r.content[0]?.text).toBe('OD rejected request (SSRF protection?)');
    });

    it(`404 in ${label} mode reports status text`, () => {
      const r = mapErrorToToolResult(err404, mode);
      expect(r.content[0]?.text).toBe('OD daemon returned 404: Not Found');
    });

    it(`429 in ${label} mode is rate-limited`, () => {
      const r = mapErrorToToolResult(err429, mode);
      expect(r.content[0]?.text).toBe('Rate limited — retry shortly');
    });

    it(`5xx in ${label} mode is OD daemon error`, () => {
      const r = mapErrorToToolResult(err500, mode);
      expect(r.content[0]?.text).toBe('OD daemon error: Internal Server Error');
    });

    it(`network error in ${label} mode is unreachable`, () => {
      const r = mapErrorToToolResult(networkErr, mode);
      expect(r.content[0]?.text).toMatch(/^OD daemon unreachable:/);
    });
  }
});

describe('mapErrorToToolResultWith404 — forwards authMode for non-404 cases', () => {
  it('404 returns the specific not-found text regardless of mode', () => {
    const r = mapErrorToToolResultWith404(err404, 'Project not found: x', 'basic');
    expect(r.content[0]?.text).toBe('Project not found: x');
  });

  it('non-404 forwards authMode to mapErrorToToolResult', () => {
    const r = mapErrorToToolResultWith404(err401, 'irrelevant', 'basic');
    expect(r.content[0]?.text).toBe(
      'OD auth failed — check OD_BASIC_USER and OD_BASIC_PASS',
    );
  });

  it('non-404 with default arg falls back to bearer', () => {
    const r = mapErrorToToolResultWith404(err401, 'irrelevant');
    expect(r.content[0]?.text).toBe('OD auth failed — check OD_API_TOKEN');
  });
});
