import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunCards } from '../../application/ports/run-cards.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';

// RF-604: the cards of an ended understand run read back for `plan` (not built yet).

export class FileRunCards implements RunCards {
  readonly writer: OutputWriter;

  constructor(writer: OutputWriter) {
    this.writer = writer;
  }

  // RF-604
  readonly cardsOf: (scope: RunScope) => Promise<readonly SourceCard[]> = () => Promise.resolve([]);
}
