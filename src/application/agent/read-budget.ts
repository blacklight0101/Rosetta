import type { ToolCall } from '../ports/llm-provider.js';
import type { ToolOutcome } from './read-only-tools.js';
import { parseToolArguments } from './tool-arguments.js';

// RF-1414, DEC-239: the line budget of a read-more ask, applied to one tool call. Only `read_file`
// is cut: a read that asks for more lines than are left is cut to the lines left from its start
// line, and a read made when none is left is not run. `grep`, `codemap_query` and
// `list_area_files` pass as they are. Every line served counts, a line read again included,
// because each one stays in the input of the task's later calls.

/** The call to run within the lines left, or `spent` when it is a read and none is left. */
export function withinBudget(call: ToolCall, linesLeft: number | undefined): ToolCall | 'spent' {
  if (linesLeft === undefined || call.name !== 'read_file') return call;
  if (linesLeft <= 0) return 'spent';
  const parsed = parseToolArguments('read_file', call.arguments);
  if (!parsed.ok || parsed.value.tool !== 'read_file') return call;
  const { path, startLine, endLine } = parsed.value;
  if (endLine - startLine + 1 <= linesLeft) return call;
  return { ...call, arguments: { path, startLine, endLine: startLine + linesLeft - 1 } };
}

/** The file lines a `read_file` outcome served; a failed read serves none. */
export function servedLines(outcome: ToolOutcome): number {
  if (outcome.error !== undefined) return 0;
  return (outcome.excerpts ?? []).reduce(
    (sum, excerpt) => sum + excerpt.endLine - excerpt.startLine + 1,
    0,
  );
}

/** The notice of a read made when the budget of the ask is spent. */
export function spentMessage(budget: number): string {
  return `Not read: you have read the ${String(budget)} lines you may read after the last refusal. Give your final answer now.`;
}
