import type {
  LlmRequest,
  LlmResponse,
  TokenUsage,
} from '../../../application/ports/llm-provider.js';
import { nativeToolCalls } from '../tool-call-shape.js';
import { estimateInputTokens, estimateTokens } from '../usage-estimate.js';
import { parseMessage, type AnthropicMessage } from './anthropic-wire.js';

// RF-404, RF-408, RF-421: Anthropic's message in the port's one shape. The port's `inputTokens`
// includes the cached ones (docs/providers.md), so it is Anthropic's `input_tokens` plus the
// tokens read from and written to the cache; `cachedInputTokens` is `cache_read_input_tokens` and
// `cacheWriteInputTokens` is `cache_creation_input_tokens` (P2-16), left out when it is zero.

export interface ResponseContext {
  readonly request: LlmRequest;
  /** The `request-id` header, when Anthropic sent one. */
  readonly requestId: string | undefined;
}

function usageOf(message: AnthropicMessage, text: string, request: LlmRequest): TokenUsage {
  const { usage } = message;
  if (usage === undefined || usage === null) {
    return {
      inputTokens: estimateInputTokens(request),
      outputTokens: estimateTokens(text),
      cachedInputTokens: 0,
      usageSource: 'estimated',
    };
  }
  const read = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: usage.input_tokens + read + written,
    outputTokens: usage.output_tokens,
    cachedInputTokens: read,
    // P2-16: the tokens written to the cache, billed at the cache-write price; absent when none.
    ...(written > 0 ? { cacheWriteInputTokens: written } : {}),
    usageSource: 'reported',
  };
}

function field(value: object, key: string): unknown {
  return Reflect.get(value, key);
}

/** Text blocks joined, and the tool_use blocks in the shape the shared validation reads. */
function partsOf(message: AnthropicMessage): { texts: string[]; uses: unknown[] } {
  const texts: string[] = [];
  const uses: unknown[] = [];
  for (const block of message.content) {
    const text = field(block, 'text');
    if (block.type === 'text' && typeof text === 'string') texts.push(text);
    if (block.type === 'tool_use') {
      const call = { name: field(block, 'name'), arguments: field(block, 'input') };
      uses.push({ id: field(block, 'id'), function: call });
    }
  }
  return { texts, uses };
}

/** The answer in the port's shape, or undefined when `body` is not a message. */
export function llmResponseOf(body: unknown, context: ResponseContext): LlmResponse | undefined {
  const message = parseMessage(body);
  if (message === undefined) return undefined;
  const { texts, uses } = partsOf(message);
  // A tool call whose input is not an object stays visible as text (RF-205).
  const { calls, rejected } = nativeToolCalls(uses, true);
  const text = [...texts, ...rejected].filter((part) => part !== '').join('\n');
  const finishReason =
    calls.length > 0 ? 'tool_use' : message.stop_reason === 'max_tokens' ? 'length' : 'stop';
  return {
    text,
    toolCalls: calls,
    usage: usageOf(message, text, context.request),
    finishReason,
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
    modelVersion: message.model,
    metrics: { httpStatus: 200 },
  };
}
