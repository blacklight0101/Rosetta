import type { FastifyInstance } from 'fastify';
import type {
  BreakdownLine,
  CostBreakdown,
  UsageTotals,
} from '../../application/budget/cost-breakdown.js';
import type { CurrencyTotal } from '../../application/ports/account-usage.js';
import type { GetAccountTotals } from '../../application/use-cases/get-account-totals.js';
import type { CapsView } from '../../application/use-cases/get-caps.js';
import type { GetProjectCost } from '../../application/use-cases/get-project-cost.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-428, RF-1010, RF-1106, RF-1105, DEC-49: the cost ledger as the web UI reads it. Amounts travel
// as decimal strings of micro-units, so none is rounded; tokens as numbers.
// - GET /api/account/totals (every signed-in user): the totals pill of the header, the user's own
//   ledger rows; `server` is the caps and the server-key spend of this UTC month for the
//   administrator, null for anyone else.
// - GET /api/projects/:id/cost: the totals of one of the user's projects and the breakdown by run
//   (a null `runId` is the provider tests), stage, role, provider and model, and `providerTests`,
//   the user's provider tests, which belong to no project and are outside the project totals (null
//   when there are none); another user's id answers 404 like an unknown one.

export interface CostServices {
  readonly getProjectCost: GetProjectCost;
  readonly getAccountTotals: GetAccountTotals;
}

interface IdParams {
  readonly id: string;
}

const moneyView = (money: readonly CurrencyTotal[]): Record<string, string>[] =>
  money.map(({ currency, costMicros }) => ({ currency, costMicros: costMicros.toString() }));

export function totalsView(totals: UsageTotals): Record<string, unknown> {
  return { ...totals, cost: moneyView(totals.cost) };
}

const lineView = (line: BreakdownLine): Record<string, unknown> => ({
  key: line.key,
  local: line.local,
  totals: totalsView(line.totals),
});

function breakdownView(breakdown: CostBreakdown): Record<string, unknown> {
  return {
    totals: totalsView(breakdown.totals),
    byRun: breakdown.byRun.map((line) => ({
      ...lineView(line),
      runId: line.runId,
      firstAt: line.firstAt.toISOString(),
    })),
    byStage: breakdown.byStage.map(lineView),
    byRole: breakdown.byRole.map(lineView),
    byProvider: breakdown.byProvider.map(lineView),
    byModel: breakdown.byModel.map((line) => ({
      ...lineView(line),
      provider: line.provider,
      model: line.model,
    })),
  };
}

function serverView(server: CapsView | undefined): Record<string, unknown> | null {
  if (server === undefined) return null;
  const { caps } = server;
  return {
    caps: {
      runMicros: caps.runMicros.toString(),
      userDayMicros: caps.userDayMicros.toString(),
      serverMonthMicros: caps.serverMonthMicros.toString(),
    },
    serverMonthToDate: moneyView(server.serverMonthToDate),
  };
}

// RF-1010
export function registerCostRoutes(server: FastifyInstance, services: CostServices): void {
  server.get('/api/account/totals', { config: { access: 'user' } }, async (request, reply) => {
    const answer = await services.getAccountTotals.execute({ actor: signedInOf(request).actor });
    return reply.status(200).send({
      totals: totalsView(answer.totals),
      local: answer.local,
      server: serverView(answer.server),
    });
  });

  server.get<{ Params: IdParams }>(
    '/api/projects/:id/cost',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.getProjectCost.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      const { project, breakdown, providerTests } = outcome.value;
      return reply.status(200).send({
        project: { id: project.id, name: project.name },
        ...breakdownView(breakdown),
        providerTests: providerTests === null ? null : lineView(providerTests),
      });
    },
  );
}
