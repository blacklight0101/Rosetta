/* eslint-disable @typescript-eslint/no-unused-vars -- stub until the feat commit */
import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Clock } from '../ports/clock.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { RunQueue } from '../runs/run-queue.js';
import type { SubmittedRun } from './submit-run.js';

// RF-006, RF-1105, RF-143, ADR-007, DEC-13: Resume run queues an ended understand run again.

export interface ResumeRunDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly manifests: RunManifestStore;
  readonly queue: Pick<RunQueue, 'dispatch' | 'positionOf'>;
  readonly clock: Clock;
  readonly ollamaHost?: string;
}

export type ResumeProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.runNotResumable
  | typeof ERROR_CODES.cloudConsentMissing;

export class ResumeRun {
  private readonly deps: ResumeRunDependencies;

  constructor(deps: ResumeRunDependencies) {
    this.deps = deps;
  }

  // RF-006, RF-1105
  execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<SubmittedRun, ResumeProblem>> {
    return Promise.resolve(err(ERROR_CODES.runNotResumable));
  }
}
