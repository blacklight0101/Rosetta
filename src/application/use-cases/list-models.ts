import type { ModelList } from '../models/model-list.js';
import type { InstalledModels } from '../ports/installed-models.js';
import type { PriceTable } from '../../domain/budget/price-table.js';

// RF-405, DEC-156: the models a role of a provider can be set to.

export interface ModelChoice {
  readonly model: string;
  readonly label: string;
  /** False when the price table has no price for the model (RF-427). */
  readonly priced: boolean;
}

export interface ModelChoices {
  readonly provider: string;
  readonly models: readonly ModelChoice[];
  /** Set when Ollama could not be asked: why, as a sentence. */
  readonly reason?: string;
}

export interface ListModelsDependencies {
  readonly list: ModelList;
  readonly prices: PriceTable;
  readonly installed: InstalledModels;
}

export class ListModels {
  readonly dependencies: ListModelsDependencies;

  constructor(dependencies: ListModelsDependencies) {
    this.dependencies = dependencies;
  }

  execute(provider: string): Promise<ModelChoices> {
    return Promise.resolve({ provider, models: [] });
  }
}
