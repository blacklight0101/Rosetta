import { z } from 'zod';
import type { ToolCall } from '../../../application/ports/llm-provider.js';

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
