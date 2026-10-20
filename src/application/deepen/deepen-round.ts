import { isCapStop } from '../../domain/budget/cap-stop.js';
import type { Card } from '../../domain/cards/card.js';
import { extendCards } from '../../domain/cards/card-extension.js';
import { assignCardIds } from '../../domain/cards/card-ids.js';
import type { DeepenRound } from '../../domain/deepen/deepen-record.js';
import type { RoundPlan } from '../../domain/deepen/round-plan.js';
import type { DeepenStopReason } from '../../domain/deepen/stop-rule.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { scopeOf } from '../runs/run-scope.js';
import { announceCards, announceExtensions } from '../understand/announce-cards.js';
import { judgementPartsOf, runJudgementStep } from '../understand/claim-judgement.js';
import { awaitsJudgement } from '../verifier/awaits-judgement.js';
import { checkCitations } from '../verifier/citation-check.js';
import { nextTaskNumber, roundTasks } from './deepen-tasks.js';
import { runRoundTasks, taskCardsOf, taskResultOfRound, type EndedTask } from './deepen-readers.js';
import type { DeepenParts } from './deepen-parts.js';
import { cardsOf, snapshotOf, withCards, type DeepenState } from './deepen-state.js';

// RF-209, RF-300, RF-301, ADR-005: one round of a Deepen. The claims the plan names are judged
// first; then the re-read and coverage tasks run, their cards take ids after every card of the run
// (RF-203), and each new claim passes both verifier steps with the same verifier as any claim,
// which sees only the claim and its cited lines: never the earlier rejection or what it replaces.

export interface RoundEnd {
  readonly state: DeepenState;
  readonly round: DeepenRound;
  /** Why the run must end now: a cap or the owner's Stop came during the round. */
  readonly stopped?: DeepenStopReason;
}

/** The verifier's own cap (RF-423) refused a call during the round. */
interface CapWatch {
  capped: boolean;
}

async function judge(
  parts: DeepenParts,
  cards: readonly Card[],
  select: { readonly awaits?: (claim: Card['claims'][number]) => boolean; readonly cap: CapWatch },
): Promise<readonly Card[]> {
  const base = judgementPartsOf(parts, parts.deps.clock);
  const awaits = select.awaits ?? awaitsJudgement;
  if (!cards.some((card) => card.claims.some(awaits))) return cards;
  const onCapped = (): void => {
    select.cap.capped = true;
  };
  return runJudgementStep(cards, { ...base, awaits, onCapped });
}

/** What a round wrote: new cards, and the parent's cards that got claims (DEC-158). */
interface RoundCards {
  readonly added: readonly Card[];
  /** The parent's cards with the claims this round added to them, judged. */
  readonly extended: readonly Card[];
  /** The ids of every claim the round wrote, on a new card or on a parent's card. */
  readonly claimIds: ReadonlySet<string>;
}

/**
 * RF-203, RF-300, RF-301, RF-209: the new cards with ids, the claims added to the parent's cards,
 * the citation check and the judgement of every new claim.
 */
async function newCardsOf(
  parts: DeepenParts,
  state: DeepenState,
  ended: readonly EndedTask[],
  cap: CapWatch,
): Promise<RoundCards> {
  const tasks = ended.map(taskCardsOf);
  const assigned = assignCardIds(tasks, cardsOf(state));
  if (!assigned.ok) throw new RosettaError(ERROR_CODES.cardOutputInvalid, assigned.error);
  const extension = extendCards(tasks, cardsOf(state));
  if (!extension.ok) throw new RosettaError(ERROR_CODES.cardOutputInvalid, extension.error);
  const at = parts.deps.clock.now().toISOString();
  const all = [...assigned.value, ...extension.value.cards];
  const checked = checkCitations(all, parts.scanned.codeMap, at);
  const { events } = parts.execution;
  await announceCards(events, checked, checked.cards.slice(0, assigned.value.length));
  await announceExtensions(events, checked, extension.value);
  const claimIds = new Set([
    ...assigned.value.flatMap((card) => card.claims.map((claim) => claim.claimId)),
    ...extension.value.claims.map((claim) => claim.claimId),
  ]);
  const judged = await judge(parts, checked.cards, { cap });
  return {
    added: judged.slice(0, assigned.value.length),
    extended: judged.slice(assigned.value.length),
    claimIds,
  };
}

