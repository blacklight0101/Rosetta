import { OpenAI } from 'openai';
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
import { requestWaitMs } from '../prompt-wait.js';
import { refuseRealProviderInTests } from '../real-provider-guard.js';
import { meteredIfTimedOut } from '../timeout-usage.js';
import { completeWithRetries, type AttemptResult, type Sleep } from '../retrying-call.js';
import { failedThrown } from './openai-errors.js';
import { openAiFetch, type FetchLike } from './openai-fetch.js';
import { chatCompletionBody, chatCompletionStreamBody, isStreamed } from './openai-request.js';
import { llmResponseOf } from './openai-response.js';
import { streamedCompletion } from './openai-stream.js';

export interface OpenAiProviderOptions {
  /**
   * The key the provider set chose for this run (P1-29): the user's key or the server key. The
   * adapter never reads a key, URL or header from the environment.
   */
  readonly apiKey: string;
  /** The API base URL; `https://api.openai.com/v1` when not set. */
  readonly baseUrl?: string;
  /** `providers.<name>.timeoutSeconds`, per attempt. */
  readonly timeoutSeconds: number;
  /** `providers.<name>.maxRetries` (RF-406). */
  readonly maxRetries: number;
  /** `ROSETTA_TEST=1`: real OpenAI calls are refused (RNF-005, ADR-008). */
  readonly testMode: boolean;
  /** The size limit of one answer; 8 MiB when not set. */
  readonly maxResponseBytes?: number;
  /** P3-131: whether a model's calls with tools go to `/v1/responses`; none do when not set. */
  readonly usesResponses?: (model: string) => boolean;
  readonly sleep?: Sleep;
  /** The `fetch` to use; the global one when not set. A test replays a recorded stream through it. */
  readonly fetch?: FetchLike;
  /** A random number in [0, 1) for the back-off jitter. */
  readonly random?: () => number;
}

const defaultBaseUrl = 'https://api.openai.com/v1';

/**
 * A key is one run of visible Latin-1 characters: a pasted newline or space would break the
 * header, and a character above U+00FF cannot be sent in one, so the SDK would fail every attempt.
 */
function isUsableKey(key: string): boolean {
  if (key === '') return false;
  for (const char of key) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 32 || (code >= 127 && code <= 160) || code > 255) return false;
  }
  return true;
}

function unusable(httpStatus: number, message: string, cause?: unknown): AttemptResult {
  const failure = { code: ERROR_CODES.providerCallFailed, httpStatus };
  return { ok: false, failed: { failure, retryable: false, message, cause } };
}

// RF-402, RF-406, ADR-003: the OpenAI adapter. It calls the Chat Completions API through the
// `openai` package with the SDK's own retries off, so every attempt passes the shared retry loop
// and the attempt observer; each attempt has a timeout and the caller's abort signal.
export class OpenAiProvider implements LlmProvider {
  private readonly options: OpenAiProviderOptions;
  private readonly baseUrl: string;
  private readonly client: OpenAI;

  constructor(options: OpenAiProviderOptions) {
    if (!isUsableKey(options.apiKey)) {
      // The message never holds the key: not even a part of it (RNF-003).
      throw new RosettaError(
        ERROR_CODES.openAiKeyRejected,
        'The OpenAI API key is empty or holds spaces, control characters or characters above U+00FF.',
      );
    }
    this.options = options;
    this.baseUrl = options.baseUrl ?? defaultBaseUrl;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      adminAPIKey: null,
      organization: null,
      project: null,
      webhookSecret: null,
      baseURL: this.baseUrl,
      maxRetries: 0,
      timeout: options.timeoutSeconds * 1000,
      logLevel: 'off',
      fetch: openAiFetch(options.maxResponseBytes ?? defaultMaxResponseBytes, options.fetch),
    });
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const { testMode, maxRetries, sleep, random } = this.options;
    refuseRealProviderInTests({ testMode, baseUrl: this.baseUrl });
    return completeWithRetries({
      attempt: () => this.attempt(request),
      signal: request.signal,
      policy: { maxRetries, sleep, random },
      observer,
    });
  }

  // Q-60: the timeout of an attempt is the time without a new token when the answer streams, and the
  // whole attempt when it does not.
  private async attempt(request: LlmRequest): Promise<AttemptResult> {
    const idleMs = this.options.timeoutSeconds * 1000;
    const idle = idleSignal(request.signal, idleMs, requestWaitMs(idleMs, request));
    const received = { text: '' };
    try {
      return await this.read(request, { idle, received });
    } catch (error) {
      if (error instanceof ResponseTooLargeError) return unusable(200, error.message);
      const context = { cancelled: request.signal.aborted, timedOut: idle.timedOut() };
      const failed = failedThrown(error, context, request.model);
      return { ok: false, failed: meteredIfTimedOut(failed, { request, received: received.text }) };
    } finally {
      idle.stop();
    }
  }

  private async read(
    request: LlmRequest,
    watch: { readonly idle: IdleSignal; readonly received: { text: string } },
  ): Promise<AttemptResult> {
    const { idle, received } = watch;
    let answer: unknown;
    let requestId: string | undefined;
    if (isStreamed(request)) {
      const onText = (text: string): void => {
        received.text += text;
      };
      const call = { body: chatCompletionStreamBody(request), signal: idle.signal };
      ({ completion: answer, requestId } = await streamedCompletion(this.client, {
        ...call,
        onEvent: idle.touch,
        onText,
      }));
    } else {
      const response = await this.client.chat.completions
        .create(chatCompletionBody(request), { signal: idle.signal })
        .asResponse();
      requestId = response.headers.get('x-request-id') ?? undefined;
      answer = await jsonOf(response);
    }
    const parsed = llmResponseOf(answer, { request, requestId });
    if (parsed === undefined) return unusable(200, 'OpenAI sent an answer Rosetta cannot read.');
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
