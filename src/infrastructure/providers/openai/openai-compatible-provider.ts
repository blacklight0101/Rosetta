import { OpenAI } from 'openai';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../application/ports/llm-provider.js';
import { isUsableKeyValue } from '../../../domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { refuseRealProviderInTests } from '../real-provider-guard.js';
import { completeWithRetries, type AttemptResult, type Sleep } from '../retrying-call.js';
import { meteredIfTimedOut } from '../timeout-usage.js';
import type { FetchLike } from './agent-fetch.js';
import { compatibleFailure } from './openai-compatible-errors.js';
import { chatCompletionBody } from './openai-request.js';
import { llmResponseOf } from './openai-response.js';

export interface OpenAiCompatibleProviderOptions {
  /** The user's key for the service (RF-1104); there is no server key for this kind. */
  readonly apiKey: string;
  /** The base URL stored with that key, for example `https://openrouter.ai/api/v1`. */
  readonly baseUrl: string;
  /** `providers.<name>.timeoutSeconds`, per attempt. */
  readonly timeoutSeconds: number;
  /** `providers.<name>.maxRetries` (RF-406). */
  readonly maxRetries: number;
  /** `ROSETTA_TEST=1`: only a registered loopback fake server is called (RNF-005, ADR-008). */
  readonly testMode: boolean;
  /**
   * How every request reaches the service. The adapter builder passes `publicAddressFetch` on a
   * PublicAddressAgent (RF-1104, DEC-112); only tests pass a plain transport, to a loopback fake.
   */
  readonly transport: FetchLike;
  readonly sleep?: Sleep;
  /** A random number in [0, 1) for the back-off jitter. */
  readonly random?: () => number;
}

/** RF-1104 key rule, and every character fits in an HTTP header (U+00FF at most). */
function isSendableKey(key: string): boolean {
  return (
    isUsableKeyValue(key) && Array.from(key).every((char) => (char.codePointAt(0) ?? 0) <= 255)
  );
}

/** Scheme, host, port and path only: no user name, password, query or fragment (RF-1104). */
function isPlainBaseUrl(text: string): boolean {
  if (!URL.canParse(text)) return false;
  const url = new URL(text);
  const scheme = url.protocol === 'https:' || url.protocol === 'http:';
  const parts = url.username + url.password + url.search + url.hash;
  return scheme && url.hostname !== '' && parts === '' && !/[?#]$/u.test(text);
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

// RF-403, RF-406, RF-1104, ADR-003: the adapter for any service that speaks OpenAI's Chat
// Completions API at a base URL of the user's choice (OpenRouter, Groq, DeepSeek, Gemini's
// compatible endpoint). It sends and reads the same wire shapes as the OpenAI adapter through the
// `openai` package with its retries off and its environment defaults pinned; every request goes
// through the transport it is given, which the adapter builder builds on the public-address agent.
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly options: OpenAiCompatibleProviderOptions;
  private readonly client: OpenAI;

  constructor(options: OpenAiCompatibleProviderOptions) {
    if (!isSendableKey(options.apiKey)) {
      // The message never holds the key: not even a part of it (RNF-003).
      throw new RosettaError(
        ERROR_CODES.openAiKeyRejected,
        'The OpenAI-compatible API key must be 16 to 512 visible characters up to U+00FF.',
      );
    }
    if (!isPlainBaseUrl(options.baseUrl)) {
      throw new RosettaError(
        ERROR_CODES.baseUrlRejected,
        'The base URL of the OpenAI-compatible service must have no user name, password, query or fragment.',
      );
    }
    this.options = options;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      adminAPIKey: null,
      organization: null,
      project: null,
      webhookSecret: null,
      baseURL: options.baseUrl,
      maxRetries: 0,
      timeout: options.timeoutSeconds * 1000,
      logLevel: 'off',
      fetch: options.transport,
    });
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const { testMode, baseUrl, maxRetries, sleep, random } = this.options;
    refuseRealProviderInTests({ testMode, baseUrl });
    return completeWithRetries({
      attempt: () => this.attempt(request),
      signal: request.signal,
      policy: { maxRetries, sleep, random },
      observer,
    });
  }

  private async attempt(request: LlmRequest): Promise<AttemptResult> {
    const timeout = AbortSignal.timeout(this.options.timeoutSeconds * 1000);
    const signal = AbortSignal.any([request.signal, timeout]);
    try {
      const response = await this.client.chat.completions
        .create(chatCompletionBody(request), { signal })
        .asResponse();
      const requestId = response.headers.get('x-request-id') ?? undefined;
      const answer = llmResponseOf(await jsonOf(response), { request, requestId });
      if (answer === undefined) {
        const failure = { code: ERROR_CODES.providerCallFailed, httpStatus: response.status };
        const message = 'The OpenAI-compatible service sent an answer Rosetta cannot read.';
        return { ok: false, failed: { failure, retryable: false, message } };
      }
      return { ok: true, response: answer };
    } catch (error) {
      const context = { cancelled: request.signal.aborted, timedOut: timeout.aborted };
      const failed = compatibleFailure(error, context, request.model);
      // Q-60: the answer is not streamed, so a timed-out attempt received no text.
      return { ok: false, failed: meteredIfTimedOut(failed, { request, received: '' }) };
    }
  }
}
