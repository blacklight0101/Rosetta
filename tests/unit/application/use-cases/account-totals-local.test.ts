import { expect, it } from 'vitest';
import type { CapsView } from '../../../../src/application/use-cases/get-caps.js';
import { GetAccountTotals } from '../../../../src/application/use-cases/get-account-totals.js';
import { MemoryCostTotals } from '../../../../src/infrastructure/db/memory-cost-totals.js';
import { costEntry } from '../../../support/cost-fixtures.js';

// RF-1010, P5-07: the header total says "local" only when every call of the user ran on a local
// model; a priced call, or no call at all, keeps the dollars as before.

const amy = { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' } as const;
const capsView: CapsView = {
  caps: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  serverMonthToDate: [],
};

const answerOf = (costs: MemoryCostTotals) =>
  new GetAccountTotals({ costs, caps: { execute: () => Promise.resolve(capsView) } }).execute({
    actor: amy,
  });

it('P5-07 the account is local when every call of the user ran on a local model', async () => {
  const costs = new MemoryCostTotals();
  costs.add(costEntry(amy.userId, { keySource: 'none', costMicros: 0n }));
  costs.add(costEntry(amy.userId, { keySource: 'none', costMicros: 0n }));

  expect((await answerOf(costs)).local).toBe(true);
});

it('P5-07 one priced call makes the account priced, so its total keeps dollars', async () => {
  const costs = new MemoryCostTotals();
  costs.add(costEntry(amy.userId, { keySource: 'none', costMicros: 0n }));
  costs.add(costEntry(amy.userId, { keySource: 'user' }));

  expect((await answerOf(costs)).local).toBe(false);
});

it('P5-07 an account with no calls keeps dollars as before', async () => {
  expect((await answerOf(new MemoryCostTotals())).local).toBe(false);
});
