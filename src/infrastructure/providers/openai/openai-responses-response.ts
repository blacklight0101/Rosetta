import type { LlmResponse } from '../../../application/ports/llm-provider.js';
import type { ResponseContext } from './openai-response.js';

// P3-131: placeholder until the Responses answer is read.
export function llmResponseOfResponses(
  body: unknown,
  context: ResponseContext,
): LlmResponse | undefined {
  throw new Error(`not implemented ${typeof body} ${context.request.model}`);
}
