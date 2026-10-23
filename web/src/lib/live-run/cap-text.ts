import { dollars } from '../estimate-math.js';

// RF-422, RF-1106, DEC-107 (P3-91): the words of a cap that stopped a call. The cap that was reached
// is named with its amount, and the place that can raise it: the project's settings, the
// administrator (a run cap set by the administrator, the server's caps) or, for the account's daily
// cap, the administrator for the account. An event without the fields it needs names the scope only.

function micros(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? dollars(BigInt(Math.trunc(value)))
    : undefined;
}

function tokens(value: unknown): string {
  return typeof value === 'number' ? `${String(value)} tokens` : 'an unknown number of tokens';
}

function runCostText(data: Readonly<Record<string, unknown>>): string {
  const cap = micros(data['capMicros']) ?? 'its amount';
  const spent = micros(data['spentMicros']);
  const reached = spent === undefined ? '' : ` at ${spent} spent`;
  if (data['capSource'] === 'administrator') {
    return `The run cap of ${cap}, set by the administrator, was reached${reached}. Only the administrator can raise it.`;
  }
  return `The run cap of ${cap} in the project settings was reached${reached}. Raise it in the project settings to run further.`;
}

function dayText(data: Readonly<Record<string, unknown>>, subject: string): string {
  const cap = micros(data['capMicros']) ?? 'its amount';
  const spent = micros(data['spentMicros']);
  const reached = spent === undefined ? '' : ` at ${spent} spent today`;
  return `Your daily cap of ${cap} on ${subject} was reached${reached}.`;
}

function userDayText(data: Readonly<Record<string, unknown>>): string {
  const text = dayText(data, 'server keys');
  return data['capSource'] === 'account'
    ? `${text} The administrator can raise it for your account.`
    : `${text} The administrator can raise it.`;
}

/** RF-429: the readers' share of the run cap, kept apart from a cap the project set for the role. */
function reserveText(data: Readonly<Record<string, unknown>>): string {
  const cap =
    data['scope'] === 'role-tokens'
      ? tokens(data['capTokens'])
      : (micros(data['capMicros']) ?? 'its amount');
  return (
    `The readers stopped at ${cap}, their share of the run cap. The rest is kept to verify the claims they wrote. ` +
    'Raise the run cap in the project settings to read further.'
  );
}

function roleText(data: Readonly<Record<string, unknown>>): string {
  if (data['capSource'] === 'reserve') return reserveText(data);
  const role = typeof data['role'] === 'string' ? data['role'] : 'a';
  const cap =
    data['scope'] === 'role-tokens'
      ? tokens(data['capTokens'])
      : (micros(data['capMicros']) ?? 'its amount');
  const kind = data['scope'] === 'role-tokens' ? 'token' : 'cost';
  return `The ${role} role's ${kind} cap of ${cap} in the project settings was reached. The other roles go on.`;
}

/** The message of a `budget.capReached` event: the cap, its amount and who can raise it (RF-1106). */
export function capReachedText(data: Readonly<Record<string, unknown>>): string {
  switch (data['scope']) {
    case 'run-cost':
      return runCostText(data);
    case 'run-tokens':
      return `The run token cap of ${tokens(data['capTokens'])} was reached. Raise it in the project settings to run further.`;
    case 'role-cost':
    case 'role-tokens':
      return roleText(data);
    case 'user-day':
      return userDayText(data);
    case 'own-day':
      return `${dayText(data, 'your own keys')} Raise it in your settings.`;
    case 'server-month':
      return `The server's monthly cap of ${micros(data['capMicros']) ?? 'its amount'} was reached. Only the administrator can raise it.`;
    default:
      return `A ${String(data['scope'])} cap was reached.`;
  }
}
