import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { ProviderCallError } from '../../src/infrastructure/providers/provider-call-error.js';

// ADR-008, RF-407: the model of the end-to-end test server. It answers every call with a short text
// and small usage, and fails the calls of the roles in `failing` with RST-1506, so a journey can
// show one role reachable and another with its error. It never touches the network.

export class AnsweringProvider implements LlmProvider {
  private readonly failing: ReadonlySet<string>;

  constructor(failing: readonly string[] = []) {
    this.failing = new Set(failing);
  }

  complete(request: LlmRequest): Promise<LlmResponse> {
    if (this.failing.has(request.context.role)) {
      return Promise.reject(new ProviderCallError({ code: ERROR_CODES.providerCallFailed }));
    }
    return Promise.resolve({
      text: 'OK',
      toolCalls: [],
      usage: { inputTokens: 24, outputTokens: 2, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'stop',
      modelVersion: 'answering-provider-1',
    });
  }
}
