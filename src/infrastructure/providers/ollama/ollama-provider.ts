import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../application/ports/llm-provider.js';
import type { Logger } from '../../../application/ports/logger.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { refuseRealProviderInTests } from '../real-provider-guard.js';
import {
  completeWithRetries,
  type AttemptFailed,
  type AttemptResult,
  type Sleep,
} from '../retrying-call.js';
import { contextSettingOf, type ContextChoice, type ContextSetting } from './ollama-context.js';
import { HttpContextProbe } from './ollama-context-probe.js';
import {
  OllamaContextResolver,
  processContextCache,
  type ModelRef,
} from './ollama-context-resolver.js';
import { modelMissing } from './ollama-errors.js';
import { exchange } from './ollama-http.js';
import { chatBody, type ToolMode } from './ollama-request.js';
import { llmResponseOf } from './ollama-response.js';
import { digestOf, parseChat } from './ollama-wire.js';

export interface OllamaProviderOptions {
  /** `ROSETTA_OLLAMA_URL`, the only source of the Ollama URL (DEC-112). */
  readonly baseUrl: string;
  /** `providers.<name>.toolMode` (RF-205). */
  readonly toolMode: ToolMode;
  /** `providers.<name>.timeoutSeconds`, per attempt. */
  readonly timeoutSeconds: number;
  /** `providers.<name>.maxRetries` (RF-406). */
  readonly maxRetries: number;
  /** The text of prompts/shared/text-tool-protocol.v1.md (`loadTextToolProtocol(...).text`). */
  readonly textProtocolPrompt: string;
  /** `ROSETTA_TEST=1`: real Ollama calls are refused (RNF-005, ADR-008). */
  readonly testMode: boolean;
  /**
   * `providers.<name>.contextTokens` (DEC-114): `auto` (the default) or a fixed `num_ctx` of at
   * least 1024; a smaller number is refused with RST-1514.
   */
  readonly contextTokens?: ContextSetting;
  /** Receives the context-size warnings (RF-401, DEC-114). */
  readonly logger: Logger;
  /** Ollama's `think`; false when not set. */
  readonly think?: boolean;
  readonly sleep?: Sleep;
  /** A random number in [0, 1) for the back-off jitter. */
  readonly random?: () => number;
}

function cancelled(signal: AbortSignal): RosettaError {
  return new RosettaError(ERROR_CODES.providerCallCancelled, undefined, { cause: signal.reason });
}

/** `promise`, or RST-1501 as soon as `signal` aborts; the shared measurement itself goes on. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelled(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(cancelled(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

function invalidAnswer(): AttemptResult {
  const failure = { code: ERROR_CODES.providerCallFailed, httpStatus: 200 };
  const message = 'Ollama sent an answer Rosetta cannot read.';
  return { ok: false, failed: { failure, retryable: false, message } };
}

// RF-401, RF-205, RF-406, ADR-003: the Ollama adapter. It talks to Ollama's chat API over fetch
// with a timeout and the caller's abort signal, in native or text tool mode, retries temporary
// failures with back-off and reports the model digest as the exact model version (RNF-004).
export class OllamaProvider implements LlmProvider {
  private readonly options: OllamaProviderOptions;
  private readonly digests = new Map<string, string>();
  private readonly contextSetting: ContextSetting;
  private readonly contexts: OllamaContextResolver;

  constructor(options: OllamaProviderOptions) {
    this.options = options;
    this.contextSetting = contextSettingOf(options.contextTokens);
    const timeoutMs = options.timeoutSeconds * 1000;
    this.contexts = new OllamaContextResolver({
      serverUrl: options.baseUrl,
      probe: new HttpContextProbe({ baseUrl: options.baseUrl, timeoutMs }),
      logger: options.logger,
      cache: processContextCache,
    });
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const { baseUrl, testMode, maxRetries, sleep, random } = this.options;
    refuseRealProviderInTests({ testMode, baseUrl });
    return completeWithRetries({
      attempt: () => this.attempt(request),
      signal: request.signal,
      policy: { maxRetries, sleep, random },
      observer,
    });
  }

  private async attempt(request: LlmRequest): Promise<AttemptResult> {
    const digest = await this.digest(request);
    if (!digest.ok) return digest;
    const ref = { model: request.model, digest: digest.value };
    const context = await untilAborted(this.contextFor(ref), request.signal);
    const { toolMode, think, textProtocolPrompt } = this.options;
    const settings = {
      toolMode,
      think: think ?? false,
      contextTokens: context.tokens,
      textProtocolPrompt,
    };
    const result = await exchange({
      ...this.target('/api/chat', request),
      body: chatBody(request, settings),
    });
    if (!result.ok) return result;
    const chat = parseChat(result.body);
    if (chat === undefined) return invalidAnswer();
    if (context.source === 'fixed') await this.contexts.checkFixed(ref, context.tokens);
    const response = llmResponseOf(chat, {
      request,
      toolMode,
      modelVersion: digest.value,
      context,
    });
    return { ok: true, response };
  }

  /** RF-401, DEC-114: the `num_ctx` of this model, measured once when the setting is `auto`. */
  private contextFor(ref: ModelRef): Promise<ContextChoice> {
    const setting = this.contextSetting;
    if (setting === 'auto') return this.contexts.auto(ref);
    return Promise.resolve({ tokens: setting, source: 'fixed' });
  }

  /** The model digest from /api/tags, once per model; a missing model is a failure (RF-401). */
  private async digest(
    request: LlmRequest,
  ): Promise<
    | { readonly ok: true; readonly value: string }
    | { readonly ok: false; readonly failed: AttemptFailed }
  > {
    const known = this.digests.get(request.model);
    if (known !== undefined) return { ok: true, value: known };
    const result = await exchange(this.target('/api/tags', request));
    if (!result.ok) return result;
    const value = digestOf(result.body, request.model);
    if (value === undefined) return { ok: false, failed: modelMissing(request.model) };
    this.digests.set(request.model, value);
    return { ok: true, value };
  }

  private target(path: string, request: LlmRequest) {
    return {
      url: new URL(path, this.options.baseUrl),
      model: request.model,
      timeoutMs: this.options.timeoutSeconds * 1000,
      signal: request.signal,
    };
  }
}
