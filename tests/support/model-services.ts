import type { ModelList } from '../../src/application/models/model-list.js';
import type {
  InstalledModels,
  InstalledModelsResult,
} from '../../src/application/ports/installed-models.js';
import { ListModels } from '../../src/application/use-cases/list-models.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import type { ModelServices } from '../../src/presentation/web/model-routes.js';

// RF-405, DEC-156: the list of models of a test server, over a small model list, a small price
// table and a fake Ollama answer. No server is asked and nothing is read from disk.

export const testModelList: ModelList = {
  version: '2026-10-20',
  models: [
    { provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { provider: 'openai', model: 'gpt-5-nano', label: 'GPT-5 nano' },
    { provider: 'openai', model: 'gpt-5-future', label: 'GPT-5 future' },
  ],
};

/** Prices `gpt-5-nano` only, so every other listed model shows "no price". */
export const testModelPrices: PriceTable = {
  version: '2026-10-20',
  currency: 'USD',
  prices: [
    {
      provider: 'openai',
      model: 'gpt-5-nano',
      inputPerMillionMicros: 50_000n,
      outputPerMillionMicros: 400_000n,
      cachedInputPerMillionMicros: 5_000n,
      cacheWriteInputPerMillionMicros: 50_000n,
      currency: 'USD',
    },
  ],
};

/** An Ollama server that answers with a fixed result and counts the questions it was asked. */
export class FakeInstalledModels implements InstalledModels {
  asked = 0;
  private readonly result: InstalledModelsResult;

  constructor(result: InstalledModelsResult = { ok: true, models: [] }) {
    this.result = result;
  }

  list(): Promise<InstalledModelsResult> {
    this.asked += 1;
    return Promise.resolve(this.result);
  }
}

export function modelServices(
  installed: InstalledModels = new FakeInstalledModels(),
): ModelServices {
  return {
    listModels: new ListModels({ list: testModelList, prices: testModelPrices, installed }),
  };
}
