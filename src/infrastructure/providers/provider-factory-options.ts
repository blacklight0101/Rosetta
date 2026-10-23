import type { ModelList } from '../../application/models/model-list.js';
import type {
  ReasoningModels,
  ResponsesModels,
  ToolLessModels,
} from '../../application/models/model-list.js';
import type { AccountUsage } from '../../application/ports/account-usage.js';
import type { Clock } from '../../application/ports/clock.js';
import type { CostLedger } from '../../application/ports/cost-ledger.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { Logger } from '../../application/ports/logger.js';
import type { ProviderKeyRepository } from '../../application/ports/provider-key-repository.js';
import type { SecretBox } from '../../application/ports/secret-box.js';
import type { ServerSettings } from '../../application/ports/server-settings.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import type { TextMasker } from '../guards/secret-masker.js';
import type { AdapterBuilder } from './adapter-spec.js';
import type { ServerKeys } from './provider-access.js';

// ADR-003, RF-405: what the guarded provider factory is built from (split from provider-factory.ts).
export interface GuardedProviderFactoryOptions {
  readonly keys: ProviderKeyRepository;
  /** Opens the user's sealed keys; the only decryption of a key in the system. */
  readonly box: SecretBox;
  readonly serverKeys: ServerKeys;
  readonly ollamaUrl: string | undefined;
  readonly serverSettings: ServerSettings;
  readonly ledger: CostLedger;
  /** P5-18: read at run start so readers stop at a share of the scope caps' room (RF-429). */
  readonly usage?: Pick<AccountUsage, 'userDay' | 'serverMonth'>;
  /** The shipped price table, loaded at start-up (RF-420). */
  readonly priceTable: PriceTable;
  /** The shipped model list: each model's context window and maximum output (Q-57). */
  readonly models: ModelList;
  readonly masker: TextMasker;
  readonly adapters: AdapterBuilder;
  /** Q-58: the models the shipped list marks as reasoning models; none when left out. */
  readonly reasoningModels?: ReasoningModels;
  /** P3-130: the models the shipped list marks as unable to call tools; none when left out. */
  readonly toolLessModels?: ToolLessModels;
  /** P3-131: the models the shipped list routes through the Responses API; none when left out. */
  readonly responsesModels?: ResponsesModels;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}
