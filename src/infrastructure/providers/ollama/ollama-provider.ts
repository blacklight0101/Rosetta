import { setTimeout as wait } from 'node:timers/promises';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { ProviderCallError } from '../provider-call-error.js';
import { modelMissing, type AttemptFailed } from './ollama-errors.js';
import { exchange } from './ollama-http.js';
import { chatBody, type ToolMode } from './ollama-request.js';
import { llmResponseOf } from './ollama-response.js';
import { digestOf, parseChat } from './ollama-wire.js';
import { backoffDelayMs } from './retry-backoff.js';

/** Waits `ms`, rejecting when `signal` aborts. */
type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export interface OllamaProviderOptions {
  /** `ROSETTA_OLLAMA_URL`, the only source of the Ollama URL (DEC-112). */
  readonly baseUrl: string;
  /** `providers.<name>.toolMode` (RF-205). */
  readonly toolMode: ToolMode;
  /** `providers.<name>.timeoutSeconds`, per attempt. */
  readonly timeoutSeconds: number;
  /** `providers.<name>.maxRetries` (RF-406). */
  readonly maxRetries: number;
  /** The text of prompts/shared/text-tool-protocol.v1.md (loadTextToolProtocol). */
  readonly textProtocolPrompt: string;
  /** `ROSETTA_TEST=1`: real Ollama calls are refused (RNF-005, ADR-008). */
  readonly testMode: boolean;
  /** True only in tests whose base URL is a loopback fake Ollama server they started. */
  readonly fakeServer?: boolean;
  /** Ollama's `num_ctx`; 32768 when not set (an open question until a setting names it). */
  readonly contextTokens?: number;
  /** Ollama's `think`; false when not set. */
  readonly think?: boolean;
  readonly sleep?: Sleep;
  /** A random number in [0, 1) for the back-off jitter. */
  readonly random?: () => number;
}

const defaultContextTokens = 32_768;
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

type AttemptResult =
  | { readonly ok: true; readonly response: LlmResponse }
  | { readonly ok: false; readonly failed: AttemptFailed };

function cancelled(signal: AbortSignal): RosettaError {
  return new RosettaError(ERROR_CODES.providerCallCancelled, undefined, { cause: signal.reason });
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

  constructor(options: OllamaProviderOptions) {
    this.options = options;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    this.refuseInTests();
    const { maxRetries } = this.options;
    for (let retry = 0; ; retry += 1) {
      if (request.signal.aborted) throw cancelled(request.signal);
      observer?.attemptStarted();
      const result = await this.attempt(request);
      if (result.ok) return result.response;
      const { failed } = result;
      if (!failed.retryable || retry >= maxRetries) {
        throw new ProviderCallError(failed.failure, {
          cause: failed.cause,
          message: failed.message,
        });
      }
      await observer?.attemptRetried(failed.failure);
      await this.backOff(retry + 1, failed, request.signal);
    }
  }

  /** RNF-005: under ROSETTA_TEST=1 only a loopback fake server may be called. */
  private refuseInTests(): void {
    if (!this.options.testMode) return;
    const host = new URL(this.options.baseUrl).hostname;
    if (this.options.fakeServer === true && loopbackHosts.has(host)) return;
    throw new RosettaError(ERROR_CODES.realProviderRefusedInTests);
  }

  private async backOff(retry: number, failed: AttemptFailed, signal: AbortSignal): Promise<void> {
    const random = this.options.random ?? Math.random;
    const delay = backoffDelayMs({ retry, random: random(), retryAfterMs: failed.retryAfterMs });
    const sleep = this.options.sleep ?? ((ms, s) => wait(ms, undefined, { signal: s }));
    try {
      await sleep(delay, signal);
    } catch (error) {
      throw new RosettaError(ERROR_CODES.providerCallCancelled, undefined, { cause: error });
    }
  }

  private async attempt(request: LlmRequest): Promise<AttemptResult> {
    const digest = await this.digest(request);
    if (!digest.ok) return digest;
    const { toolMode, think, contextTokens, textProtocolPrompt } = this.options;
    const settings = {
      toolMode,
      think: think ?? false,
      contextTokens: contextTokens ?? defaultContextTokens,
      textProtocolPrompt,
    };
    const result = await exchange({
      ...this.target('/api/chat', request),
      body: chatBody(request, settings),
    });
    if (!result.ok) return result;
    const chat = parseChat(result.body);
    if (chat === undefined) return invalidAnswer();
    const response = llmResponseOf(chat, { request, toolMode, modelVersion: digest.value });
    return { ok: true, response };
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
