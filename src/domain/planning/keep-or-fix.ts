import type { Citation } from '../cards/citation.js';
import { behavioursOf, type BuiltScope } from './behaviours-to-keep.js';
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
  readonly scope?: BuiltScope;
}

/** The default of a keep-or-fix question: the legacy behaviour is not kept. */
const fixDefault =
  'Fix: build the correct behaviour; the legacy behaviour is not pinned by an approval test.';

/** The default of a security question (P5-41): the secure option, never the legacy behaviour. */
export const secureDefault =
  'Use the secure option: build the control the new system needs, deny what is not allowed, and do not keep the legacy behaviour.';

/** The default a keep-or-fix row takes. */
export function defaultOf(row: Pick<KeepOrFixRow, 'security'>): string {
  return row.security ? secureDefault : fixDefault;
}

/** The cards that hold a claim the planner marked as a security matter. */
export function securityCards(judgements: readonly ClaimJudgement[]): ReadonlySet<string> {
  return new Set(
    judgements
      .filter((each) => each.security)
      .map((each) => each.claimId.slice(0, each.claimId.lastIndexOf('.c'))),
  );
}

/** One row per claim judged a defect, in card and claim order, numbered `KF-001`. */
// RF-631, P5-41
export function keepOrFixRows(
  judgements: readonly ClaimJudgement[],
  input: KeepOrFixInput,
): KeepOrFixRow[] {
  const defects = new Map(
    judgements.filter((each) => each.kind === 'defect').map((each) => [each.claimId, each]),
  );
  const carried = input.tasks.map((task) => ({
    id: task.id,
    fixed: new Set(
      behavioursOf(task, input.requirements, input.sources, {
        ...{ tables: input.tables, judgements },
        ...(input.scope === undefined ? {} : { scope: input.scope }),
      }).fix.map((each) => each.claimId),
    ),
  }));
  const rows = input.sources.flatMap((card) =>
    card.claims.flatMap((claim) => {
      const judgement = defects.get(claim.claimId);
      if (judgement === undefined || claim.status !== 'Supported') return [];
      const { claimId, text, citations } = claim;
      return [
        {
          ...{ claimId, cardId: card.id, text, citations },
          ...{ reason: judgement.reason, security: judgement.security },
          cards: carried.filter((each) => each.fixed.has(claimId)).map((each) => each.id),
        },
      ];
    }),
  );
  return rows.map((row, index) => ({ ...row, id: `KF-${String(index + 1).padStart(3, '0')}` }));
}
