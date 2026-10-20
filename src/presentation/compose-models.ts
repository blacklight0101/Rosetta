import { fileURLToPath } from 'node:url';
import type { PriceTable } from '../domain/budget/price-table.js';
import { ListModels } from '../application/use-cases/list-models.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { loadModelList } from '../infrastructure/models/model-list-file.js';
import { OllamaInstalledModels } from '../infrastructure/providers/ollama/ollama-tags.js';
import type { ModelServices } from './web/model-routes.js';

// Architecture section 2 (composition root), RF-405, DEC-156, ADR-006: the list of models a role
// can be set to. The shipped list (`prices/models.yaml`) is loaded at start-up, next to the price
// table: a missing or invalid file stops the server instead of showing a wrong list. The Ollama
// server asked for its installed models is the one `ROSETTA_OLLAMA_URL` names, and no other. This
// file is at the same depth in `src/` and in the built `dist/`, so `../../` is the repository root.
const modelsFile = fileURLToPath(new URL('../../prices/models.yaml', import.meta.url));

/** How long the page waits for Ollama's list of installed models. */
const OLLAMA_TAGS_TIMEOUT_MS = 3000;

export interface ModelParts {
  readonly environment: Pick<Environment, 'ollamaUrl' | 'test'>;
  readonly priceTable: PriceTable;
}

// RF-405
export async function composeModels(parts: ModelParts): Promise<ModelServices> {
  const { environment, priceTable } = parts;
  return {
    listModels: new ListModels({
      list: await loadModelList(modelsFile),
      prices: priceTable,
      installed: new OllamaInstalledModels({
        baseUrl: environment.ollamaUrl,
        testMode: environment.test,
        timeoutMs: OLLAMA_TAGS_TIMEOUT_MS,
      }),
    }),
  };
}
