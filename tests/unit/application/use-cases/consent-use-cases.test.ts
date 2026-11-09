import { describe, expect, it } from 'vitest';
import { consentNeedOf } from '../../../../src/application/consent/consent-need.js';
import {
  GiveConsent,
  HeldConsent,
  WithdrawConsent,
} from '../../../../src/application/use-cases/consent-use-cases.js';
import type { ConsentNeed } from '../../../../src/domain/consent/project-consent.js';
import { MemoryProjectConsents } from '../../../../src/infrastructure/db/memory-project-consents.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { heldZip } from '../../../support/upload-run-fixtures.js';

// RF-143, RF-142, RF-132, DEC-209: the consent use cases. Give stores a consent naming the
// providers and kinds a start needs; the consent that holds is the newest one not withdrawn, given
// less than 30 days ago, that names them all; withdraw marks every consent of the project.

const day = 24 * 60 * 60 * 1000;
const need: ConsentNeed = { providers: ['anthropic'], kinds: ['cloud'] };

async function setup() {
  const clock = new FixedClock('2026-11-08T09:00:00.000Z');
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId });
  await projects.insertOrFind(project);
  const consents = new MemoryProjectConsents(projects);
  const deps = { consents, clock, ids: new SequenceIdGenerator() };
  const owner = { actor: userAmy, projectId: project.id };
  return {
    ...{ clock, consents, owner },
    give: new GiveConsent(deps),
    held: new HeldConsent(deps),
    withdraw: new WithdrawConsent(deps),
  };
}

describe('the consent use cases (RF-143, DEC-209)', () => {
  it('RF-143 give stores a consent naming the providers and kinds, given now', async () => {
    const { give, consents, owner, clock } = await setup();

    const given = await give.execute({ ...owner, need });

    expect(given).toMatchObject({
      ...{ userId: userAmy.userId, projectId: owner.projectId },
      ...{ providers: ['anthropic'], kinds: ['cloud'], withdrawnAt: null },
      givenAt: clock.now().getTime(),
    });
    expect(await consents.list(userAmy.userId, owner.projectId)).toEqual([given]);
  });

  it('RF-143 the consent given holds for the same need, and none holds before', async () => {
    const { give, held, owner } = await setup();

    expect(await held.execute({ ...owner, need })).toBeUndefined();
    const given = await give.execute({ ...owner, need });

    expect(await held.execute({ ...owner, need })).toEqual(given);
  });

  it('RF-143 a consent no longer holds 30 days after it was given', async () => {
    const { give, held, owner, clock } = await setup();
    await give.execute({ ...owner, need });

    clock.advance(30 * day - 1);
    expect(await held.execute({ ...owner, need })).toBeDefined();
    clock.advance(1);
    expect(await held.execute({ ...owner, need })).toBeUndefined();
  });
});

describe('the consent that holds (RF-143, DEC-209)', () => {
  it('RF-143 a consent does not hold for a provider it does not name', async () => {
    const { give, held, owner } = await setup();
    await give.execute({ ...owner, need });

    const openai: ConsentNeed = { providers: ['openai'], kinds: ['cloud'] };

    expect(await held.execute({ ...owner, need: openai })).toBeUndefined();
  });

  it('RF-143 withdraw marks the consents of the project and none holds after it', async () => {
    const { give, held, withdraw, consents, owner, clock } = await setup();
    await give.execute({ ...owner, need });
    clock.advance(day);

    expect(await withdraw.execute(owner)).toBe(1);

    expect(await held.execute({ ...owner, need })).toBeUndefined();
    const [kept] = await consents.list(userAmy.userId, owner.projectId);
    expect(kept?.withdrawnAt).toBe(clock.now().getTime());
  });
});

const cloud = settingsFor({
  reader: { provider: 'openai', model: 'gpt-5-mini' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});
const local = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
});
const ollama = settingsFor({
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
});

describe('what a start needs a consent for (RF-143, RF-132)', () => {
  it('RF-143 names the non-local providers of the roles, sorted, with the kind cloud', () => {
    const github = sampleProject({ userId: userAmy.userId, settings: cloud });

    expect(consentNeedOf(github, undefined)).toEqual({
      providers: ['anthropic', 'openai'],
      kinds: ['cloud'],
    });
  });

  it('RF-143 names only the roles the start calls (a plan run calls the planner)', () => {
    const github = sampleProject({ userId: userAmy.userId, settings: cloud });

    expect(consentNeedOf(github, undefined, ['reader'])).toEqual({
      providers: ['openai'],
      kinds: ['cloud'],
    });
  });

  it('RF-132 an uploaded project also needs the private-code kind', () => {
    const upload = sampleProject({
      ...{ userId: userAmy.userId, settings: cloud },
      ...{ sourceKind: 'upload', sourceUrl: '', upload: heldZip },
    });

    expect(consentNeedOf(upload, undefined)?.kinds).toEqual(['cloud', 'private-code']);
  });

  it('RF-143 roles that are all local need no consent', () => {
    expect(
      consentNeedOf(sampleProject({ userId: userAmy.userId, settings: local }), undefined),
    ).toBe(undefined);
  });

  it('RF-143 an Ollama on another host is named like a cloud provider (DEC-118)', () => {
    const project = sampleProject({ userId: userAmy.userId, settings: ollama });

    expect(consentNeedOf(project, 'localhost')).toBeUndefined();
    expect(consentNeedOf(project, 'gpu.example.net')?.providers).toEqual(['ollama']);
  });
});
