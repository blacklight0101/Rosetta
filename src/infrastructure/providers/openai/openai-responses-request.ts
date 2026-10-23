import type {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
} from 'openai/resources/responses/responses';
import type { LlmRequest } from '../../../application/ports/llm-provider.js';

// P3-131: placeholder until the Responses body is written.
export function responsesBody(request: LlmRequest): ResponseCreateParamsNonStreaming {
  throw new Error(`not implemented ${request.model}`);
}

export function responsesStreamBody(request: LlmRequest): ResponseCreateParamsStreaming {
  throw new Error(`not implemented ${request.model}`);
}
