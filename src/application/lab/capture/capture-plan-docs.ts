import type { TranscriptTask } from './capture-types.js';

// RF-1404: the capture rules of the plan documents (red stub of the test commit).
export function capturePlanDocInput(promptId: string, task: TranscriptTask): unknown {
  return promptId === task.name ? undefined : undefined;
}
