import type {
  ContentBlockParam,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import type { LlmMessage, LlmRequest } from '../../../application/ports/llm-provider.js';

// RF-404: the body of one Anthropic Messages API call. Tools go in `tools` with their JSON Schema
// as `input_schema`; earlier calls travel as `tool_use` blocks with their ids and object input, and
// tool results answer them as `tool_result` blocks of the next user turn (consecutive tool results
// and a user message after them share one turn, as the API expects). The stable prompt prefix is
// marked for caching with two of the four allowed breakpoints: the system prompt (which caches the
// tools before it) and the last block of the last message, because a task's conversation is
// append-only and that prefix repeats unchanged in its next call.

const cacheBreakpoint = { type: 'ephemeral' } as const;

interface Turn {
  role: 'user' | 'assistant';
  content: ContentBlockParam[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function blocksOf(message: LlmMessage): ContentBlockParam[] {
  switch (message.role) {
    case 'user':
      return [{ type: 'text', text: message.content }];
    case 'assistant': {
      // The API refuses an empty text block, so a turn of tool calls only has none.
      const text: ContentBlockParam[] =
        message.content === '' ? [] : [{ type: 'text', text: message.content }];
      const calls = (message.toolCalls ?? []).map((call): ContentBlockParam => ({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: isObject(call.arguments) ? call.arguments : {},
      }));
      return [...text, ...calls];
    }
    case 'tool':
      return [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }];
  }
}

/** The port's messages as API turns: tool results join the user turn, empty turns are left out. */
function turnsOf(messages: readonly LlmMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const blocks = blocksOf(message);
    if (blocks.length === 0) continue;
    const last = turns.at(-1);
    if (last?.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
  }
  return turns;
}

/** Marks the last block of the last turn as a cache breakpoint. */
function withLastBreakpoint(turns: Turn[]): MessageParam[] {
  const last = turns.at(-1)?.content.at(-1);
  if (last !== undefined && last.type !== 'thinking' && last.type !== 'redacted_thinking') {
    last.cache_control = cacheBreakpoint;
  }
  return turns;
}

function toolsOf(request: LlmRequest): Tool[] {
  return request.tools.map(({ name, description, parameters }) => ({
    name,
    description,
    input_schema: { ...parameters, type: 'object' },
  }));
}

export function messageBody(
  request: LlmRequest,
  maxTokens: number,
): MessageCreateParamsNonStreaming {
  return {
    model: request.model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: request.system, cache_control: cacheBreakpoint }],
    messages: withLastBreakpoint(turnsOf(request.messages)),
    ...(request.tools.length > 0 ? { tools: toolsOf(request) } : {}),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    stream: false,
  };
}
