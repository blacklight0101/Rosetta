import type { RunScope } from '../ports/run-events.js';
import type { Run } from '../../domain/runs/run.js';

// RF-1006: where a run's events and manifest live and who may watch them.
export function scopeOf(run: Run): RunScope {
  return { id: run.id, userId: run.userId, projectId: run.projectId, runKey: run.runKey };
}
