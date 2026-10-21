import type { PriceTable } from '../../domain/budget/price-table.js';
import { lookupPrice } from '../../domain/budget/price-table.js';
import type { ModelList } from '../models/model-list.js';
import type { InstalledModels } from '../ports/installed-models.js';

// RF-405, RF-427, DEC-156: the models a role of a provider can be set to. Anthropic and OpenAI come
// from the shipped list, each marked by whether the price table has a price for it (a model without
// one is shown as "no price", never given an invented price). Ollama comes from the models
// installed on the configured server; a server that cannot be asked gives an empty list and the
// reason. Any other provider has no list.

interface ModelChoice {
  readonly model: string;
  readonly label: string;
  /** False when the price table has no price for the model (RF-427). */
  readonly priced: boolean;
  /** Ollama only, Q-44: the context the model was trained for, when /api/show named one. */
  readonly trainedContext?: number;
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
  private readonly dependencies: ListModelsDependencies;

  constructor(dependencies: ListModelsDependencies) {
    this.dependencies = dependencies;
  }

  async execute(provider: string): Promise<ModelChoices> {
    if (provider === 'ollama') return this.installed();
    const { list, prices } = this.dependencies;
    const models = list.models
      .filter((entry) => entry.provider === provider)
      .map(({ model, label }) => ({
        model,
        label,
        priced: lookupPrice(prices, [], { provider, model, keySource: 'server' }).kind === 'priced',
      }));
    return { provider, models };
  }

  private async installed(): Promise<ModelChoices> {
    const answer = await this.dependencies.installed.list();
    if (!answer.ok) return { provider: 'ollama', models: [], reason: answer.reason };
    const names = [...new Set(answer.models)].sort();
    const trained = answer.trainedContexts ?? {};
    // A local model costs nothing, so it is never "no price" (RF-420).
    return {
      provider: 'ollama',
      models: names.map((model) => {
        const trainedContext = trained[model];
        const base = { model, label: model, priced: true };
        return trainedContext === undefined ? base : { ...base, trainedContext };
      }),
    };
  }
}
