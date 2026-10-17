import type { AreaCoverage } from '../../domain/cards/area-coverage.js';
import type { Card } from '../../domain/cards/card.js';
import type { CardMerge } from '../../domain/cards/card-merge.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';
import type { RunScope } from './run-events.js';

// RF-006, data-model.md section 3.7a: what each ended reader task of an understand run left: its
// cards with their ids and claim statuses, and its coverage. A resumed run reads it back, so the
// tasks that finished are kept as they are and only the others run again. The cards' Markdown is
// never parsed back, so the data is kept in a file of its own.

export interface TaskResult {
  readonly agentTaskId: string;
  readonly area: string;
  /** How the task ended: one of the states after `Running`. */
  readonly state: Exclude<AgentTaskState, 'Planned' | 'Running'>;
  readonly turns: number;
  /** The task ended `Done` with no card: suspicious, so `spec.md` names its area (P1-33). */
  readonly withoutCards: boolean;
  /** The task's cards, in the order it wrote them. */
  readonly cards: readonly Card[];
  readonly coverage: AreaCoverage;
}

/** RF-250, P2-35: a card type the summariser answered about, with the ids of the cards it was shown. */
interface ConsolidatedType {
  readonly type: CardType;
  readonly cardIds: readonly string[];
}

/** RF-250, P2-35: what the summariser step of a run did, for a resume: types answered, merges made. */
export interface ConsolidationRecord {
  readonly types: readonly ConsolidatedType[];
  readonly merges: readonly CardMerge[];
}

export interface TaskResults {
  /** The results of the run's ended tasks, in task order; none when the run has not written any. */
  read(scope: RunScope): Promise<readonly TaskResult[]>;
  /** Replaces the run's task results; rejects with the writer's code when they cannot be stored. */
  write(scope: RunScope, results: readonly TaskResult[]): Promise<void>;
  /** The run's consolidation record; empty when the summariser step has not recorded any. */
  readConsolidation(scope: RunScope): Promise<ConsolidationRecord>;
  /** Replaces the run's consolidation record. */
  writeConsolidation(scope: RunScope, record: ConsolidationRecord): Promise<void>;
}
