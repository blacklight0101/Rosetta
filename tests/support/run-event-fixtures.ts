import type { RunScope } from '../../src/application/ports/run-events.js';
import type { RunEvent } from '../../src/domain/runs/run-event.js';

// RF-1006: events and run scopes of tests.

const projectId = '00000000-0000-4000-a000-000000000001';
const userId = '00000000-0000-4000-9000-000000000001';

/** A scope for a run key; the id is made from the key so that two scopes never share it. */
export function scopeFor(
  runKey = '20261012-100000-scan',
  overrides: Partial<RunScope> = {},
): RunScope {
  const digits = runKey.replaceAll(/\D/g, '').padEnd(12, '0').slice(-12);
  return { id: `00000000-0000-4000-b000-${digits}`, userId, projectId, runKey, ...overrides };
}

/** The event with that `seq` for the scope's run. */
export function eventFor(
  scope: RunScope,
  seq: number,
  type = 'agent.turn',
  data: Readonly<Record<string, unknown>> = { turn: seq },
): RunEvent {
  return {
    schemaVersion: 1,
    seq,
    at: `2026-10-12T10:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    runId: scope.runKey,
    type,
    data,
  };
}
