import type { OutputWriter, WorkspaceFile } from '../../application/ports/output-writer.js';
import type {
  RunEventHistory,
  RunEventSink,
  RunScope,
} from '../../application/ports/run-events.js';
import { parseRunEvent } from '../../application/runs/run-event-schema.js';
import { KeyedQueue } from '../../application/support/keyed-queue.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunEvent } from '../../domain/runs/run-event.js';
import { runPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { advance, assertNext, emptyTail, type EventTail } from './event-order.js';
import { maskEvent } from './mask-event.js';

// Architecture section 7, data-model.md section 3.9, RF-1006, RNF-002, RNF-003: appends the
// events of every run to `events.jsonl` in its folder, masked, one line each, through the
// OutputWriter (so every write stays inside the owner's workspace). Writes of one run go one after
// another in the order of the calls; `seq` has no gaps and nothing follows `run.ended`. A crash can
// leave a torn last line (no line break): reads ignore it and the next write removes it first, so
// a resumed run never appends to a fragment.

export interface JsonlEventLogOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

interface StoredLog {
  readonly events: readonly RunEvent[];
  /** The complete lines, when the file ends with a fragment that has to be removed. */
  readonly repaired: string | undefined;
}

function fileOf(scope: RunScope): WorkspaceFile {
  return { userId: scope.userId, path: `${runPath(scope.projectId, scope.runKey)}/events.jsonl` };
}

function failed(detail: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.runEventLogFailed,
    `The events of a run could not be stored or read: ${detail}.`,
    cause === undefined ? undefined : { cause },
  );
}

function parseLines(text: string): StoredLog {
  const complete = text.slice(0, text.lastIndexOf('\n') + 1);
  const events = complete
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const event = parseRunEvent(parseJson(line));
      if (event === undefined) throw failed('a stored line is not a run event');
      return event;
    });
  return { events, repaired: complete === text ? undefined : complete };
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw failed('a stored line is not JSON', error);
  }
}

export class JsonlEventLog implements RunEventSink, RunEventHistory {
  private readonly options: JsonlEventLogOptions;
  private readonly queue = new KeyedQueue();
  private readonly tails = new Map<string, EventTail>();

  constructor(options: JsonlEventLogOptions) {
    this.options = options;
  }

  publish(scope: RunScope, event: RunEvent): Promise<void> {
    return this.queue.run(scope.id, async () => {
      const tail = await this.tailOf(scope);
      assertNext(tail, scope, event);
      const line = JSON.stringify(maskEvent(event, this.options.masker));
      const appended = await this.options.writer.appendLine(fileOf(scope), line);
      if (!appended.ok) throw failed(appended.error.message);
      const next = advance(event);
      if (next.ended) this.tails.delete(scope.id);
      else this.tails.set(scope.id, next);
    });
  }

  read(scope: RunScope, afterSeq: number): Promise<readonly RunEvent[]> {
    return this.queue.run(scope.id, async () => {
      const { events } = await this.load(scope);
      return events.filter((event) => event.seq > afterSeq);
    });
  }

  lastSeq(scope: RunScope): Promise<number> {
    return this.queue.run(scope.id, async () => (await this.tailOf(scope)).lastSeq);
  }

  /** The tail from memory, or from the file (removing a torn last line) the first time. */
  private async tailOf(scope: RunScope): Promise<EventTail> {
    const known = this.tails.get(scope.id);
    if (known !== undefined) return known;
    const { events, repaired } = await this.load(scope);
    if (repaired !== undefined) {
      const written = await this.options.writer.writeText(fileOf(scope), repaired);
      if (!written.ok) throw failed(written.error.message);
    }
    const last = events.at(-1);
    const tail = last === undefined ? emptyTail : advance(last);
    if (!tail.ended) this.tails.set(scope.id, tail);
    return tail;
  }

  private async load(scope: RunScope): Promise<StoredLog> {
    const read = await this.options.writer.readText(fileOf(scope));
    if (read.ok) return parseLines(read.value);
    if (read.error.reason === 'not-found') return { events: [], repaired: undefined };
    throw failed(read.error.message);
  }
}
