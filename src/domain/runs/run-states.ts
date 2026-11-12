// Architecture section 5 (state lists), data-model.md section 4 (`runs`): the stages a run can
// have, how a run ends and where it is in the queue. These lists are canonical; the table checks
// and the file schemas repeat them.

export const RUN_STAGES = ['scan', 'understand', 'verify', 'report', 'plan'] as const;
export type RunStage = (typeof RUN_STAGES)[number];

/** How a run ended; set exactly once (RF-003). */
export const RUN_END_STATES = ['Completed', 'CapReached', 'Failed', 'Interrupted'] as const;
export type RunEndState = (typeof RUN_END_STATES)[number];

/**
 * P8-111, DEC-217: why a run ended `Interrupted`: its owner stopped it (`UserStop`), the server
 * restarted or shut down under it (`Restart`), or it was cancelled while queued (`QueueCancel`).
 */
export const RUN_END_REASONS = ['UserStop', 'Restart', 'QueueCancel'] as const;
export type RunEndReason = (typeof RUN_END_REASONS)[number];

/**
 * `Queued` -> `Running` when a slot frees; `Running` -> `Ended`; `Queued` -> `Ended` when cancelled.
 * RF-432, ADR-026: `Running` -> `AwaitingApproval` when the run nears its approved amount; it holds
 * no slot; Continue makes it `Queued` again, Stop ends it `CapReached`.
 */
export const RUN_QUEUE_STATES = ['Queued', 'Running', 'AwaitingApproval', 'Ended'] as const;
export type RunQueueState = (typeof RUN_QUEUE_STATES)[number];

/**
 * RF-201: the states of an agent task; `Planned` -> `Running` -> one of the other six. `Stopped` (P9-04)
 * is a task the user's Stop (or a shutdown) cut short: a stop is no failure.
 */
export type AgentTaskState =
  | ('Planned' | 'Running' | 'Done' | 'TurnLimitReached' | 'InvalidOutput')
  | ('Failed' | 'StoppedByCap' | 'Stopped');

/** RF-006: whether a resume runs a task of this state again (its state, as the manifest stores it). */
const UNFINISHED_TASK_STATES: readonly string[] = [
  'Planned',
  'Running',
  'StoppedByCap',
  'Failed',
  'Stopped',
];

export function isUnfinishedTask(state: string): boolean {
  return UNFINISHED_TASK_STATES.includes(state);
}
