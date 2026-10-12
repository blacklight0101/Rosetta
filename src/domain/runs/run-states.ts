// Architecture section 5 (state lists), data-model.md section 4 (`runs`): the stages a run can
// have, how a run ends and where it is in the queue. These lists are canonical; the table checks
// and the file schemas repeat them.

export const RUN_STAGES = ['scan', 'understand', 'verify', 'report', 'plan'] as const;
export type RunStage = (typeof RUN_STAGES)[number];

/** How a run ended; set exactly once (RF-003). */
export const RUN_END_STATES = ['Completed', 'CapReached', 'Failed', 'Interrupted'] as const;
export type RunEndState = (typeof RUN_END_STATES)[number];

/** `Queued` -> `Running` when a slot frees; `Running` -> `Ended`; `Queued` -> `Ended` when cancelled. */
export const RUN_QUEUE_STATES = ['Queued', 'Running', 'Ended'] as const;
export type RunQueueState = (typeof RUN_QUEUE_STATES)[number];
