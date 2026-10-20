import { z } from 'zod';
import type {
  InstalledModels,
  InstalledModelsResult,
} from '../../../application/ports/installed-models.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { refuseRealProviderInTests } from '../real-provider-guard.js';
import { exchange } from './ollama-http.js';

// RF-405, DEC-156, ADR-006: the models installed on the Ollama server, from `GET /api/tags`. The
// server is the one `ROSETTA_OLLAMA_URL` names (DEC-112) and the caller cannot change it. The call
// has a short timeout and never throws: a server that is not configured, is down, is slow or sends
// something unreadable gives a reason, and the page falls back to the text field.

export interface OllamaTagsOptions {
  /** `ROSETTA_OLLAMA_URL`, the only source of the address. */
  readonly baseUrl: string | undefined;
  /** `ROSETTA_TEST=1`: only a registered fake server is called (RNF-005, ADR-008). */
  readonly testMode: boolean;
  /** The most the call may take. */
  readonly timeoutMs: number;
}

/** A server with this many models is a mistake or an attack; the rest are not read. */
const MAX_MODELS = 500;
const MAX_BODY_BYTES = 1024 * 1024;

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
    return { ok: true, models: parsed.data.models.slice(0, MAX_MODELS).map((m) => m.name) };
  }
}
