import type { Card } from '../../domain/cards/card.js';
import type { RunOutcome } from '../ports/run-executor.js';
import { endedBefore } from '../understand/overview-ended.js';
import { overviewOnlyOutcome } from '../understand/session-outcome.js';
import { mergeDuplicates } from './deepen-consolidation.js';
import { overviewOf, writeOutputs } from './deepen-outputs.js';
import type { DeepenParts } from './deepen-parts.js';
import { seedDeepen } from './deepen-seed.js';
import { cardsOf } from './deepen-state.js';

// P7-26, RF-264: "Write the overview" on a Deepen. The Deepen is not resumed (no round starts): its
// cards are read back from its own results, the merges it made are made again, and the overview is
// written and the outputs saved. The run ends as its cards say: CapReached while areas are unread
// or claims are not judged.

/** Claims a cap left Unverified, or never judged. */
export function unjudgedIn(cards: readonly Card[]): number {
  return cards
    .flatMap((card) => card.claims)
    .filter((claim) => claim.status === 'Unverified' || claim.status === 'Proposed').length;
}

// P7-26
export async function runDeepenOverview(parts: DeepenParts): Promise<RunOutcome> {
  const seeded = await seedDeepen(parts);
  if (!seeded.ok) return { endState: 'Failed', errorCode: seeded.error };
  const { state } = seeded.value;
  const merged = await mergeDuplicates(parts, cardsOf(state));
  const overview = await overviewOf(parts, state, merged?.cards);
  await writeOutputs(parts, state, { overview, merged });
  const unjudged = unjudgedIn(merged?.cards ?? cardsOf(state));
  const capped = parts.execution.manifest.deepen?.stopReason === 'capReached';
  return overviewOnlyOutcome(endedBefore(parts), { unjudged, capped });
}
