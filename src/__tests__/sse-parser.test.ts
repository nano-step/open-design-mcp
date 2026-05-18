import { describe, it, expect } from 'vitest';
import { parseOdSse, OdSseEvent } from '../sse-parser.js';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collectEvents(
  stream: ReadableStream<Uint8Array>,
): Promise<OdSseEvent[]> {
  const events: OdSseEvent[] = [];
  for await (const evt of parseOdSse(stream)) {
    events.push(evt);
  }
  return events;
}

describe('sse-parser.ts', () => {
  it('parses single event stream (start + end)', async () => {
    const stream = streamFromChunks([
      'event: start\ndata: {"model":"test-model"}\n\n',
      'event: end\ndata: {}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'start', model: 'test-model' });
    expect(events[1]).toEqual({ type: 'end' });
  });

  it('parses multi-delta stream with correct order and text concatenation', async () => {
    const stream = streamFromChunks([
      'event: delta\ndata: {"delta":"Hello "}\n\n',
      'event: delta\ndata: {"delta":"world"}\n\n',
      'event: delta\ndata: {"delta":"!"}\n\n',
      'event: delta\ndata: {"delta":" More "}\n\n',
      'event: delta\ndata: {"delta":"text"}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(5);
    expect(events.map((e) => (e.type === 'delta' ? e.delta : null))).toEqual([
      'Hello ',
      'world',
      '!',
      ' More ',
      'text',
    ]);
  });

  it('parses error event mid-stream without breaking', async () => {
    const stream = streamFromChunks([
      'event: start\ndata: {"model":"test"}\n\n',
      'event: delta\ndata: {"delta":"some"}\n\n',
      'event: error\ndata: {"message":"API limit reached","code":"RATE_LIMIT"}\n\n',
      'event: end\ndata: {}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(4);
    expect(events[2]).toEqual({
      type: 'error',
      message: 'API limit reached',
      code: 'RATE_LIMIT',
    });
    expect(events[3]).toEqual({ type: 'end' });
  });

  it('handles chunk boundary in middle of data line', async () => {
    const fullLine = 'event: delta\ndata: {"delta":"hello world"}\n\n';
    const chunks = [fullLine.substring(0, 25), fullLine.substring(25)];
    const stream = streamFromChunks(chunks);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'delta', delta: 'hello world' });
  });

  it('handles chunk boundary exactly at block separator', async () => {
    const stream = streamFromChunks([
      'event: start\ndata: {"model":"x"}\n',
      '\nevent: end\ndata: {}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'start', model: 'x' });
    expect(events[1]).toEqual({ type: 'end' });
  });

  it('parses empty stream without yielding anything', async () => {
    const stream = streamFromChunks([]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(0);
  });

  it('concatenates multi-line data per W3C SSE spec (with fallback for invalid JSON)', async () => {
    const stream = streamFromChunks([
      'event: start\ndata: {"model":"test"}\ndata: {"extra":"data"}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'start' });
  });

  it('skips unknown event names silently', async () => {
    const stream = streamFromChunks([
      'event: start\ndata: {"model":"test"}\n\n',
      'event: unknown_event\ndata: some data\n\n',
      'event: end\ndata: {}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'start', model: 'test' });
    expect(events[1]).toEqual({ type: 'end' });
  });

  it('ignores comment lines starting with colon', async () => {
    const stream = streamFromChunks([
      ': heartbeat\nevent: start\ndata: {"model":"test"}\n\n',
      ': another comment\nevent: end\ndata: {}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'start', model: 'test' });
    expect(events[1]).toEqual({ type: 'end' });
  });

  it('yields trailing partial block at stream end', async () => {
    const stream = streamFromChunks([
      'event: delta\ndata: {"delta":"final"}\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'delta', delta: 'final' });
  });

  it('drops delta event with malformed JSON (does not surface raw payload)', async () => {
    const stream = streamFromChunks([
      'event: delta\ndata: {"delta":"good"}\n\n',
      'event: delta\ndata: {not json}\n\n',
      'event: delta\ndata: {"delta":"after"}\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'delta', delta: 'good' });
    expect(events[1]).toEqual({ type: 'delta', delta: 'after' });
  });
});
