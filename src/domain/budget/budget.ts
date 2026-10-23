import type { KeySource } from './price-table.js';
import type { UsageCap } from './usage-cap.js';

// DEC-107, RF-422, RF-1106, ADR-007, Q-22 (default: the administrator is under the same caps): which
// caps a call is checked against.
// - With a server key: the run cap is the lower of the project's and the administrator's, the run
//   token cap, the user's daily cap (the administrator's figure for the account, else the server
//   default) and the server's monthly cap.
// - With the user's own key: the project's run caps and the user's own daily cap when set.
// - Without a key (a local model): the project's run caps; its cost is zero but its tokens count.
// - Every key source: the caps of the call's role in the project settings, when set (RF-423).

/** The project's caps for one run (`budget.run` of the project settings). */
interface RunBudget {
  readonly maxCostMicros: bigint;
  readonly maxTokens: bigint;
}

/** The server setting `caps` (data-model.md section 4, `server_settings`). */
export interface ServerCaps {
  readonly runMicros: bigint;
  readonly userDayMicros: bigint;
  readonly serverMonthMicros: bigint;
}

/** The account's own figures (data-model.md section 4, `users`). */
interface AccountCaps {
  /** Set by the administrator for server keys; null = the server default. */
  readonly dailyCapMicros: bigint | null;
  /** Set by the user for their own keys; null = none. */
  readonly ownDailyCapMicros: bigint | null;
}

/** RF-429, EV-27: the share of the run token cap the readers may use; the rest verifies their claims. */
export const READER_SHARE_PERCENT = 70;

/** RF-429, P3-121: the share of the run token cap the verifier may use; the rest is the summariser's. */
export const VERIFIER_SHARE_PERCENT = 20;

/** The caps of the role that makes the call (`budget.roles.<role>`, RF-423); none when unset. */
export interface RoleBudget {
  readonly maxCostMicros?: bigint;
  readonly maxTokens?: bigint;
}

/** The caps of a scope wider than the run, whose room is what the account has left (DEC-107). */
type ScopeKind = 'user-day' | 'own-day' | 'server-month';

function isScope(kind: UsageCap['kind']): kind is ScopeKind {
  return kind === 'user-day' || kind === 'own-day' || kind === 'server-month';
}

/** P5-18: what is already spent against each scope cap when the run starts; none when unknown. */
export type ScopeSpent = Readonly<Partial<Record<ScopeKind, bigint>>>;

export interface CapInputs {
  readonly run: RunBudget;
  readonly role?: RoleBudget;
  /** RF-429: the call's role is a reader, which stops at a share of the run token cap unless it has its own. */
  readonly reader?: boolean;
  /** RF-429: the call's role is the verifier, which stops at its share of the run token cap unless it has its own. */
  readonly verifier?: boolean;
  /** P5-18: the spend of the scope caps at run start, so the readers' share can be taken of their room. */
  readonly scopeSpent?: ScopeSpent;
  readonly server: ServerCaps;
  readonly account: AccountCaps;
}

