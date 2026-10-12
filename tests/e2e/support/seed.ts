import { fixturePassword } from '../../support/account-fixtures.js';

// FAKE CREDENTIALS ONLY (RNF-003): the account the test server creates at start-up through the
// bootstrap use case (RF-1102). The password is built at run time from harmless pieces and exists
// only in the disposable database of one run. Other roles follow when the user-management use
// cases exist (P1-10).

export const seededAdmin = {
  userName: ['e2e', 'admin'].join('.'),
  password: fixturePassword('E2e'),
} as const;
