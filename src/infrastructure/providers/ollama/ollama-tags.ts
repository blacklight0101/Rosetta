import type {
  InstalledModels,
  InstalledModelsResult,
} from '../../../application/ports/installed-models.js';

// RF-405, DEC-156: the models installed on the Ollama server (`GET /api/tags`).

export interface OllamaTagsOptions {
  readonly baseUrl: string | undefined;
  readonly testMode: boolean;
  readonly timeoutMs: number;
}

export class OllamaInstalledModels implements InstalledModels {
  readonly options: OllamaTagsOptions;

  constructor(options: OllamaTagsOptions) {
    this.options = options;
  }

  list(): Promise<InstalledModelsResult> {
    return Promise.resolve({ ok: false, reason: '' });
  }
}
