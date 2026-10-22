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

/** The caps of the role that makes the call (`budget.roles.<role>`, RF-423); none when unset. */
export interface RoleBudget {
  readonly maxCostMicros?: bigint;
  readonly maxTokens?: bigint;
}

export interface CapInputs {
  readonly run: RunBudget;
  readonly role?: RoleBudget;
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

// RF-422, RF-423, RF-1106
export function capsFor(keySource: KeySource, inputs: CapInputs): readonly UsageCap[] {
  return [...keyCaps(keySource, inputs), ...roleCaps(inputs.role)];
}

function keyCaps(keySource: KeySource, inputs: CapInputs): readonly UsageCap[] {
  const { run, server, account } = inputs;
  const tokens: UsageCap = { kind: 'run-tokens', limit: run.maxTokens };
  switch (keySource) {
    case 'server':
      return [
        { kind: 'run-cost', limit: lower(run.maxCostMicros, server.runMicros) },
        tokens,
        { kind: 'user-day', limit: account.dailyCapMicros ?? server.userDayMicros },
        { kind: 'server-month', limit: server.serverMonthMicros },
      ];
    case 'user': {
      const own = account.ownDailyCapMicros;
      const runCost: UsageCap = { kind: 'run-cost', limit: run.maxCostMicros };
      return own === null ? [runCost, tokens] : [runCost, tokens, { kind: 'own-day', limit: own }];
    }
    case 'none':
      return [{ kind: 'run-cost', limit: run.maxCostMicros }, tokens];
  }
}

/** RF-1106, DEC-107 (P3-91): where a cap comes from. Scaffolding: the behaviour comes in the feat commit. */
export type CapSource = 'project' | 'administrator' | 'account';

/** The caps a run starts with (P3-91). Scaffolding. */
export interface RunStartCaps {
  readonly keySource: KeySource;
  readonly run: { readonly maxCostMicros: bigint; readonly source: 'project' | 'administrator' };
  readonly userDay?: {
    readonly maxCostMicros: bigint;
    readonly source: 'account' | 'administrator';
  };
}

/** RF-1106 (P3-91). Scaffolding: not implemented yet. */
export function runStartCapsOf(keySources: readonly KeySource[], inputs: CapInputs): RunStartCaps {
  throw new Error(
    `P3-91: not implemented for ${String(keySources.length)} roles and ${String(inputs.run.maxCostMicros)}.`,
  );
}
