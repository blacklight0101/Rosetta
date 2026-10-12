import type { AnswersFile } from '../ports/answers-file.js';
import type { CardOutputs } from '../ports/card-outputs.js';
import type { Clock } from '../ports/clock.js';
import type { CostLedger } from '../ports/cost-ledger.js';
import type { CostReportWriter } from '../ports/cost-report-writer.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderSetFactory, ProviderSinks } from '../ports/provider-set-factory.js';
import type { RunScope } from '../ports/run-events.js';
import type { RunExecutor, RunOutcome } from '../ports/run-executor.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { ReaderPrompts } from '../agent/reader-prompts.js';

// RF-200, RF-240, RF-300, RF-302, RF-426, RNF-002, ADR-005, ADR-006, ADR-007: the executor of the
// `understand` stage.

export interface RunUnderstandDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly users: UserRepository;
  readonly scans: ScanResults;
  readonly providers: ProviderSetFactory;
  /** The call log and the egress log of the run folder (RF-408, RF-142). */
  readonly runSinks: (scope: RunScope) => Pick<ProviderSinks, 'recorder' | 'egressLog'>;
  readonly manifests: RunManifestStore;
  readonly cards: CardOutputs;
  readonly answers: AnswersFile;
  readonly ledger: Pick<CostLedger, 'runEntries'>;
  readonly costReports: CostReportWriter;
  /** Reads the reader's prompt files with their versions and hashes (RNF-004). */
  readonly prompts: () => Promise<ReaderPrompts>;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class RunUnderstand implements RunExecutor {
  private readonly deps: RunUnderstandDependencies;

  constructor(deps: RunUnderstandDependencies) {
    this.deps = deps;
  }

  execute(): Promise<RunOutcome> {
    return Promise.resolve({ endState: 'Failed' });
  }
}
