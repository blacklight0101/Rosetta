import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { Project } from '../projects/project.js';
import { acceptedManifest } from '../runs/accepted-manifest.js';
import { scopeOf } from '../runs/run-scope.js';
import type { RunQueue } from '../runs/run-queue.js';

// RF-003, RF-1108, RF-1105: Submit run accepts a run of one of the user's projects. It gets its own
// folder name (`yyyyMMdd-HHmmss-<stage>`, with a number added when the project already has a run in
// that second), is queued with its manifest written, and starts at once when the queue has room.
// The stage's route (P1-23 for `scan`) calls this.

export interface SubmitRunDependencies {
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly queue: RunQueue;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly rosettaVersion: string;
}

export interface SubmitRunRequest {
  readonly actor: Actor;
  readonly project: Project;
  readonly stage: RunStage;
  /** The start request's options, recorded in the manifest. */
  readonly options: Readonly<Record<string, unknown>>;
}

export interface SubmittedRun {
  /** The run as it is now: queued, or already running. */
  readonly run: Run;
  /** Its place in the queue, counted from 1; undefined when it started. */
  readonly position: number | undefined;
}

const MAX_KEY_ATTEMPTS = 50;

export class SubmitRun {
  private readonly deps: SubmitRunDependencies;

  constructor(deps: SubmitRunDependencies) {
    this.deps = deps;
  }

  // RF-003, RF-1108
  async execute(
    request: SubmitRunRequest,
  ): Promise<Result<SubmittedRun, typeof ERROR_CODES.notFound>> {
    const { actor, project, stage } = request;
    if (project.userId !== actor.userId) return err(ERROR_CODES.notFound);
    const run = await this.insert(project, stage);
    await this.writeManifest(run, request);
    await this.deps.queue.dispatch();
    const current = await this.deps.runs.find(actor.userId, run.id);
    return ok({ run: current ?? run, position: await this.deps.queue.positionOf(run.id) });
  }

  private async insert(project: Project, stage: RunStage): Promise<Run> {
    const { runs, ids, clock } = this.deps;
    const base = ids.runId(stage);
    const queuedAt = clock.now().getTime();
    for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt += 1) {
      const run: Run = {
        id: ids.uuid(),
        projectId: project.id,
        userId: project.userId,
        runKey: attempt === 1 ? base : `${base}-${String(attempt)}`,
        stage,
        commitSha: null,
        snapshotKey: null,
        queueState: 'Queued',
        endState: null,
        queuedAt,
        startedAt: null,
        endedAt: null,
        totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      };
      const inserted = await runs.insert(run);
      if (inserted.ok) return run;
    }
    throw new Error('No free run folder name in this second');
  }

  /** A run without its manifest could not start, so it is cancelled and the failure is rethrown. */
  private async writeManifest(run: Run, request: SubmitRunRequest): Promise<void> {
    const { manifests, rosettaVersion } = this.deps;
    try {
      await manifests.write(
        scopeOf(run),
        acceptedManifest({
          run,
          project: request.project,
          rosettaVersion,
          options: request.options,
        }),
      );
    } catch (error) {
      await this.deps.runs.end(run.id, 'Interrupted', this.deps.clock.now().getTime());
      throw error;
    }
  }
}
