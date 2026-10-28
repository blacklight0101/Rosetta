import type { ClaimStatus } from '../cards/card-vocabulary.js';
import type { Run } from '../runs/run.js';
import type { OutOfScopeClaim } from './round-plan.js';
import type { DeepenStopReason } from './stop-rule.js';
import type { UnderstandingMeasures } from './understanding-measures.js';

// RF-209, RF-231, data-model.md section 3.6 (`deepen`): what the manifest of a Deepen run records:
// the completed run it improves, the round limit and the coverage pass the owner confirmed, each
// round (claims judged, claims re-read with the verifier's reason, files read, new claims with the
// id they replace, tokens and cost), why it stopped, the rejected claims left out of scope, and
// the measures before and after.

/** The measures without the list of unread files, which the summary counts. */
type MeasureSummary = Omit<UnderstandingMeasures, 'filesNotRead'> & {
  readonly filesNotRead: number;
};

interface DeepenNewClaim {
  readonly claimId: string;
  readonly status: ClaimStatus;
  readonly replaces?: string | undefined;
}

export interface DeepenRound {
  /** From 1. */
  readonly round: number;
  /** False when a cap or a Stop ended the run during the round; a resume runs it again. */
  readonly complete: boolean;
  readonly judged: readonly string[];
  readonly reread: readonly { readonly claimId: string; readonly reason: string }[];
  /** EV-10: the areas that had failed and that the round read again. */
  readonly failedAreas: readonly string[];
  /** First-party files the round read lines of for the first time. */
  readonly filesRead: readonly string[];
  readonly newClaims: readonly DeepenNewClaim[];
  /** DEC-179: the answered questions (`<run folder>/<card id>`) the round gave to its readers. */
  readonly answersUsed: readonly string[];
  readonly tokens: number;
  readonly costMicros: number;
}

export interface DeepenRecord {
  /** The id of the completed understand run this one improves. */
  readonly parentRunId: string;
  /** Its folder name, as the pages show it. */
  readonly parentRunKey: string;
  readonly maxRounds: number;
  readonly coveragePass: boolean;
  /** Rounds that ran to their end. */
  readonly roundsDone: number;
  readonly stopReason: DeepenStopReason | null;
  readonly outOfScope: readonly OutOfScopeClaim[];
  readonly rounds: readonly DeepenRound[];
  readonly before: MeasureSummary | null;
  readonly after: MeasureSummary | null;
}

function measureSummaryOf(measures: UnderstandingMeasures): MeasureSummary {
  return { ...measures, filesNotRead: measures.filesNotRead.length };
}

// RF-209
export function newDeepenRecord(
  parent: Pick<DeepenRecord, 'parentRunId' | 'parentRunKey' | 'maxRounds' | 'coveragePass'>,
  before: UnderstandingMeasures,
): DeepenRecord {
  return {
    ...parent,
    roundsDone: 0,
    stopReason: null,
    outOfScope: [],
    rounds: [],
    before: measureSummaryOf(before),
    after: null,
  };
}

/** The record with one more round; only a round that ran to its end counts as done. */
// RF-209
export function withRound(record: DeepenRecord, round: DeepenRound): DeepenRecord {
  const rounds = [...record.rounds, round];
  return { ...record, rounds, roundsDone: rounds.filter((each) => each.complete).length };
}

/** RF-209: the rejected claims a round plan left out of scope, each listed once. */
export function withOutOfScope(
  record: DeepenRecord,
  outOfScope: readonly OutOfScopeClaim[],
): DeepenRecord {
  const known = new Set(record.outOfScope.map((each) => each.claimId));
  const added = outOfScope.filter((each) => !known.has(each.claimId));
  return added.length === 0 ? record : { ...record, outOfScope: [...record.outOfScope, ...added] };
}

/** RF-209: the claims written in this Deepen, in any round. */
export function writtenIn(record: DeepenRecord): ReadonlySet<string> {
  return new Set(record.rounds.flatMap((round) => round.newClaims.map((each) => each.claimId)));
}

// RF-209, RF-231
export function endedDeepen(
  record: DeepenRecord,
  stopReason: DeepenStopReason,
  after: UnderstandingMeasures,
): DeepenRecord {
  return { ...record, stopReason, after: measureSummaryOf(after) };
}

/** RF-006: a resumed Deepen goes on from the rounds it finished; it has not stopped yet. */
export function reopenedDeepen(record: DeepenRecord): DeepenRecord {
  return { ...record, stopReason: null, after: null };
}

/** RF-209: the claims this Deepen sent back to a reader, in any round, finished or not. */
export function rereadIn(record: DeepenRecord): ReadonlySet<string> {
  return new Set(record.rounds.flatMap((round) => round.reread.map((each) => each.claimId)));
}

/** RF-209, DEC-179: how many different answers of the project the Deepen gave to its readers. */
export function answersUsedIn(record: Pick<DeepenRecord, 'rounds'>): number {
  return new Set(record.rounds.flatMap((round) => round.answersUsed)).size;
}

/** EV-10: the failed areas this Deepen read again, in any round, finished or not. */
export function retriedAreasIn(record: DeepenRecord): ReadonlySet<string> {
  return new Set(record.rounds.flatMap((round) => round.failedAreas));
}

/** RF-209: only an understand run that ended `Completed` can be deepened (a Deepen run too, Q-L). */
export function canDeepen(run: Pick<Run, 'stage' | 'endState'>): boolean {
  return run.stage === 'understand' && run.endState === 'Completed';
}
