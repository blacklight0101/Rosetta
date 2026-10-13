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

/**
 * The JSON object the text holds, or undefined. A tool call is always an object, so only text that
 * starts and ends like one is parsed: a failed parse throws, and a throw per block of a long answer
 * full of empty blocks would cost seconds.
 */
function parsedObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined;
  try {
    return JSON.parse(trimmed);
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

interface FencedBlock {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

const tab = 9;
const lineFeed = 10;
const carriageReturn = 13;
const space = 32;

/** A letter, digit, `_` or `-`: what a fence label is made of. */
function isLabelCode(code: number): boolean {
  const lower = code | 0x20;
  return (lower >= 97 && lower <= 122) || (code >= 48 && code <= 57) || code === 95 || code === 45;
}

/** After a fence: the label, spaces or tabs, and a line break; undefined when it opens nothing. */
function headerAt(
  text: string,
  labelStart: number,
): Pick<FencedBlock, 'label' | 'bodyStart'> | undefined {
  let at = labelStart;
  while (isLabelCode(text.charCodeAt(at))) at += 1;
  const labelEnd = at;
  while (text.charCodeAt(at) === space || text.charCodeAt(at) === tab) at += 1;
  if (text.charCodeAt(at) === carriageReturn) at += 1;
  if (text.charCodeAt(at) !== lineFeed) return undefined;
  return { label: text.slice(labelStart, labelEnd), bodyStart: at + 1 };
}

/**
 * The first fenced block from `from`: an opening fence with its label and line break, and the body
 * up to the next fence. Linear over a whole answer: each fence is looked at once, and when no fence
 * closes an opening one, none closes a later one either, so there are no more blocks.
 */
function nextBlock(text: string, from: number): FencedBlock | undefined {
  for (let open = text.indexOf(fence, from); open >= 0; open = text.indexOf(fence, open + 1)) {
    const header = headerAt(text, open + fence.length);
    if (header === undefined) continue;
    const close = text.indexOf(fence, header.bodyStart);
    if (close < 0) return undefined;
    return { start: open, end: close + fence.length, ...header, bodyEnd: close };
  }
  return undefined;
}

/** Only a `tool_call`, `json` or unlabelled block can hold a call; others are never parsed. */
function blockCall(text: string, block: FencedBlock): ParsedToolCall | undefined {
  const { label } = block;
  if (label !== toolCallLabel && label !== 'json' && label !== '') return undefined;
  const value = parsedObject(text.slice(block.bodyStart, block.bodyEnd));
  if (value === undefined) return undefined;
  return label === toolCallLabel ? toolCallOf(value) : onlyCall(value);
}

/** The prose and the tool calls of a text-protocol answer; a block that is not a call stays text. */
export function parseTextAnswer(content: string): TextAnswer {
  const visible = stripThinking(content);
  const whole = onlyCall(parsedObject(visible));
  if (whole !== undefined) return { text: '', calls: [whole] };
  const calls: ParsedToolCall[] = [];
  const kept: string[] = [];
  let keptFrom = 0;
  for (let block = nextBlock(visible, 0); block; block = nextBlock(visible, block.end)) {
    const call = blockCall(visible, block);
    if (call === undefined) continue;
    calls.push(call);
    kept.push(visible.slice(keptFrom, block.start));
    keptFrom = block.end;
  }
  kept.push(visible.slice(keptFrom));
  return { text: kept.join('').trim(), calls };
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
