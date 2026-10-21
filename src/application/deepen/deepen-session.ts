import {
  endedDeepen,
  rereadIn,
  withOutOfScope,
  withRound,
  writtenIn,
  type DeepenRecord,
} from '../../domain/deepen/deepen-record.js';
import { isEmptyRound, planRound } from '../../domain/deepen/round-plan.js';
import {
  roundProgress,
  stopAfterRound,
  type DeepenStopReason,
} from '../../domain/deepen/stop-rule.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import type { RunOutcome } from '../ports/run-executor.js';
import { leaveUnverified } from '../verifier/leave-unverified.js';
import {
  announceDeepen,
  announceDeepenMerges,
  announceRoundEnd,
  announceRoundStart,
  announceStop,
} from './deepen-events.js';
import { mergeDuplicates } from './deepen-consolidation.js';
import { addQuestions, overviewOf, saveRecord, writeOutputs } from './deepen-outputs.js';
import type { DeepenParts } from './deepen-parts.js';
import { runRound } from './deepen-round.js';
import { seedDeepen } from './deepen-seed.js';
import {
  cardsOf,
  coverageEntriesOf,
  measuresOf,
  snapshotOf,
  withCards,
  type DeepenState,
} from './deepen-state.js';

// RF-209, RF-231, RF-006, RF-250, DEC-144, DEC-145: a Deepen run, round after round. Each round is planned
// from the cards and coverage so far; a round with nothing to do, or one that adds no `Supported`
// claim and reads no new first-party file, ends the run with "no progress"; so do the round limit,
// a cap (the run ends `CapReached` and can be resumed) and the owner's Stop. The record of every
// round, and the measures before and after, are written into the manifest as the run goes.

interface Progress {
  readonly state: DeepenState;
  readonly record: DeepenRecord;
}

/** RF-209: the next round, or why the Deepen ends before it. */
async function nextRound(
  parts: DeepenParts,
  { state, record }: Progress,
): Promise<{ readonly progress: Progress; readonly stop?: DeepenStopReason }> {
  if (record.roundsDone >= record.maxRounds)
    return { progress: { state, record }, stop: 'roundLimit' };
  const { codeMap } = parts.scanned;
  const plan = planRound({
    ...{ cards: cardsOf(state), coverage: coverageEntriesOf(state), files: codeMap.files },
    ...{ reread: rereadIn(record), writtenHere: writtenIn(record) },
    coveragePass: record.coveragePass,
  });
  const listed = withOutOfScope(record, plan.outOfScope);
  if (isEmptyRound(plan)) return { progress: { state, record: listed }, stop: 'noProgress' };
  const before = snapshotOf(state, codeMap);
  const round = record.rounds.length + 1;
  await announceRoundStart(parts, { round, maxRounds: record.maxRounds, plan });
  const end = await runRound(parts, state, { plan, round });
  await announceRoundEnd(parts, end.round);
  const next = { state: end.state, record: withRound(listed, end.round) };
  await saveRecord(parts, next.record);
  await writeOutputs(parts, next.state);
  if (end.stopped !== undefined) return { progress: next, stop: end.stopped };
  const added = roundProgress(before, snapshotOf(end.state, codeMap));
  const stop = stopAfterRound(added, next.record.roundsDone, next.record.maxRounds);
  return { progress: next, ...(stop === undefined ? {} : { stop }) };
}

/** RF-209, RF-304, RF-231: the end of the run: its outputs, overview and record. */
async function finish(
  parts: DeepenParts,
  { state, record }: Progress,
  stop: DeepenStopReason,
): Promise<RunOutcome> {
  const at = parts.deps.clock.now().toISOString();
  // RF-304: a cap leaves the claims it kept from judgement `Unverified`, for the resume.
  const final =
    stop === 'capReached' ? withCards(state, leaveUnverified(cardsOf(state), at)) : state;
  const written = writtenIn(record);
  const fresh = cardsOf(final).filter((card) => card.claims.some((c) => written.has(c.claimId)));
  await addQuestions(parts, fresh);
  const merged = await mergeDuplicates(parts, cardsOf(final));
  const overview = await overviewOf(parts, final, merged?.cards);
  await writeOutputs(parts, final, { overview, merged });
  if (merged !== undefined) await announceDeepenMerges(parts, merged);
  // RF-1108: a Stop that came during the merge or the overview ends the Deepen like any Stop.
  const ended = stop !== 'capReached' && parts.execution.signal.aborted ? 'stopped' : stop;
  await saveRecord(parts, endedDeepen(record, ended, measuresOf(final, parts.scanned.codeMap)));
  await announceStop(parts, record, ended);
  if (ended === 'stopped') return { endState: 'Interrupted' };
  if (stop === 'capReached')
    return { endState: 'CapReached', errorCode: ERROR_CODES.budgetCapReached };
  return { endState: 'Completed' };
}

async function refused(parts: DeepenParts, code: ErrorCode): Promise<RunOutcome> {
  const { run } = parts.execution;
  await parts.logger.log({
    ...{ level: 'error', logger: 'understand', code, runId: run.runKey, userId: run.userId },
    message: 'The run to deepen cannot be read as this Deepen needs it.',
    data: { parentRunId: parts.request.parentRunId },
  });
  return { endState: 'Failed', errorCode: code };
}

// RF-209
export async function runDeepen(parts: DeepenParts): Promise<RunOutcome> {
  const seeded = await seedDeepen(parts);
  if (!seeded.ok) return refused(parts, seeded.error);
  let progress: Progress = seeded.value;
  await saveRecord(parts, progress.record);
  await writeOutputs(parts, progress.state);
  await announceDeepen(parts, progress.state, progress.record);
  for (;;) {
    const step = await nextRound(parts, progress);
    progress = step.progress;
    if (step.stop !== undefined) return finish(parts, progress, step.stop);
  }
}
