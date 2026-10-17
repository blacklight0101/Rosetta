import type { ToolOutcome } from './read-only-tools.js';
import type { AreaRead } from './agent-task-result.js';

// RF-206, DEC-136: a reader must read before it answers. The gate remembers whether a tool gave
// the task lines of a file of its area, and says when a final answer is to be refused instead of
// accepted. A read of a file outside the area, a failed call and a call that returned no file line
// (a symbol query) do not count. An area with no readable file (only binary or skipped files) has
// nothing to read, so the rule does not apply to it.

/** Answers refused before an unread area's answer is accepted anyway (a refusal costs a turn). */
const maxRefusals = 2;
/** One turn to read and one to answer again: with less left a refusal could only lose the cards. */
const turnsNeeded = 2;
const maxListedFiles = 20;

export class ReadGate {
  private readonly files: readonly string[];
  private readonly readable: ReadonlySet<string>;
  private hasRead = false;
  private refusals = 0;

  constructor(readableFiles: readonly string[]) {
    this.files = readableFiles;
    this.readable = new Set(readableFiles);
  }

  /** Notes what a tool call gave the task. */
  note(outcome: ToolOutcome): void {
    if (outcome.error !== undefined) return;
    if (outcome.excerpts?.some((excerpt) => this.readable.has(excerpt.path)) === true) {
      this.hasRead = true;
    }
  }

  state(): AreaRead {
    if (this.files.length === 0) return 'nothing-readable';
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
    const listed = this.files.slice(0, maxListedFiles);
    const more = this.files.length - listed.length;
    const tail = more > 0 ? [`... and ${String(more)} more files`] : [];
    return [...listed, ...tail].join('\n');
  }
}
