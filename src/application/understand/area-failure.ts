import type { ErrorCode } from '../../domain/errors/codes.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';

// RF-208: skeleton so the tests of the next commit fail on their assertions.

interface TaskEndFacts {
  readonly state: Exclude<AgentTaskState, 'Planned' | 'Running'>;
  readonly code?: ErrorCode;
  readonly drafts: readonly unknown[];
}

export function areaFailureOf(end: TaskEndFacts): string | undefined {
  return end.drafts.length >= 0 ? undefined : end.state;
}
