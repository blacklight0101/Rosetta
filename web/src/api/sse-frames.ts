// RF-1006: reads the frames of a server-sent events body (event-stream.ts writes them): `id:`,
// `event:` and `data:` lines, a blank line that ends a frame, `: comment` lines to keep the
// connection alive, and `retry:` lines. Chunks may cut a line anywhere, so the unfinished line is
// kept until the rest arrives.

export interface SseFrame {
  readonly id: string | undefined;
  readonly event: string | undefined;
  readonly data: string;
}

export interface SseChunk {
  readonly frames: readonly SseFrame[];
  /** The reconnect delay the server asked for, when this chunk carried one. */
  readonly retryMs: number | undefined;
}

export class SseFrameReader {
  private rest = '';
  private id: string | undefined;
  private event: string | undefined;
  private data: string[] = [];

  /** Adds text from the body and returns the frames it completed. */
  push(text: string): SseChunk {
    const lines = (this.rest + text).split(/\r\n|\n|\r/u);
    this.rest = lines.pop() ?? '';
    const frames: SseFrame[] = [];
    let retryMs: number | undefined;
    for (const line of lines) {
      if (line === '') {
        const frame = this.finishFrame();
        if (frame !== undefined) frames.push(frame);
      } else {
        retryMs = this.field(line) ?? retryMs;
      }
    }
    return { frames, retryMs };
  }

  private finishFrame(): SseFrame | undefined {
    const frame =
      this.data.length === 0
        ? undefined
        : { id: this.id, event: this.event, data: this.data.join('\n') };
    this.event = undefined;
    this.data = [];
    return frame;
  }

  /** Applies one line; gives the delay of a `retry:` line. */
  private field(line: string): number | undefined {
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const name = colon < 0 ? line : line.slice(0, colon);
    const raw = colon < 0 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (name === 'id') this.id = value;
    else if (name === 'event') this.event = value;
    else if (name === 'data') this.data.push(value);
    else if (name === 'retry' && /^\d{1,9}$/u.test(value)) return Number(value);
    return undefined;
  }
}
