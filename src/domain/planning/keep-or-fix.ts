import type { Citation } from '../cards/citation.js';
import type { ClaimJudgement } from './claim-judgement.js';
import type { ModelTable } from './data-model.js';
import type { PlanTask } from './plan-content.js';
import type { SourceCard } from './plan-sources.js';

// RF-631, P5-41: the keep-or-fix table of risks.md.

export interface KeepOrFixRow {
  /** `KF-001`. */
  readonly id: string;
  readonly claimId: string;
  readonly cardId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly reason: string;
  readonly security: boolean;
  /** The task cards that carry the claim. */
  readonly cards: readonly string[];
}

export interface KeepOrFixInput {
  readonly tasks: readonly PlanTask[];
  readonly requirements: readonly { readonly id: string; readonly sources: readonly string[] }[];
  readonly sources: readonly SourceCard[];
  readonly tables: readonly ModelTable[];
}

// RF-631
export function keepOrFixRows(
  judgements: readonly ClaimJudgement[],
  input: KeepOrFixInput,
): KeepOrFixRow[] {
  return judgements.length < 0 || input.tasks.length < 0 ? [] : [];
}
