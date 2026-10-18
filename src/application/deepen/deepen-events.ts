import type { DeepenRecord, DeepenRound } from '../../domain/deepen/deepen-record.js';
import type { RoundPlan } from '../../domain/deepen/round-plan.js';
import type { DeepenStopReason } from '../../domain/deepen/stop-rule.js';
import type { DeepenParts } from './deepen-parts.js';
import { cardsOf, type DeepenState } from './deepen-state.js';

// RF-209, RF-1002, RF-1006: what a Deepen run tells the live page, a reload and the replay: the
// cards it starts from, each round as it begins and as it ends, and why it stopped. Counts only,
// never claim text, so the events stay small; the page reads the claims themselves from the run.

/** RF-209: the run to improve and what the owner confirmed, with the cards the Deepen starts from. */
export async function announceDeepen(
  parts: DeepenParts,
  state: DeepenState,
  record: DeepenRecord,
): Promise<void> {
  const cards = cardsOf(state);
  const claims = cards.flatMap((card) => card.claims);
  const count = (keep: (status: string) => boolean): number =>
    claims.filter((claim) => keep(claim.status)).length;
  const { parentRunId, parentRunKey, maxRounds, coveragePass } = record;
  await parts.execution.events.emit('deepen.started', {
    ...{ parentRunId, parentRunKey, maxRounds, coveragePass },
    seeded: {
      cards: cards.length,
      claims: claims.length,
      supported: count((status) => status === 'Supported'),
      rejected: count((status) => status === 'Rejected'),
      notJudged: count((status) => status === 'Unverified' || status === 'Proposed'),
    },
  });
}

/** RF-209: a round is about to begin; the counts are what its plan holds. */
export async function announceRoundStart(
  parts: DeepenParts,
  input: { readonly round: number; readonly maxRounds: number; readonly plan: RoundPlan },
): Promise<void> {
  const { round, maxRounds, plan } = input;
  await parts.execution.events.emit('deepen.round.started', {
    ...{ round, maxRounds, judge: plan.judge.length, reread: plan.reread.length },
    outOfScope: plan.outOfScope.length,
    unreadFiles: plan.gaps.length,
  });
}

/** RF-209: a round ended, whole or cut short by a cap or a Stop. */
export async function announceRoundEnd(parts: DeepenParts, round: DeepenRound): Promise<void> {
  const added = round.newClaims;
  await parts.execution.events.emit('deepen.round.ended', {
    ...{ round: round.round, complete: round.complete },
    newClaims: added.length,
    newSupported: added.filter((claim) => claim.status === 'Supported').length,
    filesRead: round.filesRead.length,
    tokens: round.tokens,
    costMicros: round.costMicros,
  });
}

/** RF-209: the Deepen stopped, and why. */
export async function announceStop(
  parts: DeepenParts,
  record: DeepenRecord,
  stopReason: DeepenStopReason,
): Promise<void> {
  const { roundsDone, maxRounds } = record;
  await parts.execution.events.emit('deepen.ended', { stopReason, roundsDone, maxRounds });
}
