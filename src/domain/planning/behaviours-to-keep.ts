import type { Citation } from '../cards/citation.js';
import type { PlanTask } from './plan-content.js';
import type { SourceCard } from './plan-sources.js';

// RF-631, DEC-135, ADR-018: the behaviour of the legacy system a task card must not change. It is
// taken by code, never by the model: the supported claims, with their citations, of the FEAT, BR,
// FLOW and SCRN cards that the requirements the task builds come from.

/** The card types whose behaviour a rewrite must keep. */
const coveredTypes: readonly string[] = ['FEAT', 'BR', 'FLOW', 'SCRN'];

export interface KeptBehaviour {
  readonly cardId: string;
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
}

/** The behaviours of the task, in card order, each card once. */
// RF-631
export function behavioursToKeep(
  task: PlanTask,
  requirements: readonly { readonly id: string; readonly sources: readonly string[] }[],
  sources: readonly SourceCard[],
): KeptBehaviour[] {
  const built = new Set(
    requirements
      .filter((each) => task.requirements.includes(each.id))
      .flatMap((each) => each.sources),
  );
  return sources
    .filter((card) => built.has(card.id) && coveredTypes.includes(card.type))
    .flatMap((card) =>
      card.claims
        .filter((claim) => claim.status === 'Supported')
        .map(({ claimId, text, citations }) => ({ cardId: card.id, claimId, text, citations })),
    );
}
