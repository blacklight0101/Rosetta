import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { stackLayers } from '../../../src/domain/planning/planning-brief.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { answerRecording } from '../../support/plan-options-harness.js';
import { cardSaying } from '../../support/plan-cards.js';
import { seedPlanSource } from '../../support/plan-source-seed.js';
import { sampleRun } from '../../support/run-fixtures.js';
import {
  createSuggestOptionsHarness,
  type SuggestOptionsHarness,
  type SuggestOptionsOptions,
} from '../../support/suggest-options-harness.js';

// RF-608, RF-609, RF-143, RF-1105, ADR-007: Plan setup asks for its options. The planner is built by
// the real guarded provider factory and replays a recording; the cards are the real card files of
// an understand run. The call belongs to the project and to no run.

const recorded = await loadRecording(
  fileURLToPath(new URL('../../recordings/fake/plan-options.json', import.meta.url)),
);

function harness(options: Partial<SuggestOptionsOptions> = {}) {
  return createSuggestOptionsHarness({ recording: recorded, ...options });
}

function ask(h: SuggestOptionsHarness, cloudConsent = false) {
  return h.suggest.execute({ actor: h.actor, projectId: h.project.id, cloudConsent });
}

describe('SuggestPlanOptions: the options', () => {
  it('RF-608 RF-609 gives two styles with evidence, one recommended, and two options for every layer', async () => {
    const h = await harness();

    const result = await ask(h);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { architecture, stack } = result.value;
    expect(architecture.recommended).toBe('layered');
    expect(architecture.options.map((option) => option.style)).toEqual([
      ...['layered', 'modular-monolith'],
    ]);
    expect(architecture.options.every((option) => option.evidence.length > 0)).toBe(true);
    expect(stack.map((each) => each.layer)).toEqual([...stackLayers]);
  });

  it('ADR-007 the call is booked to the project at stage plan, to no run', async () => {
    const h = await harness();

    await ask(h);

    const entries = h.factory.ledger.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      ...{ userId: h.account.id, projectId: h.project.id, runId: null },
      ...{ stage: 'plan', role: 'planner' },
    });
  });

  it('RF-604 only supported claims are sent: a rejected claim never reaches the planner', async () => {
    const h = await harness();

    await ask(h);

    const message = h.factory.fakes.get('fake')?.requests[0]?.messages[0];
    const sent = message?.role === 'user' ? message.content : '';
    expect(sent).toContain('Checkout creates an order from the basket.');
    expect(sent).not.toContain('Checkout emails the warehouse.');
  });
});

