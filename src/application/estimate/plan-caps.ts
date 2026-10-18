import { capsFor } from '../../domain/budget/budget.js';
import {
  noSpend,
  checkCaps,
  type CapSpent,
  type WorstCase,
} from '../../domain/budget/usage-cap.js';
import { utcPeriodsOf } from '../../domain/budget/utc-periods.js';
import type { AccountUsage, CurrencyTotal } from '../ports/account-usage.js';
import type { Clock } from '../ports/clock.js';
import type { ServerSettings } from '../ports/server-settings.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';
import { roleBudgetOf } from '../projects/role-budget.js';
import type { ByScenario, EstimatePoint, RoleEstimate, Scenario } from './estimate-types.js';
import type { PlanCap } from './plan-estimate-types.js';

// RF-613, RF-422, RF-423, RF-1106, DEC-107: the caps the budget guard checks the planner's call
// against (the same `capsFor` and `checkCaps`), with what is spent against each, so the estimate
// says before the run whether each figure fits. A new run has spent nothing against its own caps;
// the day and month caps count the ledger's USD total of the UTC period. Calls reserved but not yet
// settled are not counted.

export interface PlanCapDependencies {
  readonly users: Pick<UserRepository, 'findById'>;
  readonly serverSettings: Pick<ServerSettings, 'caps'>;
  readonly usage: Pick<AccountUsage, 'userDay' | 'serverMonth'>;
  readonly clock: Clock;
}

function usd(totals: readonly CurrencyTotal[]): bigint {
  return totals
    .filter((total) => total.currency === 'USD')
    .reduce((sum, total) => sum + total.costMicros, 0n);
}

function worstCaseOf(point: EstimatePoint): WorstCase {
  return { micros: point.costMicros, tokens: BigInt(point.inputTokens + point.outputTokens) };
}

async function spentOf(deps: PlanCapDependencies, userId: string): Promise<CapSpent> {
  const periods = utcPeriodsOf(deps.clock.now());
  const [day, month] = await Promise.all([
    deps.usage.userDay(userId, periods.dayStart),
    deps.usage.serverMonth(periods.monthStart),
  ]);
  return {
    ...noSpend,
    'user-day': usd(day.server),
    'own-day': usd(day.own),
    'server-month': usd(month),
  };
}

// RF-613
export async function planCaps(
  deps: PlanCapDependencies,
  project: Project,
  call: Pick<RoleEstimate, 'keySource' | 'points'>,
): Promise<{ readonly caps: readonly PlanCap[]; readonly withinCaps: ByScenario<boolean> }> {
  const { settings } = project;
  const account = await deps.users.findById(project.userId);
  const { run } = settings.budget;
  const caps = capsFor(call.keySource, {
    run: { maxCostMicros: BigInt(run.maxCostMicros), maxTokens: BigInt(run.maxTokens) },
    role: roleBudgetOf(settings, 'planner'),
    server: await deps.serverSettings.caps(),
    account: {
      dailyCapMicros: account?.dailyCapMicros ?? null,
      ownDailyCapMicros: account?.ownDailyCapMicros ?? null,
    },
  });
  const spent = await spentOf(deps, project.userId);
  const fitsUnder = (cap: (typeof caps)[number], scenario: Scenario): boolean =>
    checkCaps([cap], spent, worstCaseOf(call.points[scenario])).ok;
  const listed = caps.map((cap): PlanCap => {
    const already = spent[cap.kind];
    const remaining = cap.limit - already;
    return {
      kind: cap.kind,
      unit: cap.kind.endsWith('tokens') ? 'tokens' : 'micros',
      limit: cap.limit,
      spent: already,
      remaining: remaining < 0n ? 0n : remaining,
      fits: {
        low: fitsUnder(cap, 'low'),
        likely: fitsUnder(cap, 'likely'),
        high: fitsUnder(cap, 'high'),
      },
    };
  });
  const within = (scenario: Scenario): boolean => listed.every((cap) => cap.fits[scenario]);
  return {
    caps: listed,
    withinCaps: { low: within('low'), likely: within('likely'), high: within('high') },
  };
}
