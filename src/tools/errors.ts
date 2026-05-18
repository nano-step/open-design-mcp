import { OdHttpError } from '../od-client.js';

export interface ToolErrorResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

export function mapErrorToToolResult(err: unknown): ToolErrorResult {
  if (err instanceof OdHttpError) {
    const text =
      err.status === 401
        ? (process.env.OD_AUTH_MODE === 'basic'
            ? 'OD auth failed — check OD_BASIC_USER/OD_BASIC_PASS'
            : 'OD auth failed — check OD_API_TOKEN')
        : err.status === 403
          ? 'OD rejected request (SSRF protection?)'
          : err.status === 404
            ? `OD daemon returned 404: ${err.statusText}`
            : err.status === 429
              ? 'Rate limited — retry shortly'
              : err.status >= 500
                ? `OD daemon error: ${err.statusText}`
                : `OD daemon returned ${err.status} ${err.statusText}`;
    return { content: [{ type: 'text', text }], isError: true };
  }
  const reason = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `OD daemon unreachable: ${reason}` }],
    isError: true,
  };
}

/**
 * Specialized 404 mapper for tools where 404 is semantically meaningful
 * (e.g. od_get_project — caller passes an id that doesn't exist).
 */
export function mapErrorToToolResultWith404(
  err: unknown,
  notFoundText: string,
): ToolErrorResult {
  if (err instanceof OdHttpError && err.status === 404) {
    return { content: [{ type: 'text', text: notFoundText }], isError: true };
  }
  return mapErrorToToolResult(err);
}
