import type { RunEvent } from '../../../web/src/api/run-events.js';
import { wire } from './live-run-fixtures.js';

// RF-1006: a fake event stream for the page tests. It stands where the server stands: the page
// asks for `/api/runs/:id/events`, the test pushes frames into the connection the page got and ends
// it, the way a closing connection ends in the browser. Every request is recorded with the
// `Last-Event-ID` it carried.

export interface StreamRequest {
  readonly path: string;
  readonly lastEventId: string | null;
}

export interface Connection {
  /** One event as the server frames it. */
  event(event: RunEvent): void;
  /** Text as the server sends it, for example a comment line or half a frame. */
  raw(text: string): void;
  /** Closes the connection, as a server that went away does. */
  end(): void;
}

type Answer = { readonly status: number } | 'unreachable';

const encoder = new TextEncoder();

function failureBody(status: number): Response {
  const body = { code: 'RST-2003', message: 'Not found.', nextStep: 'Go back.' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function connectionOf(controller: ReadableStreamDefaultController<Uint8Array>): Connection {
  return {
    event(event) {
      const frame = `id: ${String(event.seq)}\nevent: ${event.type}\ndata: ${wire(event)}\n\n`;
      controller.enqueue(encoder.encode(frame));
    },
    raw(text) {
      controller.enqueue(encoder.encode(text));
    },
    end() {
      controller.close();
    },
  };
}

// Captured at load, before any test installs fake timers.
const realSetTimeout = setTimeout;

export class StreamServer {
  readonly requests: StreamRequest[] = [];
  private readonly connections: Connection[] = [];
  private readonly answers: Answer[] = [];

  /** The next request is answered with this HTTP status, or fails to connect. */
  answerNext(answer: Answer): void {
    this.answers.push(answer);
  }

  /** The `fetch` the page uses for the stream. */
  readonly send = (path: string, init: RequestInit): Promise<Response> => {
    this.requests.push({
      path,
      lastEventId: new Headers(init.headers).get('last-event-id'),
    });
    const answer = this.answers.shift();
    if (answer === 'unreachable') return Promise.reject(new TypeError('network down'));
    if (answer !== undefined) return Promise.resolve(failureBody(answer.status));
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.connections.push(connectionOf(controller));
      },
    });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
  };

  /**
   * The connection with that index (0 is the first), once the page has made it. It polls with the real
   * timer, so a test with fake timers still gets its connection, and for up to 20 s: the page may take
   * seconds to open it when the machine is shared.
   */
  async connection(index = 0): Promise<Connection> {
    for (let attempt = 0; attempt < 4000; attempt += 1) {
      const found = this.connections[index];
      if (found !== undefined) return found;
      await new Promise((resolve) => realSetTimeout(resolve, 5));
    }
    throw new Error(`The page never opened connection ${String(index)}.`);
  }
}
