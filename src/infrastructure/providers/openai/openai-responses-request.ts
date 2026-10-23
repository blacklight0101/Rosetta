import type {
  FunctionTool,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import type { LlmMessage, LlmRequest } from '../../../application/ports/llm-provider.js';

// P3-131, RF-402: the body of one OpenAI Responses call (POST /v1/responses, developers.openai.com
// Responses API). The system prompt is `instructions`; the conversation is `input` items. The
// calls are stateless (`store: false`), so every earlier turn travels again: a user or assistant
// message item, a `function_call` item per earlier tool call (its `call_id`, the name and the
// arguments as a JSON string), and a `function_call_output` item answering a call by its `call_id`.
// Reasoning items of earlier turns are not sent back (OpenAI accepts the turns without them; see
// docs/providers.md 3.7). `max_output_tokens` bounds the answer including its reasoning;
// `temperature` is sent only when the role sets one; `reasoning.effort` only when the request
// carries an effort.

function itemsOf(message: LlmMessage): ResponseInputItem[] {
  switch (message.role) {
    case 'user':
      return [{ role: 'user', content: message.content }];
    case 'assistant': {
      const text: ResponseInputItem[] =
        message.content === '' ? [] : [{ role: 'assistant', content: message.content }];
      const calls: ResponseInputItem[] = (message.toolCalls ?? []).map((call) => ({
        type: 'function_call',
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      }));
      return [...text, ...calls];
    }
    case 'tool':
      return [
        { type: 'function_call_output', call_id: message.toolCallId, output: message.content },
      ];
  }
}

function toolsOf(request: LlmRequest): FunctionTool[] {
  return request.tools.map(({ name, description, parameters }) => ({
    type: 'function',
    name,
    description,
    parameters: { ...parameters },
    strict: false,
  }));
}

export function responsesBody(request: LlmRequest): ResponseCreateParamsNonStreaming {
  return {
    model: request.model,
    instructions: request.system,
    input: request.messages.flatMap(itemsOf),
    ...(request.tools.length > 0 ? { tools: toolsOf(request) } : {}),
    ...(request.maxOutputTokens === undefined
      ? {}
      : { max_output_tokens: request.maxOutputTokens }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.reasoningEffort === undefined
      ? {}
      : { reasoning: { effort: request.reasoningEffort } }),
    store: false,
    stream: false,
  };
}

/** The body of a streamed call (Q-60): the Responses stream ends with an event that has the usage. */
export function responsesStreamBody(request: LlmRequest): ResponseCreateParamsStreaming {
  return { ...responsesBody(request), stream: true };
}
