import type { LlmMessage, LlmRequest } from '../../../application/ports/llm-provider.js';
import { textProtocolSystem, toolCallBlock, toolResultBlock } from './text-tool-protocol.js';

// RF-401, RF-205: the body of one Ollama /api/chat call. In `native` mode the tools go in the
// `tools` field; in `text` mode the protocol prompt describes them in the system prompt and
// earlier calls and results travel as text, because such models drop tool messages.

/** The project setting `providers.<name>.toolMode` (data-model.md section 3.1). */
export type ToolMode = 'native' | 'text';

export interface ChatSettings {
  readonly toolMode: ToolMode;
  /** Ollama's `num_ctx`, sent on every call so the model stays on the GPU. */
  readonly contextTokens: number;
  readonly think: boolean;
  readonly textProtocolPrompt: string;
}

interface OllamaMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly tool_calls?: readonly { readonly function: { name: string; arguments: unknown } }[];
  readonly tool_name?: string;
}

interface OllamaTool {
  readonly type: 'function';
  readonly function: { name: string; description: string; parameters: unknown };
}

export interface OllamaChatBody {
  readonly model: string;
  readonly messages: readonly OllamaMessage[];
  readonly stream: false;
  readonly think: boolean;
  readonly options: Readonly<Record<string, number>>;
  readonly tools?: readonly OllamaTool[];
}

function toolNames(messages: readonly LlmMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const call of message.toolCalls ?? []) names.set(call.id, call.name);
  }
  return names;
}

function nativeMessage(message: LlmMessage, names: Map<string, string>): OllamaMessage {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content };
    case 'assistant': {
      const calls = message.toolCalls ?? [];
      if (calls.length === 0) return { role: 'assistant', content: message.content };
      const toolCalls = calls.map((call) => ({
        function: { name: call.name, arguments: call.arguments },
      }));
      return { role: 'assistant', content: message.content, tool_calls: toolCalls };
    }
    case 'tool': {
      const name = names.get(message.toolCallId);
      return {
        role: 'tool',
        content: message.content,
        ...(name === undefined ? {} : { tool_name: name }),
      };
    }
  }
}

function textMessage(message: LlmMessage): OllamaMessage {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content };
    case 'assistant': {
      const parts = [message.content, ...(message.toolCalls ?? []).map(toolCallBlock)];
      return { role: 'assistant', content: parts.filter((part) => part !== '').join('\n\n') };
    }
    case 'tool':
      return { role: 'user', content: toolResultBlock(message.toolCallId, message.content) };
  }
}

function optionsOf(request: LlmRequest, settings: ChatSettings): Record<string, number> {
  return {
    num_ctx: settings.contextTokens,
    ...(request.maxOutputTokens === undefined ? {} : { num_predict: request.maxOutputTokens }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  };
}

function toolsOf(request: LlmRequest): OllamaTool[] {
  return request.tools.map(({ name, description, parameters }) => ({
    type: 'function',
    function: { name, description, parameters },
  }));
}

export function chatBody(request: LlmRequest, settings: ChatSettings): OllamaChatBody {
  const native = settings.toolMode === 'native';
  const names = toolNames(request.messages);
  const system = native
    ? request.system
    : textProtocolSystem(request.system, settings.textProtocolPrompt, request.tools);
  const history = request.messages.map((message) =>
    native ? nativeMessage(message, names) : textMessage(message),
  );
  return {
    model: request.model,
    messages: [{ role: 'system', content: system }, ...history],
    stream: false,
    think: settings.think,
    options: optionsOf(request, settings),
    ...(native && request.tools.length > 0 ? { tools: toolsOf(request) } : {}),
  };
}
