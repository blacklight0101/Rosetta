import type {
  LlmRequest,
  LlmResponse,
  OllamaMetrics,
  TokenUsage,
  ToolCall,
} from '../../../application/ports/llm-provider.js';
import type { ContextChoice } from './ollama-context.js';
import type { ToolMode } from './ollama-request.js';
import type { OllamaChat } from './ollama-wire.js';
import { parseTextAnswer, stripThinking } from './text-tool-protocol.js';
import { nativeToolCalls, numberedToolCalls } from '../tool-call-shape.js';
import { estimateInputTokens, estimateTokens } from '../usage-estimate.js';

// RF-401, RF-408, RF-421: Ollama's /api/chat answer in the port's one shape. Thinking text is
// never part of the answer; Ollama has no cached-input-token count, so it is 0.

export interface ResponseContext {
  readonly request: LlmRequest;
  readonly toolMode: ToolMode;
  /** The model digest from /api/tags (RNF-004). */
  readonly modelVersion: string;
  /** The `num_ctx` sent and how it was chosen (DEC-114). */
  readonly context: ContextChoice;
}

const nsPerMs = 1_000_000;

function ms(nanoseconds: number | undefined): number {
  return Math.round((nanoseconds ?? 0) / nsPerMs);
}

function metricsOf(chat: OllamaChat, context: ContextChoice): OllamaMetrics {
  const evalNs = chat.eval_duration ?? 0;
  const tokensPerSecond = evalNs > 0 ? ((chat.eval_count ?? 0) * 1e9) / evalNs : 0;
  return {
    loadDurationMs: ms(chat.load_duration),
    promptEvalDurationMs: ms(chat.prompt_eval_duration),
    evalDurationMs: ms(evalNs),
    tokensPerSecond: Math.round(tokensPerSecond * 100) / 100,
    contextTokens: context.tokens,
    contextSource: context.source,
  };
}

/** Reported counts, or an estimate of about four characters per token (RF-421). */
export function usageOf(chat: OllamaChat, request: LlmRequest): TokenUsage {
  const { prompt_eval_count: input, eval_count: output } = chat;
  if (input !== undefined && output !== undefined) {
    return {
      inputTokens: input,
      outputTokens: output,
      cachedInputTokens: 0,
      usageSource: 'reported',
    };
  }
  return {
    inputTokens: input ?? estimateInputTokens(request),
    outputTokens: output ?? estimateTokens(chat.message.content ?? ''),
    cachedInputTokens: 0,
    usageSource: 'estimated',
  };
}

interface Answer {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
}

/** Native tool calls; an entry that fails validation stays visible as text (RF-205). */
function nativeAnswer(content: string, entries: readonly unknown[]): Answer {
  const { calls, rejected } = nativeToolCalls(entries, false);
  const text = [stripThinking(content).trim(), ...rejected].filter((part) => part !== '');
  return { text: text.join('\n'), toolCalls: calls };
}

function textAnswer(content: string): Answer {
  const { text, calls } = parseTextAnswer(content);
  return { text, toolCalls: numberedToolCalls(calls) };
}

export function llmResponseOf(chat: OllamaChat, context: ResponseContext): LlmResponse {
  const content = chat.message.content ?? '';
  const answer =
    context.toolMode === 'text'
      ? textAnswer(content)
      : nativeAnswer(content, chat.message.tool_calls ?? []);
  const finishReason =
    answer.toolCalls.length > 0 ? 'tool_use' : chat.done_reason === 'length' ? 'length' : 'stop';
  return {
    text: answer.text,
    toolCalls: answer.toolCalls,
    usage: usageOf(chat, context.request),
    finishReason,
    modelVersion: context.modelVersion,
    metrics: { httpStatus: 200, ollama: metricsOf(chat, context.context) },
  };
}
