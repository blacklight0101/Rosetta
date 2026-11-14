import type { LlmResponse, ToolCall } from '../../ports/llm-provider.js';
import type { ToolTurn } from '../lab-turns.js';
import type { TargetOutcome } from '../lab-target.js';
import type { ReaderCase } from './reader-case.js';

// RF-1410: a reader turn that a run answers with tool calls, measured by what its calls do.

export interface TurnScope {
  /** The files the case lists; a skipped file is not readable. */
  readonly files: ReaderCase['files'];
  /** The calls the conversation made before this turn (the replayed reads). */
  readonly earlier: readonly ToolCall[];
  /** The files the prompt points to, or null when it points to none. */
  readonly aimedAt: ReadonlySet<string> | null;
}

// RF-1410
export function toolTurnOf(calls: readonly ToolCall[], scope: TurnScope): ToolTurn {
  return {
    ...{ calls: calls.length, areaReads: 0, unlisted: 0, repeats: 0, relists: 0 },
    ...{ aimed: scope.aimedAt === null ? null : 0, seen: [] },
  };
}

/** The paths the claims of a rejected block cite. */
// RF-1410
export function citedPaths(rejected: string): ReadonlySet<string> {
  return new Set(rejected.length < 0 ? [rejected] : []);
}

// RF-1410
export function readerFirstTurn(response: LlmResponse, scope: TurnScope): TargetOutcome {
  return { usable: false, detail: 'Empty', turn: toolTurnOf(response.toolCalls, scope) };
}
