import type { RunEstimate } from '../api/estimate-schemas.js';
import { dollars, tokensText } from './estimate-math.js';

// RF-405, RF-422, RF-1106, DEC-159: the budget guard reserves the worst case of every call in
// flight, so a model whose first parallel reader calls reserve more than a cap leaves is refused
// with CapReached on its first calls. The page says so before the run: it names the cap that is
// short and the amount it needs. The run cap is the one typed on the page; the administrator's
// lower cap, when the server's key is used, still wins (RF-1106). Start stays available.

type FirstCalls = NonNullable<RunEstimate['firstCalls']>;

export interface FirstCallWarning {
  readonly id: `first-calls-${string}`;
  readonly text: string;
}

const capNames: Readonly<Record<string, string>> = {
  'run-cost': 'run cap',
  'run-tokens': 'run token cap',
  'role-cost': "reader's cost cap",
  'role-tokens': "reader's token cap",
  'user-day': 'daily cap',
  'own-day': 'daily cap on your own keys',
  'server-month': "server's monthly cap",
};

const raising: Readonly<Record<string, string>> = {
  'run-cost': 'Raise the run cap above.',
  'run-tokens': "Raise the run token cap in the project's caps.",
  'role-cost': "Raise the reader's cost cap in the project's caps.",
  'role-tokens': "Raise the reader's token cap in the project's caps.",
  'user-day': 'Ask an administrator to raise your daily cap.',
  'own-day': 'Raise your daily cap on your own keys in Settings and keys.',
  'server-month': "Ask an administrator to raise the server's monthly cap.",
};

function amount(unit: 'micros' | 'tokens', value: bigint): string {
  return unit === 'micros' ? dollars(value) : tokensText(value);
}

interface Short {
  readonly kind: string;
  readonly unit: 'micros' | 'tokens';
  readonly limit: bigint;
  readonly spent: bigint;
  readonly administrator: boolean;
}

/** The caps that cannot hold the reservation; the run cap is judged against the one typed. */
function shortCaps(first: FirstCalls, runCapMicros: bigint): readonly Short[] {
  const admin = first.adminRunCapMicros === null ? undefined : BigInt(first.adminRunCapMicros);
  const reserved = BigInt(first.reservedMicros);
  return first.caps.flatMap((cap): Short[] => {
    const { kind, unit } = cap;
    const spent = BigInt(cap.spent);
    if (kind !== 'run-cost') {
      return cap.fits
        ? []
        : [{ kind, unit, limit: BigInt(cap.limit), spent, administrator: false }];
    }
    const administrator = admin !== undefined && admin < runCapMicros;
    const limit = administrator ? admin : runCapMicros;
    return reserved > limit ? [{ kind, unit, limit, spent, administrator }] : [];
  });
}

function reservedOf(first: FirstCalls, unit: 'micros' | 'tokens'): bigint {
  return BigInt(unit === 'micros' ? first.reservedMicros : first.reservedTokens);
}

function textOf(first: FirstCalls, cap: Short): string {
  const needed = reservedOf(first, cap.unit) + cap.spent;
  const name = cap.administrator ? "administrator's run cap" : (capNames[cap.kind] ?? cap.kind);
  const raise = cap.administrator
    ? 'The page cannot raise it: ask an administrator to raise the run cap.'
    : (raising[cap.kind] ?? '');
  return (
    `The caps cannot hold the model's ${String(first.calls)} first reader calls: each one reserves ` +
    `its worst case up front, together ${amount(cap.unit, reservedOf(first, cap.unit))}, and the ` +
    `${name} of ${amount(cap.unit, cap.limit)} cannot take it (at least ` +
    `${amount(cap.unit, needed)} is needed). ${raise} Start stays available; the run then ` +
    `ends cleanly with CapReached.`
  );
}

// RF-405, DEC-159
export function firstCallWarnings(
  estimate: RunEstimate,
  runCapMicros: bigint,
): readonly FirstCallWarning[] {
  const first = estimate.firstCalls;
  if (first === undefined || first.calls === 0) return [];
  return shortCaps(first, runCapMicros).map((cap) => ({
    id: `first-calls-${cap.kind}`,
    text: textOf(first, cap),
  }));
}
