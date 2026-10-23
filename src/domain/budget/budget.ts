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

/** RF-429, EV-27: the share of the run caps the readers may use; the rest verifies their claims. */
export const READER_SHARE_PERCENT = 70;

/** The caps of the role that makes the call (`budget.roles.<role>`, RF-423); none when unset. */
export interface RoleBudget {
  readonly maxCostMicros?: bigint;
  readonly maxTokens?: bigint;
}

export interface CapInputs {
  readonly run: RunBudget;
  readonly role?: RoleBudget;
  /** RF-429: the call's role is a reader, which stops at a share of the run caps unless it has its own. */
  readonly reader?: boolean;
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
 * RF-429: a reader with no cap of its own is held to a share of the run caps of its key source, so
 * the run keeps what the verifier needs for the claims the readers wrote. The share is a role cap,
 * so it stops the readers only, never the run (RF-423).
 */
function readerShareCaps(keys: readonly UsageCap[]): readonly UsageCap[] {
  const share = (cap: UsageCap): bigint => (cap.limit * BigInt(READER_SHARE_PERCENT)) / 100n;
  const caps: UsageCap[] = [];
  for (const cap of keys) {
    if (cap.kind === 'run-cost')
      caps.push({ kind: 'role-cost', limit: share(cap), source: 'reserve' });
    if (cap.kind === 'run-tokens')
      caps.push({ kind: 'role-tokens', limit: share(cap), source: 'reserve' });
  }
  return caps;
}

// RF-422, RF-423, RF-429, RF-1106
export function capsFor(keySource: KeySource, inputs: CapInputs): readonly UsageCap[] {
  const keys = keyCaps(keySource, inputs);
  const own = roleCaps(inputs.role);
  if (inputs.reader !== true || own.length > 0) return [...keys, ...own];
  return [...keys, ...readerShareCaps(keys)];
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
