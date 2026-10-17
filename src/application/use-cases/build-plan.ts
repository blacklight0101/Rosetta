import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { AnswersFile } from '../ports/answers-file.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { HandoffWriter } from '../ports/handoff-writer.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderSetFactory } from '../ports/provider-set-factory.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunExecution, RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { RunSinkDependencies } from '../understand/run-sinks.js';

// RF-601..RF-604: the executor of the `plan` stage (not built yet).

export interface BuildPlanDependencies extends RunSinkDependencies {
  readonly projects: ProjectRepository;
  readonly briefs: PlanningBriefStore;
  readonly cards: RunCards;
  readonly answers: Pick<AnswersFile, 'questionsOf'>;
  readonly users: UserRepository;
  readonly providers: ProviderSetFactory;
  readonly handoff: HandoffWriter;
  readonly costReports: CostReportWriter;
  readonly catalogue: () => Promise<Catalogue>;
  readonly prompt: () => Promise<PromptFile>;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
}

export class BuildPlan implements RunExecutor {
  readonly deps: BuildPlanDependencies;

  constructor(deps: BuildPlanDependencies) {
    this.deps = deps;
  }

  // RF-604
  readonly execute: (execution: RunExecution) => Promise<RunOutcome> = () =>
    Promise.resolve({ endState: 'Failed', errorCode: ERROR_CODES.unexpected });
}
