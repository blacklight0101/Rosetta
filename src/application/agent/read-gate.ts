import type { Citation } from '../../domain/cards/citation.js';
import { readShare } from '../../domain/cards/read-share.js';
import type { FileEntry } from '../../domain/code-map/file-entry.js';
import type { ToolOutcome } from './read-only-tools.js';
import type { AreaRead } from './agent-task-result.js';

// RF-206, DEC-136, Q-50: a reader must read before it answers. The gate remembers whether a tool
// gave the task lines of a file of its area, and says when a final answer is to be refused instead
// of accepted. A read of a file outside the area, a failed call, a call that returned no file
// line (a symbol query) and the statement lines a path query only lists (RF-209) do not count. An area with no readable file (only binary or skipped files)
// has nothing to read, so the rule does not apply to it. An answer after a read of less than half
// of the area's first-party tokens is refused again, up to three times while it keeps reading, with
// the files still unread (P8-92, RF-210).

/** Answers refused before an unread area's answer is accepted anyway (a refusal costs a turn). */
const maxRefusals = 2;
/** One turn to read and one to answer again: with less left a refusal could only lose the cards. */
const turnsNeeded = 2;
const maxListedFiles = 20;
/** Q-50: below this share of the area's first-party tokens a reader is asked to read more. */
const enoughRead = 0.5;
/** P8-92: how many times one reader is asked to read more (each ask costs a turn and a call). */
const maxAsks = 3;

/** What the reader is told when it is asked to read more. */
export interface ReadMoreAsk {
  readonly percent: number;
  readonly readTokens: number;
  readonly tokens: number;
  /** The unread files, one per line. */
  readonly files: string;
}

function listed(paths: readonly string[]): string {
  const shown = paths.slice(0, maxListedFiles);
  const more = paths.length - shown.length;
  const tail = more > 0 ? [`... and ${String(more)} more files`] : [];
  return [...shown, ...tail].join('\n');
}

export class ReadGate {
  private readonly entries: readonly FileEntry[];
  private readonly readable: ReadonlySet<string>;
  private readonly reads: Citation[] = [];
  private hasRead = false;
  private refusals = 0;
  private asks = 0;
  private readAtLastAsk = 0;

  constructor(readableFiles: readonly FileEntry[]) {
    this.entries = readableFiles;
    this.readable = new Set(readableFiles.map((file) => file.path));
  }

  /** Notes what a tool call gave the task. */
  note(outcome: ToolOutcome): void {
    if (outcome.error !== undefined || outcome.listed === true) return;
    for (const excerpt of outcome.excerpts ?? []) {
      if (!this.readable.has(excerpt.path)) continue;
      this.hasRead = true;
      this.reads.push(excerpt);
    }
  }

  state(): AreaRead {
    if (this.entries.length === 0) return 'nothing-readable';
    return this.hasRead ? 'read' : 'not-read';
  }

  /**
   * The files to read when a final answer is to be refused, else undefined. Each refusal counts, so
   * a reader that never reads is refused `maxRefusals` times and then accepted, marked not read.
   */
  refuse(turnsLeft: number): string | undefined {
    if (this.state() !== 'not-read' || this.refusals >= maxRefusals) return undefined;
    if (turnsLeft < turnsNeeded) return undefined;
    this.refusals += 1;
    return listed(this.entries.map((file) => file.path));
  }

  /**
   * Q-50, P8-92: what to tell a reader whose answer is to be refused for having read little of its
   * area, else undefined. It looks only; `askedToReadMore` records that the reader was asked. A
   * reader is asked again, up to `maxAsks` times, while it read more since the last ask; an answer
   * after an ask with no new read is accepted whatever the coverage. A reader that is not asked
   * because the conversation has no room (Q-55) is still to be asked while it has room.
   */
  readMore(turnsLeft: number): ReadMoreAsk | undefined {
    if (this.state() !== 'read' || this.asks >= maxAsks || turnsLeft < turnsNeeded) {
      return undefined;
    }
    const { share, tokens, readTokens, unread } = readShare(this.entries, this.reads);
    if (share >= enoughRead || unread.length === 0) return undefined;
    if (this.asks > 0 && readTokens <= this.readAtLastAsk) return undefined;
    const percent = Math.round(share * 100);
    return { percent, readTokens, tokens, files: listed(unread.map((file) => file.path)) };
  }

  askedToReadMore(ask: ReadMoreAsk): void {
    this.asks += 1;
    this.readAtLastAsk = ask.readTokens;
  }
}
