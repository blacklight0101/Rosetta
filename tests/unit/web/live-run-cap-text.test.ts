import { expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { logText } from '../../../web/src/lib/live-run/log-text.js';

// RF-423, RF-422, RF-1002: the log line of a cap says which cap was reached and who can raise it (P3-91).

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
    "The reader role's token cap of 9 tokens in the project settings was reached. The other roles go on.",
  );
});

it('RF-422 the log line of a run cap names only the cap', () => {
  expect(logText(capEvent({ scope: 'run-cost', capMicros: 9 }), '')).toBe(
    'The run cap of <$0.0001 in the project settings was reached. Raise it in the project settings to run further.',
  );
});

it('RF-1002 the verbose log names the claim of a verifier call start and end, not raw data', () => {
  const event = (type: string): RunEvent => ({ ...capEvent({ claimId: 'BR-001.c1' }), type });

  expect(logText(event('verify.claim.started'), '')).toBe('BR-001.c1 sent to the verifier');
  expect(logText(event('verify.claim.callEnded'), '')).toBe('BR-001.c1 verifier call ended');
});
