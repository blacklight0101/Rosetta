import type { Session } from '../../../web/src/api/schemas.js';

// P1-42: wire bodies of the administration API for the page tests.

export const root: Session['user'] = {
  id: 'u-root',
  userName: 'blacklight',
  displayName: 'BlackLigth',
  role: 'admin',
  state: 'Active',
};

export function accountBody(
  id: string,
  userName: string,
  patch: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    userName,
    displayName: `Name of ${userName}`,
    role: 'user',
    state: 'Active',
    createdAt: '2026-10-01T09:00:00.000Z',
    lastSignInAt: '2026-10-11T14:01:00.000Z',
    projects: 0,
    monthToDate: [],
    ...patch,
  };
}

export const cap = (
  runMicros: string,
  userDayMicros: string,
  serverMonthMicros: string,
): { readonly caps: Record<string, string> } => ({
  caps: { runMicros, userDayMicros, serverMonthMicros },
});

export const spent = (costMicros: string): readonly { currency: string; costMicros: string }[] => [
  { currency: 'USD', costMicros },
];
