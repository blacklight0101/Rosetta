import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import {
  journeyRemaining,
  journeySpend,
  type JourneyRecord,
} from '../../domain/journey/journey-record.js';
import { isBriefOutOfDateAt } from '../../domain/planning/brief-freshness.js';
import type { Run } from '../../domain/runs/run.js';
import { familyIn } from '../answers/run-family.js';
import type {
  Journey,
  JourneyBudget,
  JourneyHandoff,
  JourneyRun,
  JourneySource,
} from './journey.js';

// RF-615, RF-614, RF-010, DEC-142, DEC-143, DEC-226: the journey of a project from its stored facts
// alone: the run rows (with the run a Deepen improves, the source of a plan run, the end code, the
// Supported claims and the open questions of each run), the brief time of the project, its journey
// record and the places in the queue. Pure, so the journey read and the projects overview (P8-137)
// turn the same facts into the same journey. A fact nobody stored reads as a missing file did.
// The journey may be about an understand run, a plan run (its source is the run it names) or none
// (the newest completed understand run of the project, else its newest one).

export interface StoredJourney {
  /** The project's runs with their stored facts, newest first (RunIndex.list). */
  readonly runs: readonly Run[];
  /** When the planning brief was saved; null while none is saved. */
  readonly briefSavedAt: EpochMs | null;
  /** RF-1021: the journey record of the project; without it no amount is reported. */
  readonly record: JourneyRecord | undefined;
  /** EV-80: the place of each queued run in the server's queue, counted from 1. */
  readonly positions: ReadonlyMap<string, number>;
}

type NotFound = typeof ERROR_CODES.notFound;
/** The understand run each plan run was written from, by the id of the plan run. */
type PlanSources = ReadonlyMap<string, string | null>;
interface HandoffParts {
  readonly briefSavedAt: EpochMs | null;
  readonly sources: PlanSources;
}

/** A run that is not `Completed` asks no question and, for the journey, has no Deepen. */
const NO_QUESTIONS = { openQuestions: 0, deepens: 0, isDeepen: false, deepening: false } as const;

const isUnderstand = (run: Run): boolean => run.stage === 'understand';
const isCompleted = (run: Run): boolean => run.endState === 'Completed';
const isPlan = (run: Run): boolean => run.stage === 'plan';
const isJourneyRun = (run: Run): boolean => isUnderstand(run) || isPlan(run);
const startOf = (run: Run): number => run.startedAt ?? run.queuedAt;
/** RF-615: the code of the `run.ended` that closed the run; none while it has not ended. */
const endCodeOf = (run: Run): string | null =>
  run.queueState === 'Ended' ? (run.endCode ?? null) : null;

/** The newest completed understand run of the project, else its newest understand run. */
const newestSource = (list: readonly Run[]): Run | undefined =>
  list.find((run) => isUnderstand(run) && isCompleted(run)) ?? list.find(isUnderstand);

/** The understand run the journey is about: the named one, the one a named plan run came from, or the newest. */
function chooseSource(list: readonly Run[], named: Run | undefined, sources: PlanSources) {
  if (named !== undefined && isUnderstand(named)) return named;
  const key = named === undefined ? undefined : sources.get(named.id);
  const written = key === undefined ? undefined : list.find((run) => run.runKey === key);
  return written !== undefined && isUnderstand(written) ? written : newestSource(list);
}

/**
 * Out of date when the brief was saved after the package began, when it was written from another
 * understand run, or when this run ended after it began (DEC-143 Q-C).
 */
function handoffOf(
  list: readonly Run[],
  source: Run,
  written: { readonly run: Run; readonly gaps: boolean },
  parts: HandoffParts,
): JourneyHandoff {
  const { briefSavedAt, sources } = parts;
  const from = sources.get(written.run.id) ?? null;
  const briefChanged = briefSavedAt !== null && isBriefOutOfDateAt(briefSavedAt, list);
  const otherSource = from !== null && from !== source.runKey;
  const sourceChanged = source.endedAt !== null && source.endedAt > startOf(written.run);
  return {
    ...{ runId: written.run.id, runKey: written.run.runKey },
    ...{ outOfDate: briefChanged || otherSource || sourceChanged, gaps: written.gaps },
  };
}

