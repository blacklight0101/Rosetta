import { describe, expect, it } from 'vitest';
import { startConsentsOf } from '../../../../src/application/use-cases/consent-use-cases.js';
import {
  ReadProjectConsent,
  WithdrawProjectConsent,
} from '../../../../src/application/use-cases/project-consent-reads.js';
import type { ConsentNeed } from '../../../../src/domain/consent/project-consent.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProjectConsents } from '../../../../src/infrastructure/db/memory-project-consents.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy, userBob } from '../../../support/run-harness.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-143, RF-1105, DEC-209 (P8-81): the consent a page shows as one line. Read answers the consent
// of the project that holds for the roles the page starts (the understand roles, or the planner);
// withdraw marks the consents of the project. Both are scoped by the signed-in user: another user's
// project is not found and nothing of it changes.

const cloud = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  planner: { provider: 'fake', model: 'fake-planner' },
});
const reader: ConsentNeed = { providers: ['anthropic'], kinds: ['cloud'] };

async function setup(settings = cloud) {
  const clock = new FixedClock('2026-11-08T09:00:00.000Z');
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings });
  await projects.insertOrFind(project);
  const consents = startConsentsOf({
    consents: new MemoryProjectConsents(projects),
    ...{ clock, ids: new SequenceIdGenerator() },
  });
  const owner = { actor: userAmy, projectId: project.id };
  return {
    ...{ clock, consents, owner },
    read: new ReadProjectConsent({ projects, consents }),
    withdraw: new WithdrawProjectConsent({ projects, consents }),
  };
}

describe('the consent a page shows (RF-143, P8-81)', () => {
  it('RF-143 P8-81 answers the consent that holds for the understand roles', async () => {
    const { consents, read, owner } = await setup();
    const given = await consents.give.execute({ ...owner, need: reader });

    expect(await read.execute({ ...owner, start: 'understand' })).toEqual({
      ok: true,
      value: given,
    });
  });

  it('RF-143 P8-81 answers none for the planner when the planner is local', async () => {
    const { consents, read, owner } = await setup();
    await consents.give.execute({ ...owner, need: reader });

    expect(await read.execute({ ...owner, start: 'plan' })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('RF-143 P8-81 answers none when no consent holds for the roles', async () => {
    const { read, owner } = await setup();

    expect(await read.execute({ ...owner, start: 'understand' })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("RF-1105 P8-81 another user's project is not found", async () => {
    const { consents, read, owner } = await setup();
    await consents.give.execute({ ...owner, need: reader });

    expect(await read.execute({ ...owner, actor: userBob, start: 'understand' })).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
  });
});

describe('withdrawing the consent a page shows (RF-143, P8-81)', () => {
  it('RF-143 P8-81 withdraw marks the consent and none holds after it', async () => {
    const { consents, read, withdraw, owner } = await setup();
    await consents.give.execute({ ...owner, need: reader });

    expect(await withdraw.execute(owner)).toEqual({ ok: true, value: 1 });

    expect(await read.execute({ ...owner, start: 'understand' })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("RF-1105 P8-81 withdrawing on another user's project is not found and changes nothing", async () => {
    const { consents, read, withdraw, owner } = await setup();
    const given = await consents.give.execute({ ...owner, need: reader });

    expect(await withdraw.execute({ ...owner, actor: userBob })).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });

    expect(await read.execute({ ...owner, start: 'understand' })).toEqual({
      ok: true,
      value: given,
    });
  });
});
