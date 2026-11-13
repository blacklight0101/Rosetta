import type { Logger } from '../../application/ports/logger.js';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { LedgerLimits } from '../../application/lab/spend-ledger.js';
import type { ModelList } from '../../application/models/model-list.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import type { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import type { ServerKeys } from '../../infrastructure/providers/provider-access.js';
import type { GuardedFactoryMaker } from '../compose-providers.js';

// Architecture section 2 (composition root), RF-1400, ADR-003, ADR-007, ADR-029: one lab invocation.

export interface LabParts {
  /** The git-ignored `lab-out/`: results folders and the shared ledger. */
  readonly outputDir: string;
  readonly promptsFolder: string;
  readonly providers: GuardedFactoryMaker;
  readonly serverKeys: ServerKeys;
  readonly ollamaUrl: string | undefined;
  readonly priceTable: PriceTable;
  readonly models: ModelList;
  readonly settings: ProjectSettings;
  readonly limits: LedgerLimits;
  readonly rosettaVersion: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly masker: SecretMasker;
}
