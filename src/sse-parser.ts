export interface OdSseStart {
  type: 'start';
  model?: string;
}

export interface OdSseDelta {
  type: 'delta';
  delta: string;
}

export interface OdSseEnd {
  type: 'end';
}

export interface OdSseError {
  type: 'error';
  message: string;
  code?: string;
}

export type OdSseEvent = OdSseStart | OdSseDelta | OdSseEnd | OdSseError;

/**
 * Parse a single block (delimited by \n\n) into an OdSseEvent.
 * Returns null if the block is empty, comment-only, or unknown event type.
 * Per W3C SSE spec, consecutive `data:` lines are concatenated with \n.
 */
function parseBlock(block: string): OdSseEvent | null {
  const lines = block.split('\n');
  let eventType: string | null = null;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue;
    }
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (!eventType) {
    return null;
  }

  const data = dataLines.join('\n');

  if (eventType === 'start') {
    try {
      const parsed = JSON.parse(data);
      return { type: 'start', model: parsed.model };
    } catch {
      return { type: 'start' };
    }
  }

  if (eventType === 'delta') {
    try {
      const parsed = JSON.parse(data);
      return { type: 'delta', delta: parsed.delta ?? '' };
    } catch {
      process.stderr.write(
        '[open-design-mcp] sse-parser: dropping delta with malformed JSON\n',
      );
      return null;
    }
  }

  if (eventType === 'end') {
    return { type: 'end' };
  }

  if (eventType === 'error') {
    try {
      const parsed = JSON.parse(data);
      return {
        type: 'error',
        message: parsed.message ?? 'unknown error',
        code: parsed.code,
      };
    } catch {
      return { type: 'error', message: 'unknown error' };
    }
  }

  return null;
}

/**
 * Async generator that parses a ReadableStream of SSE events.
 * Handles chunk boundaries correctly — incomplete blocks are buffered.
 * Yields OdSseEvent objects as they are parsed.
 */
export async function* parseOdSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<OdSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const evt = parseBlock(block);
        if (evt) yield evt;
      }
    }

    if (buffer.trim()) {
      const evt = parseBlock(buffer);
      if (evt) yield evt;
    }
  } finally {
    reader.releaseLock();
  }
}
