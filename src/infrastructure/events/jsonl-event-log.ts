import type {
  OutputWriter,
  TextLineReader,
  WorkspaceFile,
} from '../../application/ports/output-writer.js';
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
import {
  advance,
  assertNext,
  emptyTail,
  REPLAY_BATCH_SIZE,
  type EventTail,
} from './event-order.js';
import { maskEvent } from './mask-event.js';

// Architecture section 7, data-model.md section 3.9, RF-1006, RNF-002, RNF-003: appends the
// events of every run to `events.jsonl` in its folder, masked, one line each, through the
// OutputWriter (so every write stays inside the owner's workspace). Writes of one run go one after
// another in the order of the calls; `seq` has no gaps and nothing follows `run.ended`. A crash can
// leave a torn last line (no line break): reads ignore it and the next write removes it first, so
// a resumed run never appends to a fragment.

export interface JsonlEventLogOptions {
  readonly writer: OutputWriter & TextLineReader;
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
    .map(parseStoredLine);
  return { events, repaired: complete === text ? undefined : complete };
}

function parseStoredLine(line: string): RunEvent {
  const event = parseRunEvent(parseJson(line));
  if (event === undefined) throw failed('a stored line is not a run event');
  return event;
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw failed('a stored line is not JSON', error);
  }
}

/** The events after `afterSeq` in the lines, in batches; a failure to read is RST-2104. */
async function* batchesAfter(
  lines: AsyncIterable<string>,
  afterSeq: number,
): AsyncGenerator<readonly RunEvent[]> {
  let batch: RunEvent[] = [];
  try {
    for await (const line of lines) {
      if (line === '') continue;
      const event = parseStoredLine(line);
      if (event.seq <= afterSeq) continue;
      batch.push(event);
      if (batch.length < REPLAY_BATCH_SIZE) continue;
      yield batch;
      batch = [];
    }
  } catch (error) {
    throw error instanceof RosettaError ? error : failed('the file could not be read', error);
  }
  if (batch.length > 0) yield batch;
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

  async read(scope: RunScope, afterSeq: number): Promise<readonly RunEvent[]> {
    const events: RunEvent[] = [];
    await this.replay(scope, afterSeq, (batch) => {
      events.push(...batch);
      return Promise.resolve();
    });
    return events;
  }

  // RF-1006: streams the file, so a long history is never held in memory as a whole and the
  // receiver sets the pace. It does not wait in the run's write queue: a slow page must not hold
  // up the run, and a line is appended whole, so a read sees complete lines or a torn tail.
  async replay(
    scope: RunScope,
    afterSeq: number,
    onBatch: (batch: readonly RunEvent[]) => Promise<void>,
  ): Promise<void> {
    const lines = await this.options.writer.readLines(fileOf(scope));
    if (!lines.ok) {
      if (lines.error.reason === 'not-found') return;
      throw failed(lines.error.message);
    }
    for await (const batch of batchesAfter(lines.value, afterSeq)) await onBatch(batch);
  }

  // RF-1006: a run whose tail is not in memory (it has ended, or the server restarted) has its
  // last seq read from the last line of its log, so the whole log is neither read nor parsed.
  lastSeq(scope: RunScope): Promise<number> {
    return this.queue.run(scope.id, async () => {
      const known = this.tails.get(scope.id);
      if (known !== undefined) return known.lastSeq;
      const line = await this.options.writer.readLastLine(fileOf(scope));
      if (!line.ok) {
        if (line.error.reason === 'not-found') return 0;
        throw failed(line.error.message);
      }
      return line.value === undefined ? 0 : parseStoredLine(line.value).seq;
    });
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
