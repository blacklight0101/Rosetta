import type { Card } from '../../domain/cards/card.js';
import type { CommitSha } from '../../domain/sources/commit-sha.js';
import type { RunScope } from './run-events.js';

// RF-202, RF-204, RF-302, RNF-002, data-model.md sections 3.7 and 3.8: the card files of a run in
// its folder. Writes to one run folder run one after another, so two writes never mix their files
// (P1-32: two concurrent rewrites of one folder could lose an update); a refused or failed write
// puts back what it changed and rejects with the writer's code.

/** The repository at the pinned commit, for the permalinks of the citations (RF-125). */
export interface CardSource {
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: CommitSha;
}

export interface CardSet {
  /** Every card of the run so far, in area and appearance order. */
  readonly cards: readonly Card[];
  readonly source: CardSource;
  /**
   * Areas whose task ended `Done` with no card: suspicious (an empty answer may hide a parsing
   * slip), so `spec.md` names them.
   */
  readonly areasWithoutCards: readonly string[];
}

export interface CardOutputs {
  /** Writes `cards/<TYPE>/<ID>.md`, `cards/index.json` and `spec.md` for the whole set. */
  writeCards(scope: RunScope, set: CardSet): Promise<void>;
  /** Keeps the raw answers of a task that ended `InvalidOutput`, masked (RF-202). */
  writeInvalidOutput(
    scope: RunScope,
    agentTaskId: string,
    rawOutputs: readonly string[],
  ): Promise<void>;
}
