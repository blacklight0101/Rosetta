import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith } from '../../../support/project-fixtures.js';
import { amy, bob, projectHarness } from '../../../support/project-harness.js';

// RF-002, RF-1105 (P1-106): Update project settings with the version the save started from.

async function created(): Promise<{ test: ReturnType<typeof projectHarness>; id: string }> {
  const test = projectHarness();
  const outcome = await test.createProject.execute({
    actor: amy,
    url: 'https://github.com/owner/repo',
  });
  if (!outcome.ok) throw new Error('The project was not created');
  return { test, id: outcome.value.project.id };
}

describe('UpdateProjectSettings: versions', () => {
  it('RF-002 a save made from the current version is stored and the version moves on', async () => {
    const { test, id } = await created();
    const settings = settingsWith({ 'agents.parallelism': 2 });

    const outcome = await test.updateProjectSettings.execute({
      actor: amy,
      projectId: id,
      settings,
      expectedVersion: 1,
    });

    expect(outcome).toMatchObject({ ok: true, value: { settingsVersion: 2 } });
  });

  it('RF-002 a save made from an older version is refused with RST-1007 and changes nothing', async () => {
    const { test, id } = await created();
    await test.updateProjectSettings.execute({
      actor: amy,
      projectId: id,
      settings: settingsWith({ 'agents.parallelism': 2 }),
      expectedVersion: 1,
    });
    const before = await test.getProject.execute({ actor: amy, projectId: id });

    const outcome = await test.updateProjectSettings.execute({
      actor: amy,
      projectId: id,
      settings: settingsWith({ 'agents.parallelism': 3 }),
      expectedVersion: 1,
    });

    expect(outcome).toEqual({ ok: false, error: { code: ERROR_CODES.settingsVersionStale } });
    expect(await test.getProject.execute({ actor: amy, projectId: id })).toEqual(before);
  });

  it('RF-1105 another user holding the right version still gets not found', async () => {
    const { test, id } = await created();

    const outcome = await test.updateProjectSettings.execute({
      actor: bob,
      projectId: id,
      settings: settingsWith({}),
      expectedVersion: 1,
    });

    expect(outcome).toEqual({ ok: false, error: { code: ERROR_CODES.notFound } });
  });
});
