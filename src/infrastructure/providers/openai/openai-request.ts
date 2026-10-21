import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { LlmMessage, LlmRequest } from '../../../application/ports/llm-provider.js';

// RF-402: the body of one OpenAI chat completion call. Tool calls go in `tools`; earlier calls
// travel with their ids and JSON-string arguments, and tool results answer them by id.
// `max_completion_tokens` works for every current model (the older `max_tokens` does not for
// reasoning models); `temperature` is sent only when the role sets one. `reasoning_effort` (Chat
// Completions, developers.openai.com/api/docs/guides/reasoning) is sent only when the request
// carries an effort, which the provider factory sets for the reasoning models of the shipped list.

function messageOf(message: LlmMessage): ChatCompletionMessageParam {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content };
    case 'assistant': {
      const calls = message.toolCalls ?? [];
      if (calls.length === 0) return { role: 'assistant', content: message.content };
      return {
        role: 'assistant',
        content: message.content === '' ? null : message.content,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}

function toolsOf(request: LlmRequest): ChatCompletionTool[] {
  return request.tools.map(({ name, description, parameters }) => ({
    type: 'function',
    function: { name, description, parameters: { ...parameters } },
  }));
}

export function chatCompletionBody(request: LlmRequest): ChatCompletionCreateParamsNonStreaming {
  return {
    model: request.model,
    messages: [{ role: 'system', content: request.system }, ...request.messages.map(messageOf)],
    ...(request.tools.length > 0 ? { tools: toolsOf(request) } : {}),
    ...(request.maxOutputTokens === undefined
      ? {}
      : { max_completion_tokens: request.maxOutputTokens }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.reasoningEffort === undefined ? {} : { reasoning_effort: request.reasoningEffort }),
    stream: false,
  };
}
