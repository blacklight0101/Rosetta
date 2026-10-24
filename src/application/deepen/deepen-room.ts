import type { Card } from '../../domain/cards/card.js';
import { writtenIn, type DeepenRecord } from '../../domain/deepen/deepen-record.js';
import type { DeepenStopReason } from '../../domain/deepen/stop-rule.js';
import { awaitsJudgement } from '../verifier/awaits-judgement.js';
import type { ReadersStop } from '../understand/readers-stopped.js';

// RF-429, P5-30, DEC-170: the room check of the readers of a Deepen (`ReaderRoom`) counts the claims
// of the whole Deepen: those waiting for judgement, wherever they came from, and, to know what a
// judgement costs, those this Deepen judged (the claims it wrote and the ones it sent to the
// verifier, in every round, a resumed Deepen's earlier rounds included). The parent run's judged
// claims are not the spend of this run and are left out.

/** The ids of the claims this Deepen wrote or judged in its finished rounds, and those its round plans. */
// RF-429
export function claimsOfThisRun(record: DeepenRecord, planned: readonly string[]): Set<string> {
  const judged = record.rounds.flatMap((round) => round.judged);
  return new Set([...writtenIn(record), ...judged, ...planned]);
}

/** The cards with the claims that wait for judgement or were judged by this Deepen. */
// RF-429
export function roomCardsOf(cards: readonly Card[], ids: ReadonlySet<string>): readonly Card[] {
  return cards.map((card) => ({
    ...card,
    claims: card.claims.filter((claim) => awaitsJudgement(claim) || ids.has(claim.claimId)),
  }));
}

/** How a stop of the readers ends the Deepen: to leave room to judge, or at the readers' own share. */
// RF-429
export function roomStopReason(reason: ReadersStop | undefined): DeepenStopReason | undefined {
  if (reason === undefined) return undefined;
  return reason === 'judging' ? 'readersStopped' : 'capReached';
}
