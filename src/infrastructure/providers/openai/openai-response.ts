import type {
  LlmRequest,
  LlmResponse,
  TokenUsage,
} from '../../../application/ports/llm-provider.js';
import { nativeToolCalls } from '../tool-call-shape.js';
import { estimateInputTokens, estimateTokens } from '../usage-estimate.js';
import { parseCompletion, type OpenAiCompletion } from './openai-wire.js';

// RF-402, RF-408, RF-421: OpenAI's chat completion in the port's one shape. `inputTokens` is
// OpenAI's `prompt_tokens`, which includes the cached ones; `cachedInputTokens` is
// `prompt_tokens_details.cached_tokens`, 0 when OpenAI leaves it out.

export interface ResponseContext {
  readonly request: LlmRequest;
  /** The `x-request-id` header, when OpenAI sent one. */
  readonly requestId: string | undefined;
}

type Choice = OpenAiCompletion['choices'][number];

function usageOf(completion: OpenAiCompletion, text: string, request: LlmRequest): TokenUsage {
  const { usage } = completion;
  if (usage === undefined || usage === null) {
    return {
      inputTokens: estimateInputTokens(request),
      outputTokens: estimateTokens(text),
      cachedInputTokens: 0,
      usageSource: 'estimated',
    };
  }
  const { prompt_tokens: input, completion_tokens: output } = usage;
  return {
    inputTokens: input ?? estimateInputTokens(request),
    outputTokens: output ?? estimateTokens(text),
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    usageSource: input === undefined || output === undefined ? 'estimated' : 'reported',
  };
}

/** The answer text: content, or the refusal; tool calls that failed validation stay as text. */
function textOf(choice: Choice, rejected: readonly string[]): string {
  const { content, refusal } = choice.message;
  const parts = [content ?? '', refusal ?? '', ...rejected].filter((part) => part !== '');
  return parts.join('\n');
}

/** The answer in the port's shape, or undefined when `body` is not a chat completion. */
export function llmResponseOf(body: unknown, context: ResponseContext): LlmResponse | undefined {
  const completion = parseCompletion(body);
  const [choice] = completion?.choices ?? [];
  if (completion === undefined || choice === undefined) return undefined;
  const { calls, rejected } = nativeToolCalls(choice.message.tool_calls ?? [], true);
  const text = textOf(choice, rejected);
  const finishReason =
    calls.length > 0 ? 'tool_use' : choice.finish_reason === 'length' ? 'length' : 'stop';
  return {
    text,
    toolCalls: calls,
    usage: usageOf(completion, text, context.request),
    finishReason,
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
    modelVersion: completion.model,
    metrics: { httpStatus: 200 },
  };
}
