import { describe, expect, it } from 'vitest';
import { MemoryJourneyRecords } from '../../../../src/infrastructure/db/memory-journey-records.js';
import { actor, setup } from '../../../support/journey-setup.js';

// RF-1021, RF-435: the facts of the journey say how much the owner approved and how much is left, so the
// page can offer the next step with the amount that remains.

describe('GetJourney: the approved amount', () => {
  it('RF-1021 reports the approved amount and what is left of it', async () => {
    const journeys = new MemoryJourneyRecords();
    const { project, seed, journey } = await setup(undefined, journeys);
    await seed();
    await journeys.save({
      ...{ userId: actor.userId, projectId: project.id },
      approved: { tokens: 2_000_000, costMicros: 1_000_000 },
      createdAt: 0,
    });

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({
      ok: true,
      value: { budget: { approvedMicros: 1_000_000, approvedTokens: 2_000_000 } },
    });
  });

  it('RF-1021 reports no amount for a project without a journey record', async () => {
    const { project, seed, journey } = await setup(undefined, new MemoryJourneyRecords());
    await seed();

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({ ok: true, value: { budget: null } });
  });
});
