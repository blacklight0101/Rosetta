import { z } from 'zod';
import type {
  InstalledModels,
  InstalledModelsResult,
} from '../../../application/ports/installed-models.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { refuseRealProviderInTests } from '../real-provider-guard.js';
import { exchange } from './ollama-http.js';
import { trainedContextOf } from './ollama-wire.js';

// RF-405, DEC-156, ADR-006: the models installed on the Ollama server, from `GET /api/tags`. The
// server is the one `ROSETTA_OLLAMA_URL` names (DEC-112) and the caller cannot change it. The call
// has a short timeout and never throws: a server that is not configured, is down, is slow or sends
// something unreadable gives a reason, and the page falls back to the text field. Each model is
// then asked for its trained context (`POST /api/show`, Q-44), with the same timeout; a model whose
// answer fails or names none is listed without one.

export interface OllamaTagsOptions {
  /** `ROSETTA_OLLAMA_URL`, the only source of the address. */
  readonly baseUrl: string | undefined;
  /** `ROSETTA_TEST=1`: only a registered fake server is called (RNF-005, ADR-008). */
  readonly testMode: boolean;
  /** The most the call may take. */
  readonly timeoutMs: number;
}

/** The models whose /api/show is asked; the rest are listed without a trained context. */
const MAX_SHOWN = 50;

/** A server with this many models is a mistake or an attack; the rest are not read. */
const MAX_MODELS = 500;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_SHOW_BYTES = 4 * 1024 * 1024;

const tagsSchema = z.object({ models: z.array(z.object({ name: z.string().min(1).max(200) })) });

const reasons = {
  notConfigured: 'No Ollama server is configured.',
  slow: 'Ollama did not answer in time.',
  unreachable: 'Ollama could not be reached.',
  unreadable: 'Ollama sent an answer Rosetta cannot read.',
} as const;

function failed(reason: string): InstalledModelsResult {
  return { ok: false, reason };
}

function refusedInTests(options: OllamaTagsOptions, baseUrl: string): boolean {
  try {
    refuseRealProviderInTests({ testMode: options.testMode, baseUrl });
    return false;
  } catch (error) {
    if (error instanceof RosettaError) return true;
    throw error;
  }
}

export class OllamaInstalledModels implements InstalledModels {
  private readonly options: OllamaTagsOptions;

  constructor(options: OllamaTagsOptions) {
    this.options = options;
  }

  async list(): Promise<InstalledModelsResult> {
    const { baseUrl, timeoutMs } = this.options;
    if (baseUrl === undefined) return failed(reasons.notConfigured);
    if (refusedInTests(this.options, baseUrl)) return failed(reasons.unreachable);
    const result = await exchange({
      url: new URL('/api/tags', baseUrl),
      model: '',
      timeoutMs,
      signal: new AbortController().signal,
      maxBodyBytes: MAX_BODY_BYTES,
    });
    if (!result.ok) {
      const timedOut = result.failed.failure.code === ERROR_CODES.providerTimeout;
      return failed(timedOut ? reasons.slow : reasons.unreachable);
    }
    const parsed = tagsSchema.safeParse(result.body);
    if (!parsed.success) return failed(reasons.unreadable);
    const models = parsed.data.models.slice(0, MAX_MODELS).map((m) => m.name);
    const trained = await this.trainedContexts(baseUrl, models.slice(0, MAX_SHOWN));
    return Object.keys(trained).length === 0
      ? { ok: true, models }
      : { ok: true, models, trainedContexts: trained };
  }

  /** Q-44: each model's trained context from /api/show; a call that fails leaves the model out. */
  private async trainedContexts(
    baseUrl: string,
    models: readonly string[],
  ): Promise<Record<string, number>> {
    const answers = await Promise.all(
      models.map(async (model) => {
        const result = await exchange({
          url: new URL('/api/show', baseUrl),
          model,
          body: { model },
          timeoutMs: this.options.timeoutMs,
          signal: new AbortController().signal,
          maxBodyBytes: MAX_SHOW_BYTES,
        });
        return result.ok ? ([model, trainedContextOf(result.body)] as const) : undefined;
      }),
    );
    const trained: Record<string, number> = {};
    for (const answer of answers) {
      if (answer?.[1].ok === true && answer[1].trained !== undefined) {
        trained[answer[0]] = answer[1].trained;
      }
    }
    return trained;
  }
}
