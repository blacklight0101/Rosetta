import { exchange, type ExchangeResult } from './ollama-http.js';
import type { ContextProbe, ModelRef, ProbeResult, Residency } from './ollama-context-resolver.js';
import { residencyOf, trainedContextOf } from './ollama-wire.js';

// RF-401, DEC-114: the three Ollama calls the context-size resolver makes. A model is loaded with
// `POST /api/generate` without a prompt: Ollama only loads it (`done_reason: load`), evaluates no
// token, and keeps it loaded for its own keep-alive, so the chat call that follows at the same
// `num_ctx` finds it ready. No `keep_alive` is sent, so the server's own setting applies.

export interface HttpContextProbeOptions {
  /** `ROSETTA_OLLAMA_URL` (DEC-112). */
  readonly baseUrl: string;
  /** Per probe call; a cold load of a large model takes as long as a chat call's first load. */
  readonly timeoutMs: number;
}

/** /api/show and /api/ps answers are small; a model's metadata stays well under this. */
const maxProbeBodyBytes = 4 * 1024 * 1024;

function reasonOf(result: Extract<ExchangeResult, { ok: false }>): string {
  const { failure } = result.failed;
  const status = failure.httpStatus === undefined ? '' : ` HTTP ${String(failure.httpStatus)}`;
  return `${failure.code}${status}`;
}

export class HttpContextProbe implements ContextProbe {
  private readonly options: HttpContextProbeOptions;

  constructor(options: HttpContextProbeOptions) {
    this.options = options;
  }

  async trainedContext(model: string): Promise<ProbeResult<number | undefined>> {
    const result = await this.call('/api/show', model, { model });
    if (!result.ok) return { ok: false, reason: `/api/show failed: ${reasonOf(result)}` };
    const show = trainedContextOf(result.body);
    if (!show.ok) return { ok: false, reason: '/api/show sent an answer Rosetta cannot read' };
    return { ok: true, value: show.trained };
  }

  async load(model: string, tokens: number): Promise<ProbeResult<undefined>> {
    const body = { model, stream: false, options: { num_ctx: tokens } };
    const result = await this.call('/api/generate', model, body);
    if (!result.ok) return { ok: false, reason: `loading the model failed: ${reasonOf(result)}` };
    return { ok: true, value: undefined };
  }

  async residency(ref: ModelRef): Promise<ProbeResult<Residency>> {
    const result = await this.call('/api/ps', ref.model);
    if (!result.ok) return { ok: false, reason: `/api/ps failed: ${reasonOf(result)}` };
    const residency = residencyOf(result.body, ref.digest);
    if (residency === undefined) return { ok: false, reason: '/api/ps does not list the model' };
    return { ok: true, value: residency };
  }

  private call(path: string, model: string, body?: unknown): Promise<ExchangeResult> {
    return exchange({
      url: new URL(path, this.options.baseUrl),
      model,
      ...(body === undefined ? {} : { body }),
      timeoutMs: this.options.timeoutMs,
      signal: new AbortController().signal,
      maxBodyBytes: maxProbeBodyBytes,
    });
  }
}
