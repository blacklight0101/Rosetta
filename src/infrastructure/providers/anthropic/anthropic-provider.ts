import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type { Sleep } from '../retrying-call.js';

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
  readonly testMode: boolean;
  readonly fakeServer?: boolean;
  readonly maxResponseBytes?: number;
  readonly sleep?: Sleep;
  readonly random?: () => number;
}

// RF-404: not built yet (the test commit of P2-09).
export class AnthropicProvider implements LlmProvider {
  readonly options: AnthropicProviderOptions;

  constructor(options: AnthropicProviderOptions) {
    this.options = options;
  }

  complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    observer?.attemptStarted();
    const message = `The Anthropic adapter is not built yet (${request.model}).`;
    return Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed, message));
  }
}
