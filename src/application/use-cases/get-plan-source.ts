import type { Actor } from '../../domain/accounts/actor.js';
import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import { planSourceRun } from '../plan/plan-source.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-614, RF-605, RST-1802, RF-1105: Plan setup names the understand run it plans from. Given the id
// of a run (Plan setup opened from the run page) it describes that run; without one it describes the
// project's newest understand run that ended `Completed` (Plan setup opened from the project). A
// run that did not complete, or has no `Supported` claim, is refused (RST-1802); an unknown id,
// another user's run and a run of another project are not found, like another user's project.

export interface PlanSource {
  readonly runId: string;
  /** The run's folder name. */
  readonly runKey: string;
  readonly endedAt: EpochMs | null;
  /** The areas of the run's cards, in code-unit order. */
  readonly areas: readonly string[];
  /** The `Supported` claims of the run's cards: what the package can use. */
  readonly supportedClaims: number;
  /** Whether it is the project's newest completed understand run. */
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

type PlanSourceProblem = typeof ERROR_CODES.notFound | typeof ERROR_CODES.planSourceMissing;

export class GetPlanSource {
  private readonly deps: GetPlanSourceDependencies;

  constructor(deps: GetPlanSourceDependencies) {
    this.deps = deps;
  }

  // RF-614, RF-1105
  async execute(request: GetPlanSourceRequest): Promise<Result<PlanSource, PlanSourceProblem>> {
    const { userId } = request.actor;
    if ((await this.deps.projects.find(userId, request.projectId)) === undefined) {
      return err(ERROR_CODES.notFound);
    }
    const owner = { userId, projectId: request.projectId };
    const found = await planSourceRun(this.deps.runs, owner, request.runId);
    if (!found.ok) return err(found.error);
    const run = found.value;
    const cards = await this.deps.cards.cardsOf(scopeOf(run));
    const supported = supportedCards(cards);
    const supportedClaims = supported.reduce((sum, card) => sum + card.claims.length, 0);
    if (supportedClaims === 0) return err(ERROR_CODES.planSourceMissing);
    const newest = await planSourceRun(this.deps.runs, owner);
    return ok({
      ...{ runId: run.id, runKey: run.runKey, endedAt: run.endedAt },
      areas: [...new Set(supported.map((card) => card.area))].sort(byCodeUnit),
      supportedClaims,
      newest: newest.ok && newest.value.id === run.id,
    });
  }
}
