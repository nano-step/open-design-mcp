/**
 * od-client: HTTP wrapper for the Open Design daemon.
 *
 * Wraps the 6 endpoints byok-pipeline-tool needs:
 *   - GET    /api/projects                          → listProjects
 *   - GET    /api/projects/:id                      → getProject
 *   - GET    /api/projects/:id/files                → listFiles
 *   - POST   /api/proxy/<provider>/stream           → proxyStream
 *   - POST   /api/artifacts/save                    → saveArtifact
 *   - POST   /api/artifacts/lint                    → lintArtifact
 *
 * Design references: §B6 (AbortSignal composition), §B7 (typed responses),
 * §B14 (logging — never log Authorization headers or API keys).
 */
import type {
  ProjectsResponse,
  ProjectDetailResponse,
} from '../vendor/od-contracts/src/api/projects.js';
import type { ProjectFilesResponse } from '../vendor/od-contracts/src/api/files.js';
import type {
  SaveArtifactRequest,
  SaveArtifactResponse,
} from '../vendor/od-contracts/src/api/artifacts.js';

// Not vendored — define locally. Aligns with design §B5 + §B7.
export type ProviderId = 'openai' | 'anthropic' | 'azure' | 'google' | 'ollama';

export interface ProxyStreamRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

export interface ArtifactLintFinding {
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  line?: number;
}

export interface ArtifactLintResponse {
  findings: ArtifactLintFinding[];
  agentMessage?: string;
}

/**
 * Error type emitted when the OD daemon returns a non-2xx status.
 * Carries the HTTP status so callers can map to MCP tool errors per
 * design §B8 (error mapping table).
 */
export class OdHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = 'OdHttpError';
  }
}

/**
 * Typed HTTP client for the OD daemon. Stateless — each method composes
 * the caller's AbortSignal with no internal timeout (tools layer adds
 * AbortSignal.timeout when calling).
 */
export class OdClient {
  private baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string = '',
  ) {
    // Trim trailing slash so `${baseUrl}/api/...` is well-formed.
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  async listProjects(signal: AbortSignal): Promise<ProjectsResponse> {
    return this.getJson<ProjectsResponse>('/api/projects', signal);
  }

  async getProject(
    id: string,
    signal: AbortSignal,
  ): Promise<ProjectDetailResponse> {
    return this.getJson<ProjectDetailResponse>(
      `/api/projects/${encodeURIComponent(id)}`,
      signal,
    );
  }

  async listFiles(
    id: string,
    signal: AbortSignal,
  ): Promise<ProjectFilesResponse> {
    return this.getJson<ProjectFilesResponse>(
      `/api/projects/${encodeURIComponent(id)}/files`,
      signal,
    );
  }

  /**
   * Stream proxy for AI generation. Returns the raw Response — caller
   * (od_generate_design tool, PR-E) feeds `response.body` into parseOdSse.
   * Does NOT consume the body here.
   */
  async proxyStream(
    req: ProxyStreamRequest,
    provider: ProviderId,
    signal: AbortSignal,
  ): Promise<Response> {
    const url = `${this.baseUrl}/api/proxy/${provider}/stream`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers({ accept: 'text/event-stream' }),
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) {
      const snippet = await this.readSnippet(res);
      throw new OdHttpError(
        `proxyStream: ${res.status} ${res.statusText}`,
        res.status,
        res.statusText,
        snippet,
      );
    }
    return res;
  }

  async saveArtifact(
    req: SaveArtifactRequest,
    signal: AbortSignal,
  ): Promise<SaveArtifactResponse> {
    return this.postJson<SaveArtifactResponse>(
      '/api/artifacts/save',
      req,
      signal,
    );
  }

  async lintArtifact(
    html: string,
    signal: AbortSignal,
  ): Promise<ArtifactLintResponse> {
    return this.postJson<ArtifactLintResponse>(
      '/api/artifacts/lint',
      { html },
      signal,
    );
  }

  // --- private helpers ---

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      ...extra,
    };
    if (this.token) {
      h.authorization = `Bearer ${this.token}`;
    }
    return h;
  }

  private async getJson<T>(path: string, signal: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
      signal,
    });
    if (!res.ok) {
      const snippet = await this.readSnippet(res);
      throw new OdHttpError(
        `${path}: ${res.status} ${res.statusText}`,
        res.status,
        res.statusText,
        snippet,
      );
    }
    return (await res.json()) as T;
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const snippet = await this.readSnippet(res);
      throw new OdHttpError(
        `${path}: ${res.status} ${res.statusText}`,
        res.status,
        res.statusText,
        snippet,
      );
    }
    return (await res.json()) as T;
  }

  /**
   * Read up to 200 chars of an error response body for debugging. Never
   * logged anywhere by this client — caller decides. Snippet is the only
   * place where untrusted body text reaches application code; safe for
   * inclusion in error messages.
   */
  private async readSnippet(res: Response): Promise<string | undefined> {
    try {
      const text = await res.text();
      return text.slice(0, 200);
    } catch {
      return undefined;
    }
  }
}