describe('SuggestPlanOptions: what stops it', () => {
  it('RF-143 a cloud planner without the consent is refused before any call', async () => {
    const settings = settingsFor({ planner: { provider: 'openai', model: 'contract-model' } });
    const h = await harness({ settings, serverKeys: { openai: 'sk-server' } });

    const result = await ask(h, false);

    expect(result).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect(h.factory.fakes.get('openai')?.requests ?? []).toHaveLength(0);
    expect(h.factory.ledger.entries).toHaveLength(0);
  });

  it("RF-1105 another user's project and an unknown id are not found", async () => {
    const h = await harness();
    const stranger = { userId: '00000000-0000-4000-9000-0000000000ff', role: 'user' } as const;

    const theirs = await h.suggest.execute({
      actor: stranger,
      projectId: h.project.id,
      cloudConsent: false,
    });
    const unknown = await h.suggest.execute({
      actor: h.actor,
      projectId: sampleProject().id,
      cloudConsent: false,
    });

    expect(theirs).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});

describe('SuggestPlanOptions: what the project lacks', () => {
  it('RST-1802 a project without a finished understand run has nothing to recommend from', async () => {
    const h = await harness({ seed: { understand: false } });

    expect(await ask(h)).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });

  it('RST-1802 an understand run with no supported claim makes no call', async () => {
    const h = await harness({ seed: { cards: [] } });

    expect(await ask(h)).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
    expect(h.factory.ledger.entries).toHaveLength(0);
  });

  it('RST-1203 a project without a finished scan has no code map to read', async () => {
    const h = await harness({ scan: false });

    expect(await ask(h)).toEqual({ ok: false, error: ERROR_CODES.codeMapMissing });
  });

  it('RST-1800 an answer that is not options is a typed problem, not an exception', async () => {
    const h = await harness({ recording: answerRecording('I would rather not say.') });

    expect(await ask(h)).toEqual({ ok: false, error: ERROR_CODES.planOptionsInvalid });
  });
});

describe('SuggestPlanOptions: which understand run it reads', () => {
  const sentTo = (h: SuggestOptionsHarness): string => {
    const message = h.factory.fakes.get('fake')?.requests[0]?.messages[0];
    return message?.role === 'user' ? message.content : '';
  };

  it('RF-608 reads the newest completed understand run, not an older one', async () => {
    const h = await harness();
    await seedPlanSource(h.stores, h.project, {
      brief: false,
      cards: [cardSaying('BR-077', 'Refunds are paid by hand.')],
      run: { runKey: '20261012-100000-understand' },
    });

    await ask(h);

    expect(sentTo(h)).toContain('Refunds are paid by hand.');
    expect(sentTo(h)).not.toContain('Checkout creates an order from the basket.');
  });

  it.each([
    ['still running', { queueState: 'Running', endState: null } as const],
    ['failed', { queueState: 'Ended', endState: 'Failed' } as const],
  ])(
    'RF-608 skips a newer understand run that is %s: its cards are not verified',
    async (_n, run) => {
      const h = await harness();
      await seedPlanSource(h.stores, h.project, {
        brief: false,
        cards: [cardSaying('BR-078', 'Unfinished run claim.')],
        run: { runKey: '20261012-100000-understand', ...run },
      });

      await ask(h);

      expect(sentTo(h)).toContain('Checkout creates an order from the basket.');
      expect(sentTo(h)).not.toContain('Unfinished run claim.');
    },
  );
});

describe('SuggestPlanOptions: the chosen source run (RF-614)', () => {
  const sentTo = (h: SuggestOptionsHarness): string => {
    const message = h.factory.fakes.get('fake')?.requests[0]?.messages[0];
    return message?.role === 'user' ? message.content : '';
  };

  function askFrom(h: SuggestOptionsHarness, sourceRunId: string) {
    return h.suggest.execute({
      ...{ actor: h.actor, projectId: h.project.id, cloudConsent: false, sourceRunId },
    });
  }

  it('RF-614 RF-608 recommends from the chosen run, not the newest', async () => {
    const h = await harness({ seed: { understand: false } });
    const older = await seedPlanSource(h.stores, h.project, {
      brief: false,
      run: { runKey: '20261010-090000-understand' },
    });
    await seedPlanSource(h.stores, h.project, {
      brief: false,
      cards: [cardSaying('BR-077', 'Refunds are paid by hand.')],
      run: { runKey: '20261012-100000-understand' },
    });

    const result = await askFrom(h, older?.id ?? '');

    expect(result.ok).toBe(true);
    expect(sentTo(h)).toContain('Checkout creates an order from the basket.');
    expect(sentTo(h)).not.toContain('Refunds are paid by hand.');
  });
});

describe('SuggestPlanOptions: a chosen source run that cannot be used (RF-614)', () => {
  function askFrom(h: SuggestOptionsHarness, sourceRunId: string) {
    return h.suggest.execute({
      ...{ actor: h.actor, projectId: h.project.id, cloudConsent: false, sourceRunId },
    });
  }

  it('RST-1802 refuses a chosen run that ended CapReached, making no call', async () => {
    const h = await harness();
    const stopped = await seedPlanSource(h.stores, h.project, {
      brief: false,
      run: { runKey: '20261012-100000-understand', endState: 'CapReached' },
    });

    const result = await askFrom(h, stopped?.id ?? '');

    expect(result).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
    expect(h.factory.ledger.entries).toHaveLength(0);
  });

  it('RF-1105 an unknown run id is not found, making no call', async () => {
    const h = await harness();

    const result = await askFrom(h, sampleRun().id);

    expect(result).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(h.factory.ledger.entries).toHaveLength(0);
  });
});

describe('SuggestPlanOptions: how long the call may run', () => {
  it('Q-60 limits the call by the timeout of the planner provider and its attempts, not by 120 s', async () => {
    const base = settingsFor({ planner: { provider: 'fake', model: 'fake-planner' } });
    const fake = base.providers['fake'];
    if (fake === undefined) throw new Error('the template has no fake provider');
    const settings = {
      ...base,
      providers: { ...base.providers, fake: { ...fake, timeoutSeconds: 200, maxRetries: 2 } },
    };
    const limits: number[] = [];
    const signals = {
      after: (milliseconds: number) => {
        limits.push(milliseconds);
        return new AbortController().signal;
      },
    };
    const h = await harness({ settings, signals });

    await ask(h);

    expect(limits).toEqual([200_000 * 3]);
  });
});
