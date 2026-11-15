import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createSuggestOptionsHarness } from '../../support/suggest-options-harness.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { templateSettings } from '../../support/project-fixtures.js';

// RF-435, P9-02, EV-100: the options call of Plan setup under a journey that cannot pay for it
// answers RST-2311 (the journey's way on: Analyse again), not RST-1600 (a project cap's words); a
// project with no journey keeps RST-1600.

const recorded = await loadRecording(
  fileURLToPath(new URL('../../recordings/fake/plan-options.json', import.meta.url)),
);

describe('RF-435 Plan setup options under a journey that is short', () => {
  it('RF-435 P9-02 a journey with a few tokens left refuses the call with RST-2311', async () => {
    const h = await createSuggestOptionsHarness({ recording: recorded });
    await h.journeys.save({
      ...{ userId: h.account.id, projectId: h.project.id, createdAt: 0 },
      approved: { tokens: 10, costMicros: 10 },
    });

    const answer = await h.suggest.execute({
      ...{ actor: h.actor, projectId: h.project.id, cloudConsent: false },
    });

    expect(answer).toEqual({ ok: false, error: ERROR_CODES.journeyAmountUsed });
  });
});

describe('RF-435 a cap that is not the approved line keeps RST-1600', () => {
  it('RF-435 P9-02 a planner token cap under a journey with plenty left answers RST-1600', async () => {
    const h = await createSuggestOptionsHarness({
      recording: recorded,
      settings: {
        ...settingsFor({ planner: { provider: 'fake', model: 'fake-planner' } }),
        budget: { ...templateSettings.budget, roles: { planner: { maxTokens: 10 } } },
      },
      journey: { tokens: 50_000_000, costMicros: 50_000_000 },
    });

    const answer = await h.suggest.execute({
      ...{ actor: h.actor, projectId: h.project.id, cloudConsent: false },
    });

    expect(answer).toEqual({ ok: false, error: ERROR_CODES.budgetCapReached });
  });
});
