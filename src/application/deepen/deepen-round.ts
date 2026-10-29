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
import { endsWithoutRoomStops } from '../understand/reader-room.js';
import {
  announceCards,
  announceExtensions,
  announceReplaced,
} from '../understand/announce-cards.js';
import { judgementPartsOf, runJudgementStep } from '../understand/claim-judgement.js';
import { awaitsJudgement } from '../verifier/awaits-judgement.js';
import { checkCitations } from '../verifier/citation-check.js';
import { answersGivenTo, withDeepenAnswers } from './deepen-answers.js';
import { roomCardsOf, roomStopReason } from './deepen-room.js';
import { nextTaskNumber, roundTasks } from './deepen-tasks.js';
import { runRoundTasks, taskCardsOf, taskResultOfRound, type EndedTask } from './deepen-readers.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { ReaderTask } from '../understand/reader-tasks.js';
import type { DeepenParts } from './deepen-parts.js';
import { cardsOf, snapshotOf, withCards, type DeepenState } from './deepen-state.js';

// RF-209, RF-300, RF-301, ADR-005: one round of a Deepen. The claims the plan names are judged
// first; then the re-read and coverage tasks run, their cards take ids after every card of the run
// (RF-203), and each new claim passes both verifier steps with the same verifier as any claim,
// which sees only the claim and its cited lines: never the earlier rejection or what it replaces.

export interface RoundEnd {
  readonly state: DeepenState;
  readonly round: DeepenRound;
  /** RF-241: the areas whose task ended `Done`; the answers they were given are now used. */
  readonly doneAreas: readonly string[];
  /** Why the run must end now: a cap or the owner's Stop came during the round. */
  readonly stopped?: DeepenStopReason;
}

