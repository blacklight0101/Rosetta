import { runDeepenOverview, unjudgedIn } from '../deepen/deepen-overview.js';
import type { DeepenParts } from '../deepen/deepen-parts.js';
import type { RunOutcome } from '../ports/run-executor.js';
import { overviewOnlyOutcome } from './session-outcome.js';
import { endedBefore } from './overview-ended.js';
import type { DeepenOptions } from './understand-options.js';
import { UnderstandSession } from './understand-session.js';

// P7-26, RF-264: "Write the overview": the run is queued again and only the overview step runs, on the
// cards the run already has. The merges it made are made again first (its record of answers means no
// question already answered is asked again), so the cards written are the cards it had. The readers
// and the verifier are not called, and the room check is off: nothing here reads.

type SessionParts = ConstructorParameters<typeof UnderstandSession>[0] &
  Omit<DeepenParts, 'request'>;

/** The overview step alone, on a plain understand run or on a Deepen (never resuming the Deepen). */
export async function runOverviewOnly(
  parts: SessionParts,
  deepen: DeepenOptions | undefined,
): Promise<RunOutcome> {
  if (deepen !== undefined) return runDeepenOverview({ ...parts, request: deepen });
  const session = new UnderstandSession(parts);
  await session.consolidate();
  await session.writeOverview();
  const cards = parts.kept.flatMap((result) => result.cards);
  return overviewOnlyOutcome(endedBefore(parts), { unjudged: unjudgedIn(cards) });
}
