import { expect, it } from 'vitest';
import { capReachedText } from '../../../web/src/lib/live-run/cap-text.js';

// RF-422, RF-1106, DEC-107 (P3-91): the message of a cap that stopped a call names the cap that was
// reached, its amount and who can raise it: the project's settings, the administrator (for the run
// cap on server keys or the server's caps) or, for the account's daily cap, the administrator.

it('RF-1106 a run cap of the administrator names the administrator as the one who can raise it', () => {
  expect(
    capReachedText({
      scope: 'run-cost',
      capSource: 'administrator',
      capMicros: 500_000,
      spentMicros: 340_000,
    }),
  ).toBe(
    'The run cap of $0.50, set by the administrator, was reached at $0.34 spent. Only the administrator can raise it.',
  );
});

it('RF-1106 a run cap of the project names the project settings as the place to raise it', () => {
  expect(
    capReachedText({
      scope: 'run-cost',
      capSource: 'project',
      capMicros: 5_000_000,
      spentMicros: 5_000_000,
    }),
  ).toBe(
    'The run cap of $5.00 in the project settings was reached at $5.00 spent. Raise it in the project settings to run further.',
  );
});

it('RF-1106 the daily cap of the account names the administrator for the account', () => {
  expect(
    capReachedText({
      scope: 'user-day',
      capSource: 'account',
      capMicros: 750_000,
      spentMicros: 700_000,
    }),
  ).toBe(
    'Your daily cap of $0.75 on server keys was reached at $0.70 spent today. The administrator can raise it for your account.',
  );
});

it('RF-1106 the server month cap names the administrator as the one who can raise it', () => {
  expect(
    capReachedText({ scope: 'server-month', capMicros: 10_000_000, spentMicros: 10_000_000 }),
  ).toBe("The server's monthly cap of $10.00 was reached. Only the administrator can raise it.");
});

it('RF-422 a role cap names the role and the project settings', () => {
  expect(
    capReachedText({
      role: 'reader',
      scope: 'role-cost',
      capMicros: 300_000,
      spentMicros: 300_000,
    }),
  ).toBe(
    "The reader role's cost cap of $0.30 in the project settings was reached. The other roles go on.",
  );
});

it('RF-429 the readers share of the run cap says what is kept for verifying and how to read further', () => {
  expect(
    capReachedText({
      role: 'reader',
      scope: 'role-tokens',
      capSource: 'reserve',
      capTokens: 1_400_000,
      spentTokens: 1_399_000,
    }),
  ).toBe(
    'The readers stopped at 1400000 tokens, their share of the run cap. The rest is kept to verify the claims they wrote. Raise the run cap in the project settings to read further.',
  );
});

it('RF-429 DEC-193 the claim-check reserve of the run cap says the summary part is kept and how to judge further', () => {
  expect(
    capReachedText({
      role: 'verifier',
      scope: 'run-tokens',
      capSource: 'reserve',
      capTokens: 7_200_000,
      spentTokens: 7_199_000,
    }),
  ).toBe(
    'The claim checks stopped at 7200000 tokens, the run cap less the part kept for the summary. Raise the run cap in the project settings to check the claims left.',
  );
});
