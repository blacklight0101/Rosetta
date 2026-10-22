import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// ADR-008, Q-60: recorded server-sent-event streams of the providers and a fetch that replays them,
// so a stream that takes minutes runs in no time under fake timers. A frame is one SSE event; it
// may repeat and may wait first; a `hang` frame never ends and only the caller's abort stops it.

const frameSchema = z.strictObject({
  /** The SSE event name (Anthropic); OpenAI frames have none. */
  event: z.string().optional(),
  /** The JSON of the data line, or the raw text `[DONE]`. */
  data: z.unknown().optional(),
  delayMs: z.number().int().nonnegative().optional(),
  repeat: z.number().int().positive().optional(),
  hang: z.literal(true).optional(),
});

const exchangeSchema = z.union([
  z.strictObject({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()).optional(),
    frames: z.array(frameSchema),
  }),
  /** The request never gets a response. */
  z.strictObject({ hang: z.literal(true) }),
]);

const recordingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  description: z.string().min(1),
  exchanges: z.array(exchangeSchema).min(1),
});

export type StreamRecording = z.infer<typeof recordingSchema>;
type Frame = z.infer<typeof frameSchema>;
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function loadStreamRecording(name: string): Promise<StreamRecording> {
  const path = join(process.cwd(), 'tests', 'recordings', 'streams', `${name}.json`);
  return recordingSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException('aborted', 'AbortError');
}

/** Waits `ms` on the global timer (a fake clock moves it); rejects when the signal aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Never settles, except by rejecting when the signal aborts. */
function hangUntilAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(abortError(signal));
    signal.addEventListener('abort', () => {
      reject(abortError(signal));
    });
  });
}

function textOf(frame: Frame): string {
  const data = typeof frame.data === 'string' ? frame.data : JSON.stringify(frame.data);
  return `${frame.event === undefined ? '' : `event: ${frame.event}\n`}data: ${data}\n\n`;
}

async function play(
  frames: readonly Frame[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal,
): Promise<void> {
  const encoder = new TextEncoder();
  for (const frame of frames) {
    if (frame.hang === true) await hangUntilAbort(signal);
    for (let count = 0; count < (frame.repeat ?? 1); count += 1) {
      if (frame.delayMs !== undefined) await pause(frame.delayMs, signal);
      controller.enqueue(encoder.encode(textOf(frame)));
    }
  }
  controller.close();
}

export interface StreamFetch {
  readonly fetch: Fetch;
  /** The JSON bodies of the requests received, in order. */
  readonly bodies: unknown[];
}

/** A fetch that answers each request with the next recorded exchange. */
export function streamFetch(recording: StreamRecording): StreamFetch {
  const bodies: unknown[] = [];
  let next = 0;
  const fetchStream: Fetch = async (_input, init) => {
    const signal = init?.signal ?? new AbortController().signal;
    const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    bodies.push(body);
    const exchange = recording.exchanges[next];
    next += 1;
    if (exchange === undefined) return new Response('not recorded', { status: 404 });
    if ('hang' in exchange) {
      return hangUntilAbort(signal);
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        play(exchange.frames, controller, signal).catch((error: unknown) => {
          controller.error(error);
        });
      },
    });
    const headers = { 'content-type': 'text/event-stream', ...exchange.headers };
    return new Response(stream, { status: exchange.status, headers });
  };
  return { fetch: fetchStream, bodies };
}
