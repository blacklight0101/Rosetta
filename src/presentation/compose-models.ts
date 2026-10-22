import type { ModelList } from '../application/models/model-list.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import { ListModels } from '../application/use-cases/list-models.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { OllamaInstalledModels } from '../infrastructure/providers/ollama/ollama-tags.js';
import type { ModelServices } from './web/model-routes.js';

// Architecture section 2 (composition root), RF-405, DEC-156, ADR-006: the list of models a role
// can be set to. The shipped list (`prices/models.yaml`) is loaded at start-up, next to the price
// table, by compose-providers.ts: a missing or invalid file stops the server instead of showing a
// wrong list. The Ollama server asked for its installed models is the one `ROSETTA_OLLAMA_URL`
// names, and no other.

/** How long the page waits for Ollama's list of installed models. */
const OLLAMA_TAGS_TIMEOUT_MS = 3000;

export interface ModelParts {
  readonly environment: Pick<Environment, 'ollamaUrl' | 'test'>;
  readonly priceTable: PriceTable;
  /** The shipped list, loaded once with the price table (compose-providers.ts). */
  readonly list: ModelList;
}

// RF-405
export function composeModels(parts: ModelParts): ModelServices {
  const { environment, priceTable } = parts;
  return {
    listModels: new ListModels({
      list: parts.list,
      prices: priceTable,
      installed: new OllamaInstalledModels({
        baseUrl: environment.ollamaUrl,
        testMode: environment.test,
        timeoutMs: OLLAMA_TAGS_TIMEOUT_MS,
      }),
    }),
  };
}