function lower(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

/** RF-423: the caps of the call's role, added to the caps of its key source. */
function roleCaps(role: RoleBudget | undefined): readonly UsageCap[] {
  const caps: UsageCap[] = [];
  if (role?.maxCostMicros !== undefined)
    caps.push({ kind: 'role-cost', limit: role.maxCostMicros });
  if (role?.maxTokens !== undefined) caps.push({ kind: 'role-tokens', limit: role.maxTokens });
  return caps;
}

/**
 * RF-429: a reader or the verifier with no token cap of its own is held to a share of the run token
 * cap of its key source: the readers to `READER_SHARE_PERCENT`, the verifier to
 * `VERIFIER_SHARE_PERCENT`. What is left (10% at the shipped shares) is the summariser's, which
 * merges the duplicate cards and writes the overview after the claims are judged (P3-121). The share is
 * a role cap, so it stops that role only, never the run (RF-423). It counts tokens only: a share
 * of the cost cap would refuse the first reader calls of models that fit the default cap today
 * (Q-57, DEC-159).
 */
function shareCaps(keys: readonly UsageCap[], percent: number): readonly UsageCap[] {
  return keys
    .filter((cap) => cap.kind === 'run-tokens')
    .map((cap) => ({
      kind: 'role-tokens',
      limit: (cap.limit * BigInt(percent)) / 100n,
      source: 'reserve',
    }));
}

/** The share of the run token cap the call's role gets, when it has one (RF-429). */
function sharePercentOf(inputs: CapInputs): number | undefined {
  if (inputs.reader === true) return READER_SHARE_PERCENT;
  return inputs.verifier === true ? VERIFIER_SHARE_PERCENT : undefined;
}

/**
 * RF-429, P5-18: a reader with no cost cap of its own, whose run is bound by a scope cap (the user's
 * day, the server's month) rather than the run cost cap, is held to `READER_SHARE_PERCENT` of the
 * room that scope has left at run start. The smallest remaining of the three binds; a run whose
 * run cost cap is the smallest gets no such cap and behaves as before. Role cap, so it stops the
 * readers only; the guard still refuses any call over any cap (DEC-112).
 */
function scopeShareCaps(keys: readonly UsageCap[], spent: ScopeSpent): readonly UsageCap[] {
  const runCost = keys.find((cap) => cap.kind === 'run-cost');
  let room: bigint | undefined;
  for (const cap of keys) {
    const used = isScope(cap.kind) ? spent[cap.kind] : undefined;
    if (used === undefined) continue;
    const left = cap.limit > used ? cap.limit - used : 0n;
    room = room === undefined ? left : lower(room, left);
  }
  if (room === undefined || (runCost !== undefined && room >= runCost.limit)) return [];
  return [
    {
      kind: 'role-cost',
      limit: (room * BigInt(READER_SHARE_PERCENT)) / 100n,
      source: 'reserve',
    },
  ];
}

// RF-422, RF-423, RF-429, RF-1106
export function capsFor(keySource: KeySource, inputs: CapInputs): readonly UsageCap[] {
  const keys = keyCaps(keySource, inputs);
  const own = roleCaps(inputs.role);
  const percent = sharePercentOf(inputs);
  const shares: UsageCap[] = [];
  if (percent !== undefined && !own.some((cap) => cap.kind === 'role-tokens')) {
    shares.push(...shareCaps(keys, percent));
  }
  if (
    inputs.reader === true &&
    inputs.scopeSpent !== undefined &&
    !own.some((cap) => cap.kind === 'role-cost')
  ) {
    shares.push(...scopeShareCaps(keys, inputs.scopeSpent));
  }
  return [...keys, ...own, ...shares];
}

function keyCaps(keySource: KeySource, inputs: CapInputs): readonly UsageCap[] {
  const { run, account } = inputs;
  const tokens: UsageCap = { kind: 'run-tokens', limit: run.maxTokens };
  switch (keySource) {
    case 'server': {
      const runCost = runCostOnServer(inputs);
      const day = userDayOnServer(inputs);
      return [
        { kind: 'run-cost', limit: runCost.micros, source: runCost.source },
        tokens,
        { kind: 'user-day', limit: day.micros, source: day.source },
        { kind: 'server-month', limit: inputs.server.serverMonthMicros, source: 'administrator' },
      ];
    }
    case 'user': {
      const own = account.ownDailyCapMicros;
      const runCost: UsageCap = { kind: 'run-cost', limit: run.maxCostMicros, source: 'project' };
      return own === null ? [runCost, tokens] : [runCost, tokens, { kind: 'own-day', limit: own }];
    }
    case 'none':
      return [{ kind: 'run-cost', limit: run.maxCostMicros, source: 'project' }, tokens];
  }
}

/** RF-1106: the run cost on server keys, the lower of the project's cap and the administrator's. */
function runCostOnServer(inputs: CapInputs): {
  readonly micros: bigint;
  readonly source: 'project' | 'administrator';
} {
  const { run, server } = inputs;
  return {
    micros: lower(run.maxCostMicros, server.runMicros),
    source: server.runMicros < run.maxCostMicros ? 'administrator' : 'project',
  };
}

/** RF-1106: the user's day on server keys: the account's cap when the administrator set one. */
function userDayOnServer(inputs: CapInputs): {
  readonly micros: bigint;
  readonly source: 'account' | 'administrator';
} {
  const { account, server } = inputs;
  const own = account.dailyCapMicros;
  return own === null
    ? { micros: server.userDayMicros, source: 'administrator' }
    : { micros: own, source: 'account' };
}

/** The effective caps a run starts with, and the source of each (RF-1106, DEC-107). */
export interface RunStartCaps {
  readonly keySource: KeySource;
  readonly run: { readonly maxCostMicros: bigint; readonly source: 'project' | 'administrator' };
  /** Only with server keys: the day's cap on them. */
  readonly userDay?: {
    readonly maxCostMicros: bigint;
    readonly source: 'account' | 'administrator';
  };
}

/**
 * RF-1106, DEC-107: the caps a run starts with. A role on a server key makes the run a server-key
 * run, and then the administrator's run cap applies when it is lower than the project's.
 */
// RF-1106
export function runStartCapsOf(keySources: readonly KeySource[], inputs: CapInputs): RunStartCaps {
  const keySource = keySourceOfRun(keySources);
  if (keySource !== 'server') {
    return { keySource, run: { maxCostMicros: inputs.run.maxCostMicros, source: 'project' } };
  }
  const run = runCostOnServer(inputs);
  const day = userDayOnServer(inputs);
  return {
    keySource,
    run: { maxCostMicros: run.micros, source: run.source },
    userDay: { maxCostMicros: day.micros, source: day.source },
  };
}

function keySourceOfRun(keySources: readonly KeySource[]): KeySource {
  if (keySources.includes('server')) return 'server';
  return keySources.includes('user') ? 'user' : 'none';
}
