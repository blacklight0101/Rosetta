import type { LlmResponse, TokenUsage } from '../../../application/ports/llm-provider.js';
import { nativeToolCalls } from '../tool-call-shape.js';
import { estimateInputTokens, estimateTokens } from '../usage-estimate.js';
import type { ResponseContext } from './openai-response.js';
import { parseResponse, type OpenAiResponse, type ResponseItem } from './openai-responses-wire.js';

// P3-131, RF-402, RF-421: OpenAI's Responses answer in the port's one shape. `inputTokens` is
// `input_tokens`, which includes the cached ones (`input_tokens_details.cached_tokens`);
// `outputTokens` is `output_tokens`, which includes the reasoning tokens (billed as output;
// `output_tokens_details.reasoning_tokens`, left out when absent or zero, Q-58). OpenAI bills
// `cache_write_tokens` at the input price, so they are not a separate figure. A call is cut at the
// output limit when `status` is `incomplete` with the reason `max_output_tokens` (P5-03).

/** Q-58: the reasoning tokens, a part of the output tokens; none when absent or zero. */
function reasoningOf(usage: NonNullable<OpenAiResponse['usage']>): { reasoningTokens?: number } {
  const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0;
  return reasoning > 0 ? { reasoningTokens: reasoning } : {};
}

function usageOf(response: OpenAiResponse, text: string, context: ResponseContext): TokenUsage {
  const { usage } = response;
  if (usage === undefined || usage === null) {
    return {
      inputTokens: estimateInputTokens(context.request),
      outputTokens: estimateTokens(text),
      cachedInputTokens: 0,
      usageSource: 'estimated',
    };
  }
  const { input_tokens: input, output_tokens: output } = usage;
  return {
    inputTokens: input ?? estimateInputTokens(context.request),
    outputTokens: output ?? estimateTokens(text),
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    ...reasoningOf(usage),
    usageSource: input === undefined || output === undefined ? 'estimated' : 'reported',
  };
}

function textPartsOf(item: ResponseItem): string[] {
  if (item.type !== 'message') return [];
  return (item.content ?? []).map((part) => part.text ?? part.refusal ?? '');
}

/** A function call item as the `{ id, function }` entry the shared tool call reading takes. */
function callEntriesOf(response: OpenAiResponse): unknown[] {
  return response.output
    .filter((item) => item.type === 'function_call')
    .map((item) => ({
      id: item.call_id ?? '',
      function: { name: item.name ?? '', arguments: item.arguments ?? '{}' },
    }));
}

/** The answer in the port's shape, or undefined when `body` is not a Responses answer. */
export function llmResponseOfResponses(
  body: unknown,
  context: ResponseContext,
): LlmResponse | undefined {
  const response = parseResponse(body);
  if (response === undefined) return undefined;
  const { calls, rejected } = nativeToolCalls(callEntriesOf(response), true);
  const text = [...response.output.flatMap(textPartsOf), ...rejected]
    .filter((part) => part !== '')
    .join('\n');
  const cut =
    response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens';
  return {
    text,
    toolCalls: calls,
    usage: usageOf(response, text, context),
    finishReason: calls.length > 0 ? 'tool_use' : cut ? 'length' : 'stop',
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
    modelVersion: response.model,
    metrics: { httpStatus: 200 },
  };
}
