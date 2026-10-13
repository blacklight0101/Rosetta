import { Readable } from 'node:stream';
import type { RunEvent } from '../../domain/runs/run-event.js';

// RF-1006: the body of a server-sent events response. One frame per run event (`id` is the `seq`,
// so a page that reconnects sends it back in `Last-Event-ID`), a comment line now and then to keep
// proxies from closing an idle connection, and the end of the stream after `run.ended`. When the
// connection closes, however it closes, every cleanup that was registered runs once, so no
// subscription or timer outlives its page. A page that does not read live events (more than 1 MiB
// waiting) is dropped: it reconnects and reads the stored events again. Stored events are not
// held to that limit: they are sent in batches, each waiting for the page to read (`drained`), so
// a history of any length reaches a page that reads. The live events that arrive during that replay
// are held by the subscription up to the same 1 MiB; past it the page is dropped the same way.

const MAX_WAITING_BYTES = 1_048_576;
const RETRY_MS = 3000;

/** One frame of an event; the data is one line of JSON, so no event can break the framing. */
function frameOf(event: RunEvent): string {
  const type = event.type.replaceAll(/[\r\n]/g, ' ');
  return `id: ${String(event.seq)}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export class EventStream extends Readable {
  private finished = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly waiting: (() => void)[] = [];

  constructor() {
    super();
    this.push(`retry: ${String(RETRY_MS)}\n\n`);
  }

  get isFinished(): boolean {
    return this.finished || this.destroyed;
  }

  send(event: RunEvent): void {
    if (this.isFinished) return;
    if (this.readableLength > MAX_WAITING_BYTES) {
      this.destroy();
      return;
    }
    this.push(frameOf(event));
  }

  /** A stored event: queued without the limit on unread bytes; pair with `drained`. */
  sendStored(event: RunEvent): void {
    if (!this.isFinished) this.push(frameOf(event));
  }

  /** Resolves when the page has read enough to take more, or when the stream is gone. */
  drained(): Promise<void> {
    if (this.isFinished || this.readableLength < this.readableHighWaterMark)
      return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  keepAlive(): void {
    if (!this.isFinished) this.push(': keepalive\n\n');
  }

  /** Ends the stream after what is already queued has been read. */
  finish(): void {
    if (this.isFinished) return;
    this.finished = true;
    this.push(null);
  }

  /** Runs `cleanup` once when the stream is destroyed or has been read to its end. */
  onClose(cleanup: () => void): void {
    if (this.destroyed) cleanup();
    else this.cleanups.push(cleanup);
  }

  override _read(): void {
    // Frames are pushed as events arrive; nothing is pulled. A read means the page took more.
    this.release();
  }

  private release(): void {
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.release();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    callback(error);
  }
}

/** The streams that are open, so a closing server can end them and a test can count them. */
export class StreamRegistry {
  private readonly streams = new Set<EventStream>();

  get size(): number {
    return this.streams.size;
  }

  /** Tracks the stream until it is destroyed or has been read to its end. */
  add(stream: EventStream): void {
    this.streams.add(stream);
    stream.onClose(() => {
      this.streams.delete(stream);
    });
  }

  finishAll(): void {
    for (const stream of this.streams) stream.finish();
  }
}
