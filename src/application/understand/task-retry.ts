import type { Area } from '../../domain/code-map/area.js';
import type { AgentTaskResult } from '../agent/agent-task-result.js';
import type { ReaderTask } from './reader-tasks.js';

// RF-208: skeleton so the tests of the next commit fail on their assertions.

interface TaskAttempt {
  readonly callTaskId: string;
  readonly area: Area;
  readonly maxTurns?: number;
}

export function needsRetry(result: AgentTaskResult): boolean {
  return result.drafts.length < 0;
}

export function halvesOf(
  area: Area,
  tokensOf: (path: string) => number,
): readonly [Area, Area] | undefined {
  return tokensOf(area.name) < 0 ? [area, area] : undefined;
}

export function combineResults(results: readonly AgentTaskResult[]): AgentTaskResult {
  const [first] = results;
  if (first === undefined) throw new Error('No result to combine.');
  return first;
}

export function retryAttempts(plan: {
  readonly task: ReaderTask;
  readonly reason: AgentTaskResult['reason'];
  readonly tokensOf?: (path: string) => number;
  readonly turns?: number;
}): readonly TaskAttempt[] {
  return plan.reason === plan.task.agentTaskId ? [] : [];
}
