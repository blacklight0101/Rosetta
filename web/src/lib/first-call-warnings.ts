import type { RunEstimate } from '../api/estimate-schemas.js';
import { effectiveRunCapMicros, usesServerKeys } from './run-cap.js';
import { dollars, tokensText } from './estimate-math.js';

// RF-405, RF-422, RF-1106, DEC-159: the budget guard reserves the worst case of every call in
// flight, so a model whose first parallel reader calls reserve more than a cap leaves is refused
// with CapReached on its first calls. The page says so before the run: it names the cap that is
// short and the amount it needs. The run cap is the one typed on the page; the administrator's
// lower cap, when the server's key is used, still wins (RF-1106). Start stays available.

type FirstCalls = NonNullable<RunEstimate['firstCalls']>;

/** The caps the project settings page holds; the administrator's run cap is not one of them. */
const projectCapKinds: ReadonlySet<string> = new Set(['run-tokens', 'role-cost', 'role-tokens']);

export interface FirstCallWarning {
  readonly id: `first-calls-${string}`;
  readonly text: string;
  /** True when the cap named is one the project settings page holds. */
  readonly projectCaps: boolean;
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
  'run-cost': "Raise the run cap in the project's caps.",
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
function shortCaps(
  estimate: RunEstimate,
  first: FirstCalls,
  runCapMicros: bigint,
): readonly Short[] {
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
    // `runCapMicros` is the effective cap the page passes (run-cap.ts): when it is the
    // administrator's, that is the cap to name and the page cannot raise it.
    const serverKeys = usesServerKeys(estimate);
    const limit = effectiveRunCapMicros({ typed: runCapMicros, administrator: admin, serverKeys });
    const administrator = serverKeys && admin !== undefined && admin <= limit;
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
  const reserved = amount(cap.unit, reservedOf(first, cap.unit));
  return (
    `The caps cannot hold the ${String(first.calls)} first reader ${first.calls === 1 ? 'call' : 'calls'}: they reserve ${reserved} ` +
    `together and the ${name} of ${amount(cap.unit, cap.limit)} is too low (at least ` +
    `${amount(cap.unit, needed)} needed). ${raise}`
  );
}

// RF-405, DEC-159
/**
 * `runCapFromProject`: the run cap the page holds is the project's, not the administrator's binding
 * one (see administratorRunCapBinds in run-cap.ts); it decides the link on a run-cost reservation.
 */
export function firstCallWarnings(
  estimate: RunEstimate,
  runCapMicros: bigint,
  runCapFromProject = true,
): readonly FirstCallWarning[] {
  const first = estimate.firstCalls;
  if (first === undefined || first.calls === 0) return [];
  return shortCaps(estimate, first, runCapMicros).map((cap) => ({
    id: `first-calls-${cap.kind}`,
    text: textOf(first, cap),
    projectCaps: cap.kind === 'run-cost' ? runCapFromProject : projectCapKinds.has(cap.kind),
  }));
}
