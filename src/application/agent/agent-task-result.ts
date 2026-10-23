import type { CardDraft } from '../../domain/cards/card-ids.js';
import { isCapStop } from '../../domain/budget/cap-stop.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';
import type { OutputProblem } from '../cards/output-problem.js';
import type { LlmMessage } from '../ports/llm-provider.js';
import type { RepeatedCall } from './retry-note.js';

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
  | 'cap-reached'
  | 'provider-failed';

type EndState = Exclude<AgentTaskState, 'Planned' | 'Running'>;

const stateOf: Readonly<Record<AgentTaskEndReason, EndState>> = {
  'final-answer': 'Done',
  'invalid-output': 'InvalidOutput',
  'max-turns': 'TurnLimitReached',
  'context-limit': 'TurnLimitReached',
  'repeated-calls': 'Failed',
  'unknown-tools': 'Failed',
  aborted: 'Failed',
  'cap-reached': 'StoppedByCap',
  'provider-failed': 'Failed',
};

/**
 * RF-206: whether the task read a file of its area. `nothing-readable`: the area has no readable
 * file (only binary or ignored ones), so the rule does not apply.
 */
export type AreaRead = 'read' | 'not-read' | 'nothing-readable';

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
  /** RF-408: for `provider-failed`, the provider's error text, kept for the log entry. */
  readonly providerError?: string;
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
  /** RF-206: whether the task read a file of its area before it ended. */
  readonly areaRead: AreaRead;
  /** RST-1303: for `repeated-calls`, the call the model kept repeating. */
  readonly repeatedCall?: RepeatedCall;
}

export interface AgentTaskProgress {
  readonly turns: number;
  readonly toolErrors: number;
  readonly usage: AgentUsage;
  readonly modelVersion: string | null;
  readonly messages: readonly LlmMessage[];
  readonly areaRead: AreaRead;
}

export interface AgentTaskEnd {
  readonly reason: AgentTaskEndReason;
  readonly code?: ErrorCode;
  readonly providerError?: string;
  readonly drafts?: readonly CardDraft[];
  readonly rawOutputs?: readonly string[];
  readonly problems?: readonly OutputProblem[];
  readonly repeatedCall?: RepeatedCall;
}

export function taskResult(end: AgentTaskEnd, progress: AgentTaskProgress): AgentTaskResult {
  return {
    state: stateOf[end.reason],
    reason: end.reason,
    ...(end.code === undefined ? {} : { code: end.code }),
    ...(end.providerError === undefined ? {} : { providerError: end.providerError }),
    drafts: end.drafts ?? [],
    rawOutputs: end.rawOutputs ?? [],
    problems: end.problems ?? [],
    ...(end.repeatedCall === undefined ? {} : { repeatedCall: end.repeatedCall }),
    ...progress,
  };
}

/** The end of a task stopped through the shared signal by Stop or a shutdown. */
const abortedEnd: AgentTaskEnd = {
  reason: 'aborted',
  code: ERROR_CODES.providerCallCancelled,
};

/** RF-422: the end of a task whose call the budget guard refused, or whose run a cap stopped. */
const capEnd: AgentTaskEnd = { reason: 'cap-reached', code: ERROR_CODES.budgetCapReached };

/** The end of a task that sees the shared signal aborted: a cap stop or any other stop. */
export function stoppedEnd(signal: AbortSignal): AgentTaskEnd {
  return isCapStop(signal.reason) ? capEnd : abortedEnd;
}

/**
 * The end of a task whose model call failed: a stop through the shared signal, a cap refusal of
 * the budget guard (`StoppedByCap`, RST-1600), or a failure with its code (a refusal of the egress
 * guard included). An error without a code is a programming error and is thrown on.
 */
export function failedCallEnd(error: unknown, signal: AbortSignal): AgentTaskEnd {
  if (signal.aborted) return stoppedEnd(signal);
  if (!(error instanceof RosettaError)) throw error;
  if (isCapStop(error)) return capEnd;
  if (error.code === ERROR_CODES.providerCallCancelled) return abortedEnd;
  const providerError: unknown = Reflect.get(error, 'providerError');
  return {
    reason: 'provider-failed',
    code: error.code,
    ...(typeof providerError === 'string' ? { providerError } : {}),
  };
}
