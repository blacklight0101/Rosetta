import type { LlmRequest } from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import type { AttemptFailed } from '../retrying-call.js';
import { estimateTokens } from '../usage-estimate.js';
import type { OllamaChatBody } from './ollama-request.js';
import { usageOf } from './ollama-response.js';
import type { OllamaChat } from './ollama-wire.js';

// RF-401, RF-421, DEC-114, DEC-155: Ollama cuts a prompt that does not fit `num_ctx` without a
// word, and the model then answers something else (the format instructions are the first to go).
// Two checks turn that into one clear failure for every role:
//   - before the call: the estimated prompt (about four characters per token, RF-421) plus the
//     output reserve is larger than the context sent as `num_ctx`; nothing is sent;
//   - after the call: the estimate is over the context (a cut is certain) and Ollama reports less
//     than 70 percent of the estimate as evaluated; the answer is dropped. A prompt whose estimate
//     fits is never failed here: Ollama counts only the tokens it evaluated anew, so a KV cache hit
//     of a multi-turn call gives a small count for a prompt that fitted.
// The estimate is rough, so the first check adds no margin of its own. The messages carry numbers,
// the role and the model name, never any prompt text.

const cutBelowEstimatePercent = 70;

export interface PromptFacts {
  readonly role: string;
  readonly model: string;
  readonly estimatedTokens: number;
  /** The output the call may use (`maxOutputTokens`); 0 when it has no limit. */
  readonly outputTokens: number;
  readonly contextTokens: number;
}

/** The estimated prompt tokens of the chat body: every message, tool calls and tool definitions. */
function estimatedPromptTokens(body: OllamaChatBody, request: LlmRequest): number {
  const messages = body.messages.map((message) =>
    message.tool_calls === undefined
      ? message.content
      : message.content + JSON.stringify(message.tool_calls),
  );
  const tools = body.tools === undefined ? '' : JSON.stringify(request.tools);
  return estimateTokens([...messages, tools].join(''));
}

export function promptFactsOf(
  request: LlmRequest,
  body: OllamaChatBody,
  contextTokens: number,
): PromptFacts {
  return {
    role: request.context.role,
    model: request.model,
    estimatedTokens: estimatedPromptTokens(body, request),
    outputTokens: request.maxOutputTokens ?? 0,
    contextTokens,
  };
}

function remedies(role: string): string {
  return `Use a model with a larger context, or a cloud model for the ${role} role in the project settings, or set a larger contextTokens for this provider.`;
}

/** The failure of a prompt that does not fit: undefined when it fits. Nothing is sent. */
export function refusedPrompt(facts: PromptFacts): AttemptFailed | undefined {
  const { role, model, estimatedTokens, outputTokens, contextTokens } = facts;
  if (estimatedTokens + outputTokens <= contextTokens) return undefined;
  const answer =
    outputTokens === 0 ? '' : ` and its answer may use up to ${String(outputTokens)} more`;
  const message = `The ${role} prompt is about ${String(estimatedTokens)} tokens${answer}, but the Ollama context for ${model} is ${String(contextTokens)} tokens, so the call was not sent. ${remedies(role)}`;
  return {
    failure: { code: ERROR_CODES.ollamaPromptTooLarge },
    retryable: false,
    message,
    notSent: true,
  };
}

/** The failure of a call whose prompt Ollama cut: undefined when the reported count agrees. */
export function cutPrompt(
  facts: PromptFacts,
  chat: OllamaChat,
  request: LlmRequest,
): AttemptFailed | undefined {
  const { role, model, estimatedTokens, contextTokens } = facts;
  const reported = chat.prompt_eval_count;
  if (reported === undefined) return undefined;
  // Ollama counts only the tokens it evaluated anew, so a KV cache hit gives a small count for a
  // prompt that fitted: only an estimate over the context proves a cut.
  const over = estimatedTokens > contextTokens;
  const far = reported * 100 < estimatedTokens * cutBelowEstimatePercent;
  if (!over || !far) return undefined;
  const message = `Ollama read only ${String(reported)} of the about ${String(estimatedTokens)} tokens of the ${role} prompt: the context for ${model} is ${String(contextTokens)} tokens, so it cut the prompt and the answer was not used. ${remedies(role)}`;
  return {
    failure: { code: ERROR_CODES.ollamaPromptTooLarge },
    retryable: false,
    message,
    usage: usageOf(chat, request),
  };
}
