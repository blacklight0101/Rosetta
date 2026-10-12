import type { ToolCall, ToolDefinition } from '../../../application/ports/llm-provider.js';
import { toolCallOf, type ParsedToolCall } from '../tool-call-shape.js';

// RF-205, ADR-003: the JSON-in-text tool protocol for models without native tool calling. The
// wording the model reads is the versioned prompt prompts/shared/text-tool-protocol.v<n>.md;
// this module only fills in the tools and reads and writes the blocks that prompt describes.

const fence = '```';
const toolCallLabel = 'tool_call';
const toolResultLabel = 'tool_result';
/** Where the prompt file wants the tool definitions. */
export const toolsPlaceholder = '{{tools}}';

/** `<think>`, `<thinking>` and their closing tags, in any letter case. */
const thinkingTag = /<(\/?)think(?:ing)?>/gi;
const fencedBlock = /```([\w-]*)[ \t]*\r?\n([\s\S]*?)```/g;

/**
 * The content without thinking text, which some models send even with thinking off. One pass over
 * the tags, so the time grows linearly with the content. An opening tag hides the text up to the
 * next closing tag, or to the end when none follows. A closing tag with no opening tag hides all
 * the text before it: the chat template sent the opening tag, not the model.
 */
export function stripThinking(content: string): string {
  const kept: string[] = [];
  let visibleFrom = 0;
  let thinking = false;
  for (const tag of content.matchAll(thinkingTag)) {
    const closing = tag[1] === '/';
    if (!closing && !thinking) kept.push(content.slice(visibleFrom, tag.index));
    if (closing && !thinking) kept.length = 0;
    if (closing) visibleFrom = tag.index + tag[0].length;
    thinking = !closing;
  }
  if (!thinking) kept.push(content.slice(visibleFrom));
  return kept.join('');
}

export interface TextAnswer {
  readonly text: string;
  readonly calls: readonly ParsedToolCall[];
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A `json` block or a bare object is a tool call only when it holds nothing but a call. */
function onlyCall(value: unknown): ParsedToolCall | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const extra = Object.keys(value).filter((key) => key !== 'name' && key !== 'arguments');
  return extra.length === 0 ? toolCallOf(value) : undefined;
}

function blockCall(label: string, body: string): ParsedToolCall | undefined {
  const value = parsedJson(body);
  if (label === toolCallLabel) return toolCallOf(value);
  return label === 'json' || label === '' ? onlyCall(value) : undefined;
}

/** The prose and the tool calls of a text-protocol answer; a block that is not a call stays text. */
export function parseTextAnswer(content: string): TextAnswer {
  const visible = stripThinking(content);
  const whole = onlyCall(parsedJson(visible.trim()));
  if (whole !== undefined) return { text: '', calls: [whole] };
  const calls: ParsedToolCall[] = [];
  const text = visible.replace(fencedBlock, (block: string, label: string, body: string) => {
    const call = blockCall(label, body);
    if (call === undefined) return block;
    calls.push(call);
    return '';
  });
  return { text: text.trim(), calls };
}

/** An earlier tool call of the conversation, as the model would have written it. */
export function toolCallBlock(call: ToolCall): string {
  const json = JSON.stringify({ name: call.name, arguments: call.arguments });
  return `${fence}${toolCallLabel}\n${json}\n${fence}`;
}

/** A tool result, sent back as a user message. */
export function toolResultBlock(toolCallId: string, content: string): string {
  const json = JSON.stringify({ id: toolCallId, content });
  return `${fence}${toolResultLabel}\n${json}\n${fence}`;
}

/** The system prompt with the protocol and the tool definitions appended. */
export function textProtocolSystem(
  system: string,
  template: string,
  tools: readonly ToolDefinition[],
): string {
  if (tools.length === 0) return system;
  const definitions = tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
  const protocol = template.replace(toolsPlaceholder, () => JSON.stringify(definitions, null, 2));
  return `${system}\n\n${protocol}`;
}
