import type { CardDraft } from '../../domain/cards/card-ids.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';
import type { OutputProblem } from '../cards/parse-cards.js';
import type { LlmMessage } from '../ports/llm-provider.js';

// RF-201, RF-202, architecture section 5 (`AgentTaskState`): how one agent task ended and what it
// produced. A task always ends with a state and a reason the run can record; it never throws for
// a model that misbehaves, a refused call or a stop.

/** Why the task ended; the state follows from it. */
type AgentTaskEndReason =
  | 'final-answer'
  | 'invalid-output'
  | 'max-turns'
  | 'context-limit'
  | 'repeated-calls'
  | 'unknown-tools'
  | 'aborted'
  | 'provider-failed';

/** `StoppedByCap` comes with the budget guard's refusal codes (P1-27, P1-33). */
type EndState = Exclude<AgentTaskState, 'Planned' | 'Running' | 'StoppedByCap'>;

const stateOf: Readonly<Record<AgentTaskEndReason, EndState>> = {
  'final-answer': 'Done',
  'invalid-output': 'InvalidOutput',
  'max-turns': 'TurnLimitReached',
  'context-limit': 'TurnLimitReached',
  'repeated-calls': 'Failed',
  'unknown-tools': 'Failed',
  aborted: 'Failed',
  'provider-failed': 'Failed',
};

interface AgentUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
}

export interface AgentTaskResult {
  readonly state: EndState;
  readonly reason: AgentTaskEndReason;
  /** The code of every end but `final-answer`. */
  readonly code?: ErrorCode;
  /** The cards of the final answer; empty unless the task is `Done`. */
  readonly drafts: readonly CardDraft[];
  /** For `InvalidOutput`: the answers that could not be parsed, to be saved for the user. */
  readonly rawOutputs: readonly string[];
  readonly problems: readonly OutputProblem[];
  /** Model calls made, the repair call included. */
  readonly turns: number;
  /** Tool calls that got an error result. */
  readonly toolErrors: number;
  readonly usage: AgentUsage;
  /** The exact model version the provider reported, null before the first answer (RNF-004). */
  readonly modelVersion: string | null;
  /** The conversation after the system prompt. */
  readonly messages: readonly LlmMessage[];
}

export interface AgentTaskProgress {
  readonly turns: number;
  readonly toolErrors: number;
  readonly usage: AgentUsage;
  readonly modelVersion: string | null;
  readonly messages: readonly LlmMessage[];
}

export interface AgentTaskEnd {
  readonly reason: AgentTaskEndReason;
  readonly code?: ErrorCode;
  readonly drafts?: readonly CardDraft[];
  readonly rawOutputs?: readonly string[];
  readonly problems?: readonly OutputProblem[];
}

export function taskResult(end: AgentTaskEnd, progress: AgentTaskProgress): AgentTaskResult {
  return {
    state: stateOf[end.reason],
    reason: end.reason,
    ...(end.code === undefined ? {} : { code: end.code }),
    drafts: end.drafts ?? [],
    rawOutputs: end.rawOutputs ?? [],
    problems: end.problems ?? [],
    ...progress,
  };
}

/** The end of a task stopped through the shared signal (Stop, shutdown or a cap). */
export const abortedEnd: AgentTaskEnd = {
  reason: 'aborted',
  code: ERROR_CODES.providerCallCancelled,
};

/**
 * The end of a task whose model call failed: a stop through the shared signal, or a failure with
 * its code (a refusal of the egress guard included). An error without a code is a programming
 * error and is thrown on. A cap of the budget guard (P1-27) ends the task the same way until that
 * guard gives its refusals a code of their own.
 */
export function failedCallEnd(error: unknown, signal: AbortSignal): AgentTaskEnd {
  if (signal.aborted) return abortedEnd;
  if (!(error instanceof RosettaError)) throw error;
  if (error.code === ERROR_CODES.providerCallCancelled) return abortedEnd;
  return { reason: 'provider-failed', code: error.code };
}
