import { z } from 'zod';
import type { ToolCall } from '../../application/ports/llm-provider.js';

// RF-205: the one validation every tool call passes, native or sent in the text protocol: a tool
// name and an arguments object. What the arguments mean (unknown tool, numeric strings, a path
// outside the area) is judged by the agent loop with the tool's own schema (ADR-013), so both
// modes hand it the same untrusted values.

export interface ParsedToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

const argumentsObject = z.record(z.string(), z.unknown());

const callSchema = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return undefined;
  }
}

function parsedArguments(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return {};
  const parsed = argumentsObject.safeParse(jsonValue(value));
  return parsed.success ? parsed.data : undefined;
}

/** The tool call `value` describes, or undefined when it is not a valid one. */
export function toolCallOf(value: unknown): ParsedToolCall | undefined {
  // A failed schema parse builds its issues, which is slow over the many blocks of a long answer.
  if (typeof field(value, 'name') !== 'string') return undefined;
  const call = callSchema.safeParse(value);
  if (!call.success) return undefined;
  const args = parsedArguments(call.data.arguments);
  return args === undefined ? undefined : { name: call.data.name, arguments: args };
}

/** The calls of one answer with the ids `call-1`, `call-2`, ... (Ollama sends none). */
export function numberedToolCalls(calls: readonly ParsedToolCall[]): ToolCall[] {
  return calls.map((call, index) => ({
    id: `call-${String(index + 1)}`,
    name: call.name,
    arguments: call.arguments,
  }));
}

/** Native tool calls of one answer, and the entries that failed validation as JSON text. */
export interface NativeToolCalls {
  readonly calls: readonly ToolCall[];
  readonly rejected: readonly string[];
}

/**
 * RF-205: entries shaped `{ id?, function: { name, arguments } }`. With `keepIds` a non-empty id
 * the provider sent is kept (OpenAI matches tool results by it); other calls are numbered
 * `call-<n>` by their place among the valid calls.
 */
export function nativeToolCalls(entries: readonly unknown[], keepIds: boolean): NativeToolCalls {
  const calls: ToolCall[] = [];
  const rejected: string[] = [];
  for (const entry of entries) {
    const call = toolCallOf(field(entry, 'function'));
    if (call === undefined) {
      rejected.push(JSON.stringify(entry));
      continue;
    }
    const id = field(entry, 'id');
    const own = keepIds && typeof id === 'string' && id !== '' ? id : undefined;
    calls.push({ id: own ?? `call-${String(calls.length + 1)}`, ...call });
  }
  return { calls, rejected };
}
