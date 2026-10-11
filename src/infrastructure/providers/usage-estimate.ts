import type { LlmRequest } from '../../application/ports/llm-provider.js';

// RF-421: when a provider reports no token counts, they are estimated at about four characters
// per token and the usage is marked `estimated`.

const charsPerToken = 4;

/** About four characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / charsPerToken);
}

/** The estimated input tokens of a request: system prompt, messages and tool definitions. */
export function estimateInputTokens(request: LlmRequest): number {
  const prompt = [
    request.system,
    ...request.messages.map((m) => m.content),
    JSON.stringify(request.tools),
  ];
  return estimateTokens(prompt.join(''));
}
