import type { Card } from '../../domain/cards/card.js';
import type { RunConsolidation } from '../consolidate/consolidate-run.js';
import { applyMerges } from '../../domain/cards/card-merge.js';
import { CARD_TYPES } from '../../domain/cards/card-vocabulary.js';
import type { DeepenRecord, DeepenRound } from '../../domain/deepen/deepen-record.js';
import type { RoundPlan } from '../../domain/deepen/round-plan.js';
import type { DeepenStopReason } from '../../domain/deepen/stop-rule.js';
import { scopeOf } from '../runs/run-scope.js';
import type { DeepenParts } from './deepen-parts.js';
import { cardsOf, type DeepenState } from './deepen-state.js';

// RF-209, RF-1002, RF-1006: what a Deepen run tells the live page, a reload and the replay: the
// cards it starts from, each round as it begins and as it ends, and why it stopped. Counts only,
// never claim text, so the events stay small; the page reads the claims themselves from the run.

/** The cards and claims a Deepen starts from; the four groups of claims add up to the claims. */
export interface SeededCounts {
  readonly cards: number;
  readonly claims: number;
  readonly supported: number;
  readonly rejected: number;
  readonly citationInvalid: number;
  readonly notJudged: number;
}

// RF-209
export function seededCounts(cards: readonly Card[]): SeededCounts {
  const claims = cards.flatMap((card) => card.claims);
  const count = (keep: (status: string) => boolean): number =>
    claims.filter((claim) => keep(claim.status)).length;
  return {
    cards: cards.length,
    claims: claims.length,
    supported: count((status) => status === 'Supported'),
    rejected: count((status) => status === 'Rejected'),
    citationInvalid: count((status) => status === 'CitationInvalid'),
    notJudged: count((status) => status === 'Unverified' || status === 'Proposed'),
  };
}

/**
 * RF-209, RF-250 (Q-44): the cards the parent run holds, which is what its page counts: the cards its
 * reader tasks wrote with the duplicates of several areas merged as its summariser merged them. Every
 * claim is kept by a merge, so only the number of cards changes.
 */
async function parentCards(parts: DeepenParts, state: DeepenState, parentRunId: string) {
  const { run } = parts.execution;
  const parent = await parts.deps.runs.find(run.userId, parentRunId);
  const cards = cardsOf(state);
  if (parent === undefined) return cards;
  const { merges } = await parts.deps.taskResults.readConsolidation(scopeOf(parent));
  return applyMerges(cards, merges, CARD_TYPES).cards;
}

/** RF-209: the run to improve and what the owner confirmed, with the cards the Deepen starts from. */
export async function announceDeepen(
  parts: DeepenParts,
  state: DeepenState,
  record: DeepenRecord,
): Promise<void> {
  const { parentRunId, parentRunKey, maxRounds, coveragePass } = record;
  await parts.execution.events.emit('deepen.started', {
    ...{ parentRunId, parentRunKey, maxRounds, coveragePass },
    seeded: seededCounts(await parentCards(parts, state, parentRunId)),
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

/**
 * RF-250, RF-1004, Q-52: the merges the end of a Deepen stands on, those of the parent made again and
 * the new ones. This run has not published them, so the pages move their claims by these events.
 */
export async function announceDeepenMerges(
  parts: DeepenParts,
  merged: RunConsolidation,
): Promise<void> {
  for (const move of [...merged.replayedMoves, ...merged.moves]) {
    const task = merged.cards.find((card) => card.id === move.cardId)?.agentTaskId;
    await parts.execution.events.emit('cards.merged', { ...move }, task);
  }
}
