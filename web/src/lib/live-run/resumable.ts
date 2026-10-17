// RF-006: whether a run can be resumed, from what the page knows of it: an understand run that
// stopped at its cap, failed or was interrupted. A run that completed has nothing left to do, and
// a scan has no tasks to resume.

const RESUMABLE_END_STATES: readonly string[] = ['CapReached', 'Failed', 'Interrupted'];

export function isResumable(stage: string, endState: string): boolean {
  return stage === 'understand' && RESUMABLE_END_STATES.includes(endState);
}
