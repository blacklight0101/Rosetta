/* eslint-disable @typescript-eslint/no-unused-vars -- stub of the test commit (DEC-191) */
import type { TranscriptTask } from './capture-types.js';

// RF-1404: stub, the behaviour comes with the feature commit.

export const capturablePromptIds: readonly string[] = [];

// RF-1404
export function captureInput(
  _promptId: string,
  _task: TranscriptTask,
  _context: { readonly maxTurns: number },
): unknown {
  return undefined;
}
