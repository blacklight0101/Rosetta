import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type { Sleep } from '../retrying-call.js';
import type { FetchLike } from './agent-fetch.js';

// RF-403: placeholder of the test commit; the next commit builds the adapter.

export interface OpenAiCompatibleProviderOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
  readonly testMode: boolean;
  readonly transport: FetchLike;
  readonly sleep?: Sleep;
  readonly random?: () => number;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly options: OpenAiCompatibleProviderOptions;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.options = options;
  }

  complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    observer?.attemptStarted();
    return Promise.reject(new RosettaError(ERROR_CODES.providerUnavailable, request.model));
  }
}
