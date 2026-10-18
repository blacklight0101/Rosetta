import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { AccountUsage } from '../ports/account-usage.js';
import type { Clock } from '../ports/clock.js';
import type { ServerSettings } from '../ports/server-settings.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { PlanInputDependencies } from '../plan/plan-inputs.js';
import type { PlanEstimate } from './plan-estimate-types.js';
import type { RolePricing } from './role-estimate.js';

// RF-613, ADR-007, DEC-81: the estimate before a plan run.

export interface EstimatePlanDependencies extends PlanInputDependencies, RolePricing {
  readonly users: Pick<UserRepository, 'findById'>;
  readonly serverSettings: Pick<ServerSettings, 'caps'>;
  readonly usage: Pick<AccountUsage, 'userDay' | 'serverMonth'>;
  readonly clock: Clock;
  /** The principle catalogue the run plans with (RF-606). */
  readonly catalogue: () => Promise<Catalogue>;
  /** The planner's versioned prompt file (RNF-004). */
  readonly prompt: () => Promise<PromptFile>;
}

export interface EstimatePlanRequest {
  readonly actor: Actor;
  readonly projectId: string;
}

export type EstimatePlanProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.planBriefMissing
  | typeof ERROR_CODES.planSourceMissing;

export class EstimatePlan {
  private readonly deps: EstimatePlanDependencies;

  constructor(deps: EstimatePlanDependencies) {
    this.deps = deps;
  }

  // RF-613
  async execute(request: EstimatePlanRequest): Promise<Result<PlanEstimate, EstimatePlanProblem>> {
    await this.deps.projects.find(request.actor.userId, request.projectId);
    return err(ERROR_CODES.notFound);
  }
}
