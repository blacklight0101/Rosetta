import type { RunEventSink } from '../../src/application/ports/run-events.js';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { RunManifestStore } from '../../src/application/ports/run-manifest-store.js';
import type { Project } from '../../src/application/projects/project.js';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import type { RunEndState } from '../../src/domain/runs/run-states.js';
import type { Run } from '../../src/domain/runs/run.js';
import { eventFor } from './run-event-fixtures.js';
import { sampleManifest, sampleRun } from './run-fixtures.js';

// RF-615: the plan and scan runs a journey test needs beside the understand run that
// `seedPlanSource` seeds: the run row, its manifest (which names the source run) and, when it ended,
// the `run.ended` event that carries the error code.

export interface JourneyStores {
  readonly runs: Pick<RunIndex, 'insert'>;
  readonly manifests: Pick<RunManifestStore, 'write'>;
  readonly events: RunEventSink;
}

export interface PlanRunGiven {
  /** The folder name of the understand run it was written from; none leaves the manifest without one. */
  readonly sourceRunKey?: string;
  readonly runKey: string;
  readonly endState: RunEndState;
  readonly errorCode?: string;
  readonly startedAt: number;
  readonly costMicros?: number;
}

/** Seeds an ended plan run of the project with its manifest and its end event. */
export async function addPlanRun(
  stores: JourneyStores,
  project: Project,
  given: PlanRunGiven,
): Promise<Run> {
  const { runKey, endState, startedAt } = given;
  const run = sampleRun({
    ...{ userId: project.userId, projectId: project.id, stage: 'plan', runKey },
    ...{ queueState: 'Ended', endState, startedAt, endedAt: startedAt + 60_000 },
    totals: {
      costMicros: given.costMicros ?? 0,
      ...{ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    },
  });
  await stores.runs.insert(run);
  const source = given.sourceRunKey;
  await stores.manifests.write(
    scopeOf(run),
    sampleManifest({
      ...{ runId: runKey, stage: 'plan', endState },
      ...(source === undefined ? {} : { sourceRunId: source }),
    }),
  );
  const data = {
    endState,
    ...(given.errorCode === undefined ? {} : { errorCode: given.errorCode }),
  };
  await stores.events.publish(scopeOf(run), eventFor(scopeOf(run), 1, 'run.ended', data));
  return run;
}

/** Seeds a scan run of the project that ended as given. */
export async function addScanRun(
  stores: Pick<JourneyStores, 'runs'>,
  project: Project,
  given: { readonly runKey: string; readonly endState: RunEndState },
): Promise<Run> {
  const run = sampleRun({
    ...{ userId: project.userId, projectId: project.id, stage: 'scan', runKey: given.runKey },
    ...{ queueState: 'Ended', endState: given.endState },
  });
  await stores.runs.insert(run);
  return run;
}
