import { describe, expect, it } from 'vitest';
import { GetStackOffer } from '../../../../src/application/use-cases/get-stack-offer.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// P7-29, RF-609, RF-645, DEC-203: the options of each stack layer before the consent, from the
// catalogue alone.

const account = sampleAccount({ userName: 'stack.offer' });
const actor = actorOf(account);

async function setup(sourceKind: 'github' | 'workbook') {
  const project = {
    ...sampleProject({ userId: account.id }),
    ...(sourceKind === 'workbook' ? { sourceKind, sourceUrl: '' } : {}),
  };
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  const scans = { open: () => Promise.reject(new Error('no scan')) };
  const offer = new GetStackOffer({
    ...{ projects, scans, runs: new MemoryRunIndex(), stack: shippedCatalogue.stack },
  });
  return { project, offer };
}

describe('GetStackOffer', () => {
  it('DEC-203 offers a workbook two proposals and no keep-legacy', async () => {
    const { project, offer } = await setup('workbook');
    const result = await offer.execute({ actor, projectId: project.id });
    expect(result.ok && result.value).toHaveLength(7);
    expect(result.ok && result.value.every((each) => !each.keepLegacy)).toBe(true);
    expect(result.ok && result.value[0]?.proposals).toHaveLength(2);
  });

  it('RF-609 lists no proposal when there is no readable scan', async () => {
    const { project, offer } = await setup('github');
    const result = await offer.execute({ actor, projectId: project.id });
    expect(result.ok && result.value.every((each) => each.proposals.length === 0)).toBe(true);
    expect(result.ok && result.value.every((each) => each.keepLegacy)).toBe(true);
  });

  it('RF-1105 does not find another user project', async () => {
    const { project, offer } = await setup('github');
    const other = actorOf(sampleAccount({ userName: 'someone.else' }));
    expect(await offer.execute({ actor: other, projectId: project.id })).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
  });
});
