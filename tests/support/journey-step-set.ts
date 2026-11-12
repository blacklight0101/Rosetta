import { vi } from 'vitest';
import { readUnderstandOptions } from '../../src/application/understand/understand-options.js';
import { ContinueRun } from '../../src/application/use-cases/continue-run.js';
import { StartRun } from '../../src/application/use-cases/start-run.js';
import type { Amount, ApprovedAmount } from '../../src/domain/budget/approved-amount.js';
import { ApprovalPause } from '../../src/domain/budget/cap-stop.js';
import { journeyRemaining } from '../../src/domain/journey/journey-record.js';
import type { Run } from '../../src/domain/runs/run.js';
import type { Project } from '../../src/application/projects/project.js';
import { MemoryJourneyRecords } from '../../src/infrastructure/db/memory-journey-records.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { journeyOf, serverJourney } from './journey-lookups.js';
import { MemoryBriefStore } from './memory-brief-store.js';
import { sampleProject } from './project-fixtures.js';
import { settingsFor } from './provider-factory-harness.js';
import { createRunHarness, userAmy, type RunHarness } from './run-harness.js';
import { ALL_KEYS_SERVED } from './web-role-keys.js';

// RF-432, RF-435, P9-01: a project whose journey was recorded by Analyse, its understand step over
// the run harness (whose pause reads the journey), and Continue wired as the composition root does.

const fake = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'judge-model' },
});

/** The server's worst-case journey total, the amount Analyse approves. */
export const worst = serverJourney.worstCase;

export interface JourneyStepSet {
  readonly harness: RunHarness;
  readonly project: Project;
  readonly journeys: MemoryJourneyRecords;
  readonly startRun: StartRun;
  readonly continueRun: ContinueRun;
}

export async function journeyStepSet(): Promise<JourneyStepSet> {
  const journeys = new MemoryJourneyRecords();
  const harness = createRunHarness({ journeys });
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings: fake });
  await projects.insertOrFind(project);
  const briefs = new MemoryBriefStore();
  await briefs.saveEmpty({ userId: userAmy.userId, projectId: project.id });
  const startRun = new StartRun({
    ...{ journey: journeyOf(serverJourney), roleKeys: ALL_KEYS_SERVED, briefs },
    ...{ projects, journeys, runs: harness.runs, manifests: harness.manifests },
    submit: harness.submit,
  });
  const { runs, manifests, queue, clock } = harness;
  const continueRun = new ContinueRun({ runs, manifests, queue, clock, journeys });
  return { harness, project, journeys, startRun, continueRun };
}

export async function stateOf(h: RunHarness, run: Run, state: Run['queueState']): Promise<Run> {
  let latest: Run | undefined;
  await vi.waitFor(
    async () => {
      latest = await h.runs.find(run.userId, run.id);
      if (latest?.queueState !== state) throw new Error(`The run is not ${state}`);
    },
    { interval: 2, timeout: 20_000 },
  );
  if (latest === undefined) throw new Error('The run vanished');
  return latest;
}

/** Analyse, then the understand run spends its whole line and stops at it (the approval pause). */
export async function stoppedStep(set: JourneyStepSet): Promise<Run> {
  const { harness, project, startRun } = set;
  const started = await startRun.execute({
    ...{ actor: userAmy, projectId: project.id, stage: 'understand' },
    approvedAmount: { tokens: worst.tokens, costMicros: worst.costMicros },
  });
  if (!started.ok) throw new Error('Analyse was refused.');
  const { run } = started.value;
  await harness.runs.recordTotals(run.id, {
    ...{ costMicros: 0, inputTokens: worst.tokens, outputTokens: 0 },
    cachedInputTokens: 0,
  });
  return run;
}

/** The step stops at its approved line, as the budget guard stops it (RF-432). */
export function stopAtLine(set: JourneyStepSet, run: Run): void {
  set.harness.executor.started[0]?.stop(new ApprovalPause());
  set.harness.executor.settle(run.id, { endState: 'Completed', unreadAreas: 1 });
}

/** Analyse, then the understand step pauses at its line. */
export async function pausedStep(set: JourneyStepSet): Promise<Run> {
  const run = await stoppedStep(set);
  stopAtLine(set, run);
  return stateOf(set.harness, run, 'AwaitingApproval');
}

export async function approvedOf(h: RunHarness, run: Run): Promise<ApprovedAmount | undefined> {
  const manifest = await h.manifests.read(h.scopeOf(run));
  return manifest === undefined
    ? undefined
    : readUnderstandOptions(manifest.options).approvedAmount;
}

/** Saves the project's journey with this approved amount (and start), as Analyse would. */
export async function journeyAt(
  set: JourneyStepSet,
  approved: Amount,
  createdAt?: number,
): Promise<void> {
  const record = await set.journeys.find(userAmy.userId, set.project.id);
  if (record === undefined) throw new Error('No journey.');
  await set.journeys.save({ ...record, approved, createdAt: createdAt ?? record.createdAt });
}

export async function remainderOf(set: JourneyStepSet): Promise<Amount> {
  const record = await set.journeys.find(userAmy.userId, set.project.id);
  if (record === undefined) throw new Error('No journey.');
  return journeyRemaining(record, await set.harness.runs.list(userAmy.userId, set.project.id));
}
