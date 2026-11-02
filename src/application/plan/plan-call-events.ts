import type { RunEventPublisher } from '../runs/run-event-publisher.js';

// RF-1015, data-model.md section 3.9: `plan.call.started` is emitted before each planner provider call,
// under the agent task of the document being written; `call` is the task id without its `planner-`
// prefix. The page shows the working call and the time since it started from it.

// RF-1015
export async function announcePlannerCall(
  events: RunEventPublisher,
  agentTaskId: string,
): Promise<void> {
  await events.emit(
    'plan.call.started',
    { call: agentTaskId.replace(/^planner-/u, '') },
    agentTaskId,
  );
}
