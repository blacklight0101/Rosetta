import { describe, expect, it } from 'vitest';
import { amy, projectHarness } from '../../../support/project-harness.js';

// RF-010, RF-130: a project made from a GitHub address is a project of kind github.

describe('CreateProject source kind', () => {
  it('RF-130 a GitHub address becomes a project of kind github', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.execute({
      actor: amy,
      url: 'https://github.com/owner/repo',
    });

    expect(outcome).toMatchObject({ ok: true, value: { project: { sourceKind: 'github' } } });
  });
});
