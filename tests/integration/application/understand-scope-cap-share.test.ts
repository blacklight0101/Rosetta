import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ServerCaps } from '../../../src/domain/budget/budget.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { serverKeyText, userKeyText } from '../../support/provider-factory-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-429, RF-422, DEC-112, P5-18: the readers of a run on a server key stop at their share of the
// cap that binds the run, here the administrator's user-day or server-month cost cap, so the claims
// they wrote are judged with what is left. The recording understand-scope-cap.json has a Services
// reader that uses 90,000 input tokens (about 90,000 micro-dollars at the contract model's price) on
// its first call: without the share it spends the day's room and the verifier is refused.

const temp = useTempRoot('rosetta-understand-scope-cap-share-');

const indexSchema = z.object({
  cards: z.array(z.object({ claimCounts: z.record(z.string(), z.number()) })),
});

const roomy = 50_000_000n;
const SCOPE = 293_000n;
const openRoles = understandSettings((settings) => ({
  ...settings,
  roles: Object.fromEntries(
    Object.entries(settings.roles).map(([role, setting]) => [
      role,
      { ...setting, provider: 'openai', model: 'contract-model' },
    ]),
  ) as typeof settings.roles,
  // The run cost and token caps are far away: only the scope cap binds.
  budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 50_000_000 } },
}));

async function underScope(caps: Partial<ServerCaps>, priorSpendMicros?: bigint) {
  const prior =
    priorSpendMicros === undefined
      ? {}
      : { priorSpend: { micros: priorSpendMicros, keySource: 'server' as const } };
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-scope-cap.json',
    verifierRecording: 'verifier-all-supported.json',
    settings: openRoles,
    openAiKey: { of: 'server', key: serverKeyText },
    ...prior,
    serverCaps: {
      runMicros: roomy,
      userDayMicros: roomy,
      serverMonthMicros: roomy,
      ...caps,
    },
  });
  await h.scan();
  const run = await h.understand({ areas: ['Catalog', 'Services'], cloudConsent: true });
  return { h, run };
}

async function judged(h: Awaited<ReturnType<typeof underScope>>['h'], run: { runKey: string }) {
  const file = join(h.runFolder(run as never), 'cards', 'index.json');
  return indexSchema.parse(await readJson(file)).cards.map((card) => card.claimCounts);
}

const SCOPES = [
  ['user-day', { userDayMicros: SCOPE }],
  ['server-month', { serverMonthMicros: SCOPE }],
] as const;

describe.each(SCOPES)(
  'an understand run near the administrator %s cap',
  UNDERSTAND_TIMEOUT,
  (scope, caps) => {
    it(`RF-429 P5-18 the readers stop at their share of the ${scope} cap, not the run`, async () => {
      const { h, run } = await underScope(caps);

      expect(run.endState).toBe('CapReached');
      const manifest = await h.manifestOf(run);
      expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
        ['Catalog', 'Done'],
        ['Services', 'StoppedByCap'],
      ]);
      const events = await h.eventsOf(run);
      const capEvents = events.filter((event) => event.type === 'budget.capReached');
      expect(capEvents.map((event) => event.data)).toMatchObject([
        { scope: 'role-cost', role: 'reader', capSource: 'reserve' },
      ]);
      expect(events.at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.budgetCapReached });
    });
  },
);

describe.each(SCOPES)(
  'the claims of a run near the administrator %s cap',
  UNDERSTAND_TIMEOUT,
  (scope, caps) => {
    it(`RF-429 P5-18 the claims the readers wrote are judged before the ${scope} cap stops the run`, async () => {
      const { h, run } = await underScope(caps);

      expect(await judged(h, run)).toEqual([
        expect.objectContaining({ Proposed: 0, Unverified: 0, Supported: 1 }),
      ]);
    });
  },
);

describe.each(SCOPES)(
  'the spend of a run near the administrator %s cap',
  UNDERSTAND_TIMEOUT,
  (scope, caps) => {
    it(`DEC-112 the ${scope} cap is never passed`, async () => {
      const { h } = await underScope(caps);

      const spent = h.providers.ledger.entries.reduce((sum, entry) => sum + entry.costMicros, 0n);
      expect(spent).toBeLessThanOrEqual(SCOPE);
    });
  },
);

describe(
  'an understand run near a scope cap that part of is already spent',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-429 P5-18 the share is of what the day has left at run start, not of the whole cap', async () => {
      const earlier = 100_000n;
      const { h, run } = await underScope({ userDayMicros: SCOPE + earlier }, earlier);

      expect(run.endState).toBe('CapReached');
      const manifest = await h.manifestOf(run);
      expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
        ['Catalog', 'Done'],
        ['Services', 'StoppedByCap'],
      ]);
      const capEvents = (await h.eventsOf(run)).filter(
        (event) => event.type === 'budget.capReached',
      );
      expect(capEvents.map((event) => event.data)).toMatchObject([
        { scope: 'role-cost', role: 'reader', capSource: 'reserve' },
      ]);
      expect(await judged(h, run)).toEqual([expect.objectContaining({ Supported: 1 })]);
    });
  },
);

describe('an understand run on the user own key near the own daily cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-429 P5-18 the readers stop at their share of what the own-day cap has left', async () => {
    const earlier = 100_000n;
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-scope-cap.json',
      verifierRecording: 'verifier-all-supported.json',
      settings: openRoles,
      openAiKey: { of: 'user', key: userKeyText },
      ownDailyCapMicros: SCOPE + earlier,
      priorSpend: { micros: earlier, keySource: 'user' },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'], cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    const capEvents = (await h.eventsOf(run)).filter((event) => event.type === 'budget.capReached');
    expect(capEvents.map((event) => event.data)).toMatchObject([
      { scope: 'role-cost', role: 'reader', capSource: 'reserve' },
    ]);
    expect(await judged(h, run)).toEqual([expect.objectContaining({ Supported: 1 })]);
  });
});

describe('a resumed understand run near a scope cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-429 RF-006 P5-18 the next day the readers go on: their earlier spend does not count against the new share', async () => {
    const { h, run } = await underScope({ userDayMicros: SCOPE });
    expect(run.endState).toBe('CapReached');
    h.stores.clock.advance(24 * 60 * 60 * 1000);

    const resumed = await h.resume(run);

    expect(resumed.ok).toBe(true);
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
      ['Catalog', 'Done'],
      ['Services', 'Done'],
    ]);
    expect(await judged(h, run)).toEqual([expect.objectContaining({ Unverified: 0 })]);
  });
});

describe('an understand run whose run cap binds', UNDERSTAND_TIMEOUT, () => {
  it('RF-429 P5-18 a scope cap far above the run cap adds no cost share: the readers stop only by the token share', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      verifierRecording: 'verifier-all-supported.json',
      settings: understandSettings((settings) => ({
        ...settings,
        roles: openRoles.roles,
        budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 293_000 } },
      })),
      openAiKey: { of: 'server', key: serverKeyText },
      serverCaps: { runMicros: roomy, userDayMicros: roomy, serverMonthMicros: roomy },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'], cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    const capEvents = (await h.eventsOf(run)).filter((event) => event.type === 'budget.capReached');
    expect(capEvents).toEqual([]);
    // P5-20: the readers' share has no room for another call, so no task starts to be refused.
    const stops = (await h.eventsOf(run)).filter((event) => event.type === 'budget.readersStopped');
    expect(stops.map((event) => event.data)).toMatchObject([{ reason: 'share' }]);
  });
});