/** The verifier's own cap (RF-423), not its line of the run cap (DEC-193), refused a call during the round. */
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
  // DEC-193: a verifier stopped only at its line of the run cap ends the Deepen as it ends an
  // understand run, with the claims it did not judge Unverified; a cap of its own still ends it CapReached.
  const onCapped = (): void => {
    if (parts.room?.verifierAtLine() !== true) select.cap.capped = true;
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

/** RF-300: the line count of every file of the code map, to check the citations folded into a claim. */
function lineCounts(parts: DeepenParts): ReadonlyMap<string, number> {
  return new Map(parts.scanned.codeMap.files.map((file) => [file.path, file.lines]));
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
  const extension = extendCards(tasks, cardsOf(state), lineCounts(parts));
  if (!extension.ok) throw new RosettaError(ERROR_CODES.cardOutputInvalid, extension.error);
  const at = parts.deps.clock.now().toISOString();
  const all = [...assigned.value, ...extension.value.cards];
  const checked = checkCitations(all, parts.scanned.codeMap, at);
  const { events } = parts.execution;
  await announceCards(events, checked, checked.cards.slice(0, assigned.value.length));
  await announceExtensions(events, checked, extension.value);
  await announceReplaced(events, extension.value);
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

/** EV-10: the failed areas whose new reading ran to an end, counted like a re-read (RF-006). */
function failedAreasDone(plan: RoundPlan, ended: readonly EndedTask[], aborted: boolean) {
  const finished = ended.filter(({ outcome }) =>
    outcome.state === 'StoppedByCap' ? false : outcome.state !== 'Failed' || !aborted,
  );
  const areas = new Set(finished.map(({ task }) => task.area.name));
  return plan.failedAreas.map(({ area }) => area).filter((area) => areas.has(area));
}

/**
 * RF-209, RF-422, RF-423, RF-429: a Stop or a cap during the round ends the Deepen, and so does the
 * room check of the readers (the tasks it ended are no cap stop, P5-30).
 */
function stopOf(
  parts: DeepenParts,
  ended: readonly EndedTask[],
  cap: CapWatch,
): DeepenStopReason | undefined {
  const { signal } = parts.execution;
  if (signal.aborted) return isCapStop(signal.reason) ? 'capReached' : 'stopped';
  const byRoom = new Map(ended.map((each) => [each.task.agentTaskId, each.outcome]));
  const readerCapped = endsWithoutRoomStops(byRoom, parts.room).some(
    (outcome) => outcome.state === 'StoppedByCap',
  );
  if (readerCapped || cap.capped) return 'capReached';
  return roomStopReason(parts.room?.reason);
}

/** RF-241: the areas whose task ended Done. */
function doneAreasOf(ended: readonly EndedTask[]): string[] {
  return ended.filter(({ outcome }) => outcome.state === 'Done').map(({ task }) => task.area.name);
}

/** The claims the plan names are judged first. */
async function judgePlanned(
  parts: DeepenParts,
  state: DeepenState,
  round: { readonly plan: RoundPlan; readonly cap: CapWatch },
): Promise<DeepenState> {
  const wanted = new Set(round.plan.judge);
  const awaits = (claim: Card['claims'][number]): boolean => wanted.has(claim.claimId);
  return withCards(state, await judge(parts, cardsOf(state), { awaits, cap: round.cap }));
}

/** The round's reader tasks; RF-209, DEC-179, DEC-198: each gets the answered questions of its area, as a re-run does. */
export function tasksOf(
  parts: Pick<DeepenParts, 'rerun'> & {
    readonly scanned: { readonly codeMap: Pick<CodeMap, 'areas' | 'files'> };
  },
  judged: DeepenState,
  input: { readonly plan: RoundPlan; readonly round: number },
): readonly ReaderTask[] {
  const { codeMap } = parts.scanned;
  const first = nextTaskNumber(judged.results);
  const planned = roundTasks(input.plan, codeMap, first, cardsOf(judged));
  // DEC-198 (1): in round 1 every area with an answer not used yet gets a task.
  const firstRound = {
    ...{ codeMap, firstNumber: first + planned.length },
    cards: cardsOf(judged),
  };
  return withDeepenAnswers(planned, parts.rerun, input.round === 1 ? firstRound : undefined);
}

// RF-209
export async function runRound(
  parts: DeepenParts,
  state: DeepenState,
  input: {
    readonly plan: RoundPlan;
    readonly round: number;
    /** RF-429: the claims this Deepen wrote or judged in its earlier rounds. */
    readonly ownClaims: ReadonlySet<string>;
  },
): Promise<RoundEnd> {
  const { plan } = input;
  const { codeMap } = parts.scanned;
  const spent = await spentSoFar(parts);
  const before = snapshotOf(state, codeMap);
  const cap: CapWatch = { capped: false };
  const judged = await judgePlanned(parts, state, { plan, cap });
  const tasks = tasksOf(parts, judged, input);
  // RF-429, P5-30: the claims the tasks that ended have drafted wait for judgement at the round's end.
  let drafted = 0;
  const own = new Set([...input.ownClaims, ...plan.judge]);
  parts.room?.attach(
    () => roomCardsOf(cardsOf(judged), own),
    () => drafted,
  );
  const ended = await runRoundTasks(parts, tasks, ({ outcome }) => {
    drafted += outcome.drafts.reduce((sum, draft) => sum + draft.claims.length, 0);
  });
  const written = await newCardsOf(parts, judged, ended, cap);
  const results = ended.map((each) => taskResultOfRound(parts, each, written.added));
  const next = { results: [...withExtended(judged, written.extended).results, ...results] };
  const after = snapshotOf(next, codeMap);
  const [now, stopped] = [await spentSoFar(parts), stopOf(parts, ended, cap)];
  const round: DeepenRound = {
    round: input.round,
    complete: stopped === undefined || stopped === 'readersStopped',
    judged: plan.judge,
    reread: rereadDone(plan, ended, parts.execution.signal.aborted),
    failedAreas: failedAreasDone(plan, ended, parts.execution.signal.aborted),
    filesRead: [...after.filesRead].filter((path) => !before.filesRead.has(path)),
    newClaims: newClaimsOf(written),
    answersUsed: answersGivenTo(
      ended.map((each) => each.task),
      parts.rerun,
    ),
    tokens: Math.max(0, now.tokens - spent.tokens),
    costMicros: Math.max(0, now.costMicros - spent.costMicros),
  };
  const doneAreas = doneAreasOf(ended);
  return { state: next, round, doneAreas, ...(stopped === undefined ? {} : { stopped }) };
}
