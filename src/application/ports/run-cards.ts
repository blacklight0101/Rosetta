import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { RunScope } from './run-events.js';

// RF-604, data-model.md section 3.7: the cards an ended understand run wrote, read back whole from
// the card files `cards/index.json` lists: every claim with its citations and its status after the
// judgement step, so `plan` can tell the supported claims from the rest.

export interface RunCards {
  /**
   * The cards of the run in index order; none when the run wrote no index. Rejects when the index
   * or a card it lists cannot be read, so a plan never leaves claims out silently.
   */
  cardsOf(scope: RunScope): Promise<readonly SourceCard[]>;
}
