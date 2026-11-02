import type { Run } from '../../domain/runs/run.js';
import { formatInstant } from '../../infrastructure/system/instant.js';

// RF-1108, RF-1105: what the API shows of a run. The owner's id and the snapshot folder never leave
// the server; `runId` is the folder name that the events and the files use.

function instantOrNull(value: number | null): string | null {
  return value === null ? null : formatInstant(value);
}

export function runView(run: Run): Record<string, unknown> {
  return {
    id: run.id,
    projectId: run.projectId,
    runId: run.runKey,
    stage: run.stage,
    queueState: run.queueState,
    endState: run.endState,
    queuedAt: formatInstant(run.queuedAt),
    startedAt: instantOrNull(run.startedAt),
    endedAt: instantOrNull(run.endedAt),
    commitSha: run.commitSha,
    totals: run.totals,
    failedAreas: run.failedAreas,
    unreadAreas: run.unreadAreas,
  };
}
