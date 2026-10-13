import type { Account, ListedAccount, Money } from '../api/admin-schemas.js';
import { microsToDollars } from '../lib/usd.js';

// RF-1102, RF-1109: how the administration pages write cost and time. Instants are UTC, as the
// server writes them, and are labelled as such in the column headings.

/** The month-to-date cost: dollars with a sign, any other currency by its code, `$0.00` for none. */
export function costText(monthToDate: readonly Money[]): string {
  if (monthToDate.length === 0) return '$0.00';
  return monthToDate
    .map(({ currency, costMicros }) =>
      currency === 'USD'
        ? `$${microsToDollars(costMicros)}`
        : `${microsToDollars(costMicros)} ${currency}`,
    )
    .join(' + ');
}

/** `2026-10-11T14:06:51.000Z` as `2026-10-11 14:06:51`. */
export function secondsText(instant: string): string {
  return instant.slice(0, 'YYYY-MM-DDTHH:MM:SS'.length).replace('T', ' ');
}

/** The last sign-in to the minute, or `never`. */
export function signInText(instant: string | null): string {
  return instant === null ? 'never' : secondsText(instant).slice(0, 'YYYY-MM-DD HH:MM'.length);
}

/** An account after a change: the cost and the project count of the list are kept. */
export function withChange(
  users: readonly ListedAccount[],
  changed: Account,
): readonly ListedAccount[] {
  return users.map((user) => (user.id === changed.id ? { ...user, ...changed } : user));
}

/** A new account starts with no projects, no cost and the server's keys allowed (RF-1104). */
export function withNew(
  users: readonly ListedAccount[],
  created: Account,
): readonly ListedAccount[] {
  return [...users, { ...created, projects: 0, monthToDate: [], serverKeysAllowed: true }];
}

/** The accounts whose user name or display name contains `filter`, ignoring case. */
export function namedLike(
  users: readonly ListedAccount[],
  filter: string,
): readonly ListedAccount[] {
  const wanted = filter.trim().toLocaleLowerCase('en-US');
  if (wanted === '') return users;
  return users.filter((user) =>
    [user.userName, user.displayName].some((name) =>
      name.toLocaleLowerCase('en-US').includes(wanted),
    ),
  );
}
