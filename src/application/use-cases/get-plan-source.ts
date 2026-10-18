import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-614 (skeleton): the source run Plan setup names. Filled in by the next commit.

export interface PlanSource {
  readonly runId: string;
  readonly runKey: string;
  readonly endedAt: number | null;
  readonly areas: readonly string[];
  readonly supportedClaims: number;
  readonly newest: boolean;
}

export interface GetPlanSourceRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly runId?: string;
}

export interface GetPlanSourceDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly cards: RunCards;
}

export class GetPlanSource {
  private readonly deps: GetPlanSourceDependencies;

  constructor(deps: GetPlanSourceDependencies) {
    this.deps = deps;
  }

  async execute(request: GetPlanSourceRequest): Promise<Result<PlanSource, ErrorCode>> {
    await this.deps.projects.find(request.actor.userId, request.projectId);
    return err(ERROR_CODES.notFound);
  }
}