/**
 * The package is the newest plan run of the project that wrote one: a run that ended `Completed`,
 * or one that ended RST-1806 after writing the package with gaps (RF-627, Q-44).
 */
function handoffFor(list: readonly Run[], source: Run, parts: HandoffParts): JourneyHandoff | null {
  for (const run of list.filter(isPlan)) {
    if (isCompleted(run)) return handoffOf(list, source, { run, gaps: false }, parts);
    if (run.endState === 'Failed' && endCodeOf(run) === ERROR_CODES.planCoverageGap) {
      return handoffOf(list, source, { run, gaps: true }, parts);
    }
  }
  return null;
}

/** RF-1021: what the owner approved for the journey and what is left of it. */
function budgetOf(record: JourneyRecord | undefined, list: readonly Run[]): JourneyBudget | null {
  if (record === undefined) return null;
  const left = journeyRemaining(record, list);
  return {
    spentMicros: journeySpend(record, list).costMicros,
    approvedMicros: record.approved.costMicros,
    remainingMicros: left.costMicros,
    approvedTokens: record.approved.tokens,
    remainingTokens: left.tokens,
  };
}

function runFacts(run: Run, positions: ReadonlyMap<string, number>): JourneyRun {
  return {
    ...{ id: run.id, runKey: run.runKey, queueState: run.queueState, endState: run.endState },
    ...{ endedAt: run.endedAt, costMicros: run.totals.costMicros },
    unreadAreas: run.unreadAreas,
    endReason: run.endReason,
    // EV-80: only a queued run has a place.
    position: run.queueState === 'Queued' ? (positions.get(run.id) ?? null) : null,
    errorCode: endCodeOf(run),
  };
}

/**
 * The run, and for a run that ended `Completed` its Supported claims, the open questions of its
 * family and its Deepens; for a run that ended `CapReached` its Supported claims (P3-121) and no question.
 */
function sourceFacts(run: Run, list: readonly Run[], stored: StoredJourney): JourneySource {
  const facts = runFacts(run, stored.positions);
  const supportedClaims = run.supportedClaims ?? 0;
  if (run.endState === 'CapReached') return { ...facts, supportedClaims, ...NO_QUESTIONS };
  if (!isCompleted(run)) return { ...facts, supportedClaims: 0, ...NO_QUESTIONS };
  // RF-646, DEC-179: the family from the run each understand run improves.
  const understand = list.filter(isUnderstand);
  const parents = new Map(understand.map((each) => [each.id, each.deepenParentId] as const));
  const family = familyIn(understand, parents, run);
  return {
    ...facts,
    supportedClaims,
    openQuestions: run.openQuestions ?? 0,
    deepens: family.deepens,
    isDeepen: family.isDeepen,
    deepening: family.deepening,
  };
}

/**
 * RF-615, RF-010: the journey of the project from its stored facts; `runId` names an understand or a
 * plan run of the project, anything else is not found.
 */
export function journeyOfFacts(stored: StoredJourney, runId?: string): Result<Journey, NotFound> {
  const list = stored.runs;
  const named = list.find((run) => run.id === runId);
  if (runId !== undefined && (named === undefined || !isJourneyRun(named))) {
    return err(ERROR_CODES.notFound);
  }
  const sources: PlanSources = new Map(
    list.filter(isPlan).map((run) => [run.id, run.planSourceKey ?? null] as const),
  );
  const scan = list.find((run) => run.stage === 'scan' && isCompleted(run));
  const briefSaved = stored.briefSavedAt !== null;
  const base = { scanRunId: scan?.id ?? null, briefSaved, budget: budgetOf(stored.record, list) };
  const source = chooseSource(list, named, sources);
  if (source === undefined) return ok({ ...base, source: null, plan: null, handoff: null });
  const plan = list.find((run) => isPlan(run) && sources.get(run.id) === source.runKey);
  const parts = { briefSavedAt: stored.briefSavedAt, sources };
  return ok({
    ...base,
    source: sourceFacts(source, list, stored),
    plan: plan === undefined ? null : runFacts(plan, stored.positions),
    handoff: handoffFor(list, source, parts),
  });
}
