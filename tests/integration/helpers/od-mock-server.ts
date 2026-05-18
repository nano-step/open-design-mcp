import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type MockHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: string,
) => void;

export interface MockOdServer {
  url: string;
  baseHeaders: Record<string, string>;
  handle(method: string, pathOrPattern: string | RegExp, handler: MockHandler): void;
  reset(): void;
  close(): Promise<void>;
}

export async function startMockOdServer(): Promise<MockOdServer> {
  const handlers: Array<{
    method: string;
    matcher: string | RegExp;
    handler: MockHandler;
  }> = [];
  let lastHeaders: Record<string, string> = {};

  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      lastHeaders = req.headers as Record<string, string>;
      const method = (req.method ?? 'GET').toUpperCase();
      const url = req.url ?? '/';
      const match = handlers.find((h) => {
        if (h.method !== method) return false;
        if (typeof h.matcher === 'string') return h.matcher === url;
        return h.matcher.test(url);
      });
      if (!match) {
        res.statusCode = 501;
        res.setHeader('content-type', 'text/plain');
        res.end(`mock: no handler for ${method} ${url}`);
        return;
      }
      match.handler(req, res, body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    get baseHeaders() {
      return lastHeaders;
    },
    handle(method, matcher, handler) {
      handlers.push({ method: method.toUpperCase(), matcher, handler });
    },
    reset() {
      handlers.length = 0;
      lastHeaders = {};
    },
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

export function respondJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
