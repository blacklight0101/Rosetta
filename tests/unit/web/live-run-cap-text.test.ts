import { expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { logText } from '../../../web/src/lib/live-run/log-text.js';

// RF-423, RF-1002: the log line of a cap says which role reached its cap, when it was a role cap.

const capEvent = (data: Readonly<Record<string, unknown>>): RunEvent => ({
  seq: 1,
  at: '2026-10-16T10:00:00.000Z',
  runId: 'run-1',
  type: 'budget.capReached',
  agentTaskId: undefined,
  data,
});

it('RF-423 the log line of a role cap names the role and the cap', () => {
  expect(logText(capEvent({ scope: 'role-tokens', role: 'reader', capTokens: 9 }), '')).toBe(
    'reader role-tokens reached its cap',
  );
});

it('RF-422 the log line of a run cap names only the cap', () => {
  expect(logText(capEvent({ scope: 'run-cost', capMicros: 9 }), '')).toBe(
    'run-cost reached its cap',
  );
});
