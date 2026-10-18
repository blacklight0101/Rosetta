import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PlanOptions } from '../../domain/planning/plan-options.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderSetFactory, ProviderSinks } from '../ports/provider-set-factory.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { TimeoutSignals } from '../ports/timeout-signals.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-608, RF-609, RF-143, ADR-003, ADR-007: Plan setup asks Rosetta for its options. From the
// project's newest completed understand run (its verified cards) and newest completed scan (its code
// map) the `planner` role proposes two architecture styles and two options per stack layer
// (`recommendPlanOptions`). The call belongs to no run: it goes through the provider factory like
// every model call, so it is masked and capped, and the ledger books it to the project at stage
// `plan` with no run, the way the Test button of the settings page books its calls (RF-407). It
// carries the consent the person gave on the page, because the cards and the scan summary leave
// this machine for a cloud provider.

export interface SuggestPlanOptionsDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly cards: RunCards;
  readonly scans: ScanResults;
  readonly users: UserRepository;
  readonly providers: ProviderSetFactory;
  /** Where the records of the call go: it has no run folder, so they are not kept. */
  readonly unrecorded: Pick<ProviderSinks, 'recorder' | 'egressLog' | 'security'>;
  readonly catalogue: () => Promise<Catalogue>;
  /** `planner/options.v<n>.md`. */
  readonly prompt: () => Promise<PromptFile>;
  readonly ids: Pick<IdGenerator, 'uuid' | 'dataBlockTag'>;
  readonly logger: Logger;
  /** A call that has not answered by then is cancelled. */
  readonly signals: TimeoutSignals;
}

export interface SuggestPlanOptionsRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** RF-143: the person's consent to send the cards and the scan summary to a cloud provider. */
  readonly cloudConsent: boolean;
}

export class SuggestPlanOptions {
  private readonly deps: SuggestPlanOptionsDependencies;

  constructor(deps: SuggestPlanOptionsDependencies) {
    this.deps = deps;
  }

  // RF-608, RF-609, RF-1105
  async execute(request: SuggestPlanOptionsRequest): Promise<Result<PlanOptions, ErrorCode>> {
    const project = await this.deps.projects.find(request.actor.userId, request.projectId);
    return err(project === undefined ? ERROR_CODES.notFound : ERROR_CODES.planSourceMissing);
  }
}
