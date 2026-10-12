import type { ApiFailure } from './client.js';
import { parseRunEvent, type RunEvent } from './run-events.js';
import { errorBodySchema } from './schemas.js';
import { SseFrameReader } from './sse-frames.js';

// RF-1006, RF-1002: follows the event stream of one run: the stored events first, then the live
// ones; after a break it asks again with `Last-Event-ID`, so no event is lost or shown twice. It
// stops after `run.ended`, when the page goes away, and for an answer that retrying cannot change
// (a run that is not there, a session that ended).

export type StreamStatus = 'connecting' | 'open' | 'reconnecting' | 'ended' | 'failed';

export interface FollowOptions {
  readonly runId: string;
  readonly send: (path: string, init: RequestInit) => Promise<Response>;
  readonly signal: AbortSignal;
  readonly onEvent: (event: RunEvent) => void;
  /** `failure` comes with `failed`: what the server answered when it refused the stream. */
  readonly onStatus: (status: StreamStatus, failure?: ApiFailure) => void;
  /** Waiting time before a new attempt when the server named none. */
  readonly retryMs?: number;
}

const DEFAULT_RETRY_MS = 3000;
const RETRYABLE = new Set([408, 425, 429]);
/** RST-2006 is the catalogue's "unexpected error"; the wording is the client's own. */
const UNEXPECTED = 'RST-2006';

type Outcome = 'ended' | 'broken' | 'failed' | 'gone';

async function failureOf(response: Response): Promise<ApiFailure> {
  const parsed = errorBodySchema.safeParse(await response.json().catch(() => undefined));
  if (parsed.success) {
    const { code, message, nextStep, problems = [] } = parsed.data;
    return { status: response.status, code, message, nextStep, problems };
  }
  return {
    status: response.status,
    code: UNEXPECTED,
    message: 'Rosetta answered in a way this page does not understand.',
    nextStep: 'Reload the page. If it happens again, report the code.',
    problems: [],
  };
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

class RunFollower {
  private readonly options: FollowOptions;
  private lastSeq = 0;
  private retryMs: number;
  private shown: StreamStatus | undefined;

  constructor(options: FollowOptions) {
    this.options = options;
    this.retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  }

  async run(): Promise<void> {
    const { signal } = this.options;
    this.show('connecting');
    while (!signal.aborted) {
      const outcome = await this.attempt();
      if (outcome !== 'broken') return;
      this.show('reconnecting');
      await waitFor(this.retryMs, signal);
    }
  }

  private show(status: StreamStatus, failure?: ApiFailure): void {
    if (status === this.shown || this.options.signal.aborted) return;
    this.shown = status;
    this.options.onStatus(status, failure);
  }

  private async attempt(): Promise<Outcome> {
    const { runId, send, signal } = this.options;
    const headers: Record<string, string> = { accept: 'text/event-stream' };
    if (this.lastSeq > 0) headers['last-event-id'] = String(this.lastSeq);
    let response: Response;
    try {
      const path = `/api/runs/${encodeURIComponent(runId)}/events`;
      response = await send(path, { method: 'GET', headers, credentials: 'same-origin', signal });
    } catch {
      return signal.aborted ? 'gone' : 'broken';
    }
    if (!response.ok) return this.refused(response);
    this.show('open');
    return this.read(response);
  }

  private async refused(response: Response): Promise<Outcome> {
    if (response.status >= 500 || RETRYABLE.has(response.status)) return 'broken';
    this.show('failed', await failureOf(response));
    return 'failed';
  }

  private async read(response: Response): Promise<Outcome> {
    const reader = response.body?.getReader();
    if (reader === undefined) return 'broken';
    const frames = new SseFrameReader();
    const decoder = new TextDecoder();
    // A page that goes away closes the body, whatever the transport does with the signal.
    const close = (): void => {
      void reader.cancel().catch(() => undefined);
    };
    this.options.signal.addEventListener('abort', close, { once: true });
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return 'broken';
        const chunk = frames.push(decoder.decode(value, { stream: true }));
        if (chunk.retryMs !== undefined) this.retryMs = chunk.retryMs;
        if (this.deliver(chunk.frames.map((frame) => frame.data))) return 'ended';
      }
    } catch {
      return this.options.signal.aborted ? 'gone' : 'broken';
    } finally {
      this.options.signal.removeEventListener('abort', close);
      await reader.cancel().catch(() => undefined);
    }
  }

  /** Hands over the events not seen before; true once `run.ended` was among them. */
  private deliver(lines: readonly string[]): boolean {
    for (const line of lines) {
      const event = parseRunEvent(line);
      if (event === undefined || event.seq <= this.lastSeq) continue;
      this.lastSeq = event.seq;
      this.options.onEvent(event);
      if (event.type === 'run.ended') {
        this.show('ended');
        return true;
      }
    }
    return false;
  }
}

// RF-1006
export async function followRunEvents(options: FollowOptions): Promise<void> {
  await new RunFollower(options).run();
}
