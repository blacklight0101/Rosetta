import { Anthropic } from '@anthropic-ai/sdk';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { defaultMaxResponseBytes, ResponseTooLargeError } from '../capped-response.js';
import { idleSignal, type IdleSignal } from '../idle-signal.js';
import { refuseRealProviderInTests } from '../real-provider-guard.js';
import { meteredIfTimedOut } from '../timeout-usage.js';
import { completeWithRetries, type AttemptResult, type Sleep } from '../retrying-call.js';
import { failedThrown } from './anthropic-errors.js';
import { anthropicFetch, type FetchLike } from './anthropic-fetch.js';
import { isStreamed, messageBody } from './anthropic-request.js';
import { llmResponseOf } from './anthropic-response.js';
import { streamedMessage } from './anthropic-stream.js';

export interface AnthropicProviderOptions {
  /**
   * The key the provider set chose for this run (P1-29): the user's key or the server key. The
   * adapter never reads a key, URL or header from the environment.
   */
  readonly apiKey: string;
  /** The API base URL; `https://api.anthropic.com` when not set. */
  readonly baseUrl?: string;
  /** `providers.<name>.timeoutSeconds`, per attempt. */
  readonly timeoutSeconds: number;
  /** `providers.<name>.maxRetries` (RF-406). */
  readonly maxRetries: number;
  /** `ROSETTA_TEST=1`: real Anthropic calls are refused (RNF-005, ADR-008). */
  readonly testMode: boolean;
  /** The size limit of one answer; 8 MiB when not set. */
  readonly maxResponseBytes?: number;
  readonly sleep?: Sleep;
  /** The `fetch` to use; the global one when not set. A test replays a recorded stream through it. */
  readonly fetch?: FetchLike;
  /** A random number in [0, 1) for the back-off jitter. */
  readonly random?: () => number;
}

const defaultBaseUrl = 'https://api.anthropic.com';

/**
 * A key is one run of visible Latin-1 characters: a pasted newline or space, or a character above
 * U+00FF, would make the HTTP header fail (a permanent error that retrying cannot fix).
 */
function isUsableKey(key: string): boolean {
  if (key === '') return false;
  for (const char of key) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 32 || (code >= 127 && code <= 160) || code > 255) return false;
  }
  return true;
}

/** An answer Rosetta cannot use: not retried, since the same call would get it again. */
function unusable(message: string): AttemptResult {
  const failure = { code: ERROR_CODES.providerCallFailed, httpStatus: 200 };
  return { ok: false, failed: { failure, retryable: false, message } };
}

// RF-404, RF-406, ADR-003: the Anthropic adapter. It calls the Messages API through the
// `@anthropic-ai/sdk` package with the SDK's own retries off, so every attempt passes the shared
// retry loop and the attempt observer; each attempt has a timeout and the caller's abort signal.
export class AnthropicProvider implements LlmProvider {
  private readonly options: AnthropicProviderOptions;
  private readonly baseUrl: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    if (!isUsableKey(options.apiKey)) {
      // The message never holds the key: not even a part of it (RNF-003).
      throw new RosettaError(
        ERROR_CODES.anthropicKeyRejected,
        'The Anthropic API key is empty or holds spaces, control characters or characters above U+00FF.',
      );
    }
    this.options = options;
    this.baseUrl = options.baseUrl ?? defaultBaseUrl;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      authToken: null,
      webhookKey: null,
      baseURL: this.baseUrl,
      maxRetries: 0,
      timeout: options.timeoutSeconds * 1000,
      logLevel: 'off',
      fetch: anthropicFetch(options.maxResponseBytes ?? defaultMaxResponseBytes, options.fetch),
    });
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const { testMode, maxRetries, sleep, random } = this.options;
    refuseRealProviderInTests({ testMode, baseUrl: this.baseUrl });
    const { maxOutputTokens } = request;
    if (maxOutputTokens === undefined) {
      // Anthropic needs max_tokens, and a call without a limit cannot be capped (RF-422).
      throw new RosettaError(ERROR_CODES.outputLimitMissing);
    }
    return completeWithRetries({
      attempt: () => this.attempt(request, maxOutputTokens),
      signal: request.signal,
      policy: { maxRetries, sleep, random },
      observer,
    });
  }

  // Q-60: the timeout of an attempt is the time without a new token when the answer streams, and the
  // whole attempt when it does not.
  private async attempt(request: LlmRequest, maxTokens: number): Promise<AttemptResult> {
    const idle = idleSignal(request.signal, this.options.timeoutSeconds * 1000);
    const received = { text: '' };
    try {
      return await this.read(request, maxTokens, { idle, received });
    } catch (error) {
      if (error instanceof ResponseTooLargeError) return unusable(error.message);
      const context = { cancelled: request.signal.aborted, timedOut: idle.timedOut() };
      const failed = failedThrown(error, context, request.model);
      return { ok: false, failed: meteredIfTimedOut(failed, { request, received: received.text }) };
    } finally {
      idle.stop();
    }
  }

  private async read(
    request: LlmRequest,
    maxTokens: number,
    watch: { readonly idle: IdleSignal; readonly received: { text: string } },
  ): Promise<AttemptResult> {
    const { idle, received } = watch;
    const body = messageBody(request, maxTokens);
    let answer: unknown;
    let requestId: string | undefined;
    if (isStreamed(maxTokens)) {
      const onText = (text: string): void => {
        received.text += text;
      };
      const call = { body, signal: idle.signal, onEvent: idle.touch, onText };
      ({ message: answer, requestId } = await streamedMessage(this.client, call));
    } else {
      const response = await this.client.messages
        .create(body, { signal: idle.signal })
        .asResponse();
      requestId = response.headers.get('request-id') ?? undefined;
      answer = await jsonOf(response);
    }
    const parsed = llmResponseOf(answer, { request, requestId });
    if (parsed === undefined) return unusable('Anthropic sent an answer Rosetta cannot read.');
    return { ok: true, response: parsed };
  }
}

/** The JSON body, or the text when it is not JSON (the schema then refuses it). */
async function jsonOf(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
}
