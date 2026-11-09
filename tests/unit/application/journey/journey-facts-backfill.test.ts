import { describe, expect, it } from 'vitest';
import { backfillJourneyFacts } from '../../../../src/application/journey/journey-facts-backfill.js';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import type {
  JourneyFactsBackfill,
  PendingProject,
  StoredRunFacts,
} from '../../../../src/application/ports/journey-facts-store.js';
import type { RunEventHistory } from '../../../../src/application/ports/run-events.js';
import type { EpochMs } from '../../../../src/domain/accounts/user.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { FileRunCards } from '../../../../src/infrastructure/cards/file-run-cards.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { addPlanRun } from '../../../support/journey-seed.js';
import { briefSavedAt, setup, sourceKey } from '../../../support/journey-setup.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { sampleManifest } from '../../../support/run-fixtures.js';

// P8-139, DEC-226, RF-615: the runs and projects from before the facts were stored are filled once
// from their files. A fact whose file is missing, torn or another run's stays null and is logged,
// and the row is marked filled all the same, so it is not read again.

/** The rows the backfill is offered, and what it filled, in memory. */
class PendingRows implements JourneyFactsBackfill {
  readonly runs: Run[];
  readonly projects: PendingProject[];
  readonly filledRuns = new Map<string, StoredRunFacts>();
  /** The end time each fill said the pass read, by run id. */
  readonly readEnds = new Map<string, EpochMs | null>();
  readonly filledProjects = new Map<string, EpochMs | null>();

  constructor(runs: readonly Run[], projects: readonly PendingProject[]) {
    this.runs = [...runs];
    this.projects = [...projects];
  }

  pendingRuns(limit: number): Promise<readonly Run[]> {
    return Promise.resolve(this.runs.filter((run) => !this.filledRuns.has(run.id)).slice(0, limit));
  }

  fillRun(read: Pick<Run, 'id' | 'endedAt'>, facts: StoredRunFacts): Promise<void> {
    this.filledRuns.set(read.id, facts);
    this.readEnds.set(read.id, read.endedAt);
    return Promise.resolve();
  }

  pendingProjects(limit: number): Promise<readonly PendingProject[]> {
    const left = this.projects.filter((each) => !this.filledProjects.has(each.projectId));
    return Promise.resolve(left.slice(0, limit));
  }

  fillProject(projectId: string, at: EpochMs | null): Promise<void> {
    this.filledProjects.set(projectId, at);
    return Promise.resolve();
  }
}

async function world() {
  const w = await setup();
  const source = await w.seed({ brief: true });
  if (source === undefined) throw new Error('No source run');
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  const deps = {
    ...{ runs: w.parts.runs, manifests: w.parts.manifests, history: w.parts.events },
    ...{ cards: new FileRunCards(w.files), briefs: w.briefs, logger },
    ...{ answers: w.answers, priorCards: w.priorCards },
  };
  return { ...w, deps, source, logger };
}

describe('the backfill of the journey facts', () => {
  it('DEC-226 RF-615 fills every fact the files hold, once', async () => {
    const w = await world();
    const plan = await addPlanRun(w.parts, w.project, {
      ...{ runKey: '20261012-120000-plan', endState: 'Failed', startedAt: briefSavedAt + 1 },
      ...{ sourceRunKey: sourceKey, errorCode: ERROR_CODES.planCoverageGap },
    });
    const owner = { userId: w.project.userId, projectId: w.project.id };
    const pending = new PendingRows([w.source, plan], [owner]);

    await backfillJourneyFacts({ ...w.deps, pending });

    expect(pending.filledRuns.get(plan.id)).toEqual({
      ...{ deepenParentId: null, planSourceKey: sourceKey },
      ...{ endCode: ERROR_CODES.planCoverageGap, supportedClaims: null, openQuestions: null },
    });
    expect(pending.filledRuns.get(w.source.id)).toMatchObject({
      ...{ deepenParentId: null, endCode: null, supportedClaims: 4, openQuestions: 2 },
    });
    expect(pending.filledProjects.get(w.project.id)).toBe(briefSavedAt);
  });

  it('RF-615 fills each run with the end time the pass read, so the store can keep a newer end', async () => {
    const w = await world();
    const plan = await addPlanRun(w.parts, w.project, {
      ...{ runKey: '20261012-120000-plan', endState: 'Failed', startedAt: briefSavedAt + 1 },
      ...{ sourceRunKey: sourceKey, errorCode: ERROR_CODES.planCoverageGap },
    });
    const read = { ...plan, endedAt: Date.parse('2026-10-12T12:30:00.123Z') };
    const pending = new PendingRows([read], []);

    await backfillJourneyFacts({ ...w.deps, pending });

    expect(pending.readEnds.get(plan.id)).toBe(read.endedAt);
  });
});

describe('the backfill of the journey facts with bad files', () => {
  it('DEC-226 a torn event log and another run’s manifest leave nulls, are logged and are not read again', async () => {
    const w = await world();
    const plan = await addPlanRun(w.parts, w.project, {
      ...{ runKey: '20261012-120000-plan', endState: 'Failed', startedAt: briefSavedAt + 1 },
      ...{ sourceRunKey: sourceKey, errorCode: ERROR_CODES.planCoverageGap },
    });
    await w.parts.manifests.write(
      scopeOf(plan),
      sampleManifest({ runId: '20261001-090000-plan', stage: 'plan', sourceRunId: sourceKey }),
    );
    const torn: Pick<RunEventHistory, 'read' | 'lastSeq'> = {
      lastSeq: () => Promise.resolve(3),
      read: () => Promise.reject(new RosettaError(ERROR_CODES.runEventLogFailed, 'Torn line')),
    };
    const pending = new PendingRows([plan], []);

    await backfillJourneyFacts({ ...w.deps, history: torn, pending });
    await backfillJourneyFacts({ ...w.deps, history: torn, pending });

    expect(pending.filledRuns.get(plan.id)).toEqual({
      ...{ deepenParentId: null, planSourceKey: null, endCode: null },
      ...{ supportedClaims: null, openQuestions: null },
    });
    const warnings = w.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warnings.map((entry) => [entry.runId, entry.data?.['fact']])).toEqual([
      [plan.runKey, 'manifest'],
      [plan.runKey, 'endCode'],
    ]);
  });
});
