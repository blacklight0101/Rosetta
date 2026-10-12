import type { AccountTotals, ProjectCost, UsageTotals } from '../../../web/src/api/cost-schemas.js';

// RF-428, RF-1010, RF-1106, P1-36: answers of the cost routes for the page tests.

export function usageTotals(overrides: Partial<UsageTotals> = {}): UsageTotals {
  return {
    calls: 3,
    inputTokens: 1_200_000,
    outputTokens: 80_000,
    cachedInputTokens: 22_118,
    cost: [{ currency: 'USD', costMicros: '3880000' }],
    unknownCostCalls: 0,
    priceTableVersions: ['2026-10-11'],
    ...overrides,
  };
}

export const userTotals: AccountTotals = { totals: usageTotals(), server: null };

/** The administrator's answer: $8.50 of the server's $10.00 this month (85%). */
export function adminTotals(serverMicros = '8500000'): AccountTotals {
  return {
    totals: usageTotals(),
    server: {
      caps: { runMicros: '500000', userDayMicros: '1000000', serverMonthMicros: '10000000' },
      serverMonthToDate: [{ currency: 'USD', costMicros: serverMicros }],
    },
  };
}

const local = usageTotals({ cost: [{ currency: 'USD', costMicros: '0' }], calls: 1 });

export const projectCost: ProjectCost = {
  project: { id: 'p-1', name: 'octo/webforms' },
  totals: usageTotals(),
  byRun: [
    {
      key: 'r-1',
      runId: 'r-1',
      firstAt: '2026-10-12T10:00:00.000Z',
      local: false,
      totals: usageTotals({ calls: 2 }),
    },
  ],
  byStage: [{ key: 'understand', local: false, totals: usageTotals() }],
  byRole: [{ key: 'reader', local: false, totals: usageTotals() }],
  byProvider: [
    { key: 'ollama', local: true, totals: local },
    { key: 'openai', local: false, totals: usageTotals({ unknownCostCalls: 1 }) },
  ],
  byModel: [
    {
      key: 'ollama gemma4:e4b',
      provider: 'ollama',
      model: 'gemma4:e4b',
      local: true,
      totals: local,
    },
  ],
  providerTests: {
    key: 'provider-tests',
    local: false,
    totals: usageTotals({ calls: 2, cost: [{ currency: 'USD', costMicros: '7' }] }),
  },
};