/** The state with the parent's extended cards in place of the cards they were. */
function withExtended(state: DeepenState, extended: readonly Card[]): DeepenState {
  const cards = cardsOf(state).map((card) => extended.find((each) => each.id === card.id) ?? card);
  return withCards(state, cards);
}

/** RF-209: the claims the round wrote, as its record lists them. */
function newClaimsOf({ added, extended, claimIds }: RoundCards): DeepenRound['newClaims'] {
  return [...added, ...extended]
    .flatMap((card) => card.claims)
    .filter((claim) => claimIds.has(claim.claimId))
    .map(({ claimId, status, replaces }) => ({
      claimId,
      status,
      ...(replaces === undefined ? {} : { replaces }),
    }));
}

async function spentSoFar(parts: DeepenParts): Promise<{ tokens: number; costMicros: number }> {
  const stored = await parts.deps.manifests.read(scopeOf(parts.execution.run));
  const totals = stored?.totals;
  if (totals === undefined) return { tokens: 0, costMicros: 0 };
  return { tokens: totals.inputTokens + totals.outputTokens, costMicros: totals.costMicros };
}

/**
 * RF-209, RF-006: the rejected claims whose re-read ran to an end. A re-read a Stop or a cap cut
 * short is not counted, so the resume of the run reads it again; any other is its one retry.
 */
function rereadDone(plan: RoundPlan, ended: readonly EndedTask[], aborted: boolean) {
  const finished = ended.filter(({ outcome }) =>
    outcome.state === 'StoppedByCap' ? false : outcome.state !== 'Failed' || !aborted,
  );
  const ids = new Set(finished.flatMap(({ task }) => task.replaceable ?? []));
  return plan.reread
    .filter((claim) => ids.has(claim.claimId))
    .map(({ claimId, reason }) => ({ claimId, reason }));
}

/** RF-209, RF-422, RF-423: a Stop or a cap during the round ends the Deepen. */
function stopOf(parts: DeepenParts, ended: readonly EndedTask[], cap: CapWatch) {
  const { signal } = parts.execution;
  if (signal.aborted) return isCapStop(signal.reason) ? 'capReached' : 'stopped';
  const readerCapped = ended.some(({ outcome }) => outcome.state === 'StoppedByCap');
  return readerCapped || cap.capped ? 'capReached' : undefined;
}

// RF-209
export async function runRound(
  parts: DeepenParts,
  state: DeepenState,
  input: { readonly plan: RoundPlan; readonly round: number },
): Promise<RoundEnd> {
  const { plan } = input;
  const { codeMap } = parts.scanned;
  const spent = await spentSoFar(parts);
  const before = snapshotOf(state, codeMap);
  const cap: CapWatch = { capped: false };
  const wanted = new Set(plan.judge);
  const awaits = (claim: Card['claims'][number]): boolean => wanted.has(claim.claimId);
  const judged = withCards(state, await judge(parts, cardsOf(state), { awaits, cap }));
  const tasks = roundTasks(plan, codeMap, nextTaskNumber(judged.results), cardsOf(judged));
  const ended = await runRoundTasks(parts, tasks);
  const written = await newCardsOf(parts, judged, ended, cap);
  const results = ended.map((each) => taskResultOfRound(parts, each, written.added));
  const next = { results: [...withExtended(judged, written.extended).results, ...results] };
  const after = snapshotOf(next, codeMap);
  const now = await spentSoFar(parts);
  const stopped = stopOf(parts, ended, cap);
  const round: DeepenRound = {
    round: input.round,
    complete: stopped === undefined,
    judged: plan.judge,
    reread: rereadDone(plan, ended, parts.execution.signal.aborted),
    filesRead: [...after.filesRead].filter((path) => !before.filesRead.has(path)),
    newClaims: newClaimsOf(written),
    tokens: Math.max(0, now.tokens - spent.tokens),
    costMicros: Math.max(0, now.costMicros - spent.costMicros),
  };
  return { state: next, round, ...(stopped === undefined ? {} : { stopped }) };
}
