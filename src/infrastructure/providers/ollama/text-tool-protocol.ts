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
 * starts and ends like one is parsed: a failed parse throws, and a throw for every block of a long
 * answer of empty blocks cost seconds.
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

/**
 * An opening fence: three backticks, a label of letters, digits, `_` or `-`, spaces or tabs and a
 * line break. It holds no body, so a search for it never runs to the end of the text and back.
 */
const openingFence = /```([\w-]*)[ \t]*\r?\n/g;

interface Range {
  readonly start: number;
  readonly end: number;
}

/** Only a `tool_call`, `json` or unlabelled block can hold a call; others are never parsed. */
function blockCall(label: string, text: string, body: Range): ParsedToolCall | undefined {
  if (label !== toolCallLabel && label !== 'json' && label !== '') return undefined;
  const value = parsedObject(text.slice(body.start, body.end));
  if (value === undefined) return undefined;
  return label === toolCallLabel ? toolCallOf(value) : onlyCall(value);
}

/**
 * The prose and the tool calls of a text-protocol answer; a block that is not a call stays text. A
 * block is an opening fence and the body up to the next fence. One pass: each search starts where
 * the last block ended, and when no fence closes an opening one, none closes a later one either.
 */
export function parseTextAnswer(content: string): TextAnswer {
  const visible = stripThinking(content);
  const whole = onlyCall(parsedObject(visible));
  if (whole !== undefined) return { text: '', calls: [whole] };
  const calls: ParsedToolCall[] = [];
  const kept: string[] = [];
  let keptFrom = 0;
  openingFence.lastIndex = 0;
  for (let open = openingFence.exec(visible); open !== null; open = openingFence.exec(visible)) {
    const body = {
      start: openingFence.lastIndex,
      end: visible.indexOf(fence, openingFence.lastIndex),
    };
    if (body.end < 0) break;
    openingFence.lastIndex = body.end + fence.length;
    const call = blockCall(open[1] ?? '', visible, body);
    if (call === undefined) continue;
    calls.push(call);
    kept.push(visible.slice(keptFrom, open.index));
    keptFrom = openingFence.lastIndex;
  }
  kept.push(visible.slice(keptFrom));
  return { text: kept.join('').trim(), calls };
}

/** An earlier tool call of the conversation, as the model would have written it. */
export function toolCallBlock(call: ToolCall): string {
  const json = JSON.stringify({ name: call.name, arguments: call.arguments });
  return `${fence}${toolCallLabel}\n${json}\n${fence}`;
}

/** The longest run of backticks in the text. */
function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const run of text.matchAll(/`+/g)) longest = Math.max(longest, run[0].length);
  return longest;
}

/**
 * A tool result, sent back as a user message. The content goes in as it is, after an `id:` line
 * and a `content:` line, so the lines of its data-block frame (RF-145) reach the model as lines
 * and not as one JSON string with escaped line breaks. The fence is longer than any backtick run
 * of the content, so repository text cannot close the block early.
 */
export function toolResultBlock(toolCallId: string, content: string): string {
  const resultFence = '`'.repeat(Math.max(fence.length, longestBacktickRun(content) + 1));
  return `${resultFence}${toolResultLabel}\nid: ${toolCallId}\ncontent:\n${content}\n${resultFence}`;
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
