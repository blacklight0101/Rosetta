import { describe, expect, it } from 'vitest';
import { settingsWith, templateSettings } from '../../../support/project-fixtures.js';
import { HOSTED_READER_PARALLELISM } from '../../../../src/application/use-cases/update-project-settings.js';
import { amy, projectHarness } from '../../../support/project-harness.js';

// RF-436 (P8-56): a save that moves the reader from a local provider (Ollama) to a hosted one
// raises `agents.parallelism` from the stored 1 to the template default; any other value, a value
// changed in the same save, a switch the other way and a save without a switch are kept as sent.

const hosted = { 'roles.reader.provider': 'anthropic' };
const local = { 'roles.reader.provider': 'ollama' };

/** A project made with an Ollama reader, so it starts with parallelism 1 (default-settings.ts). */
async function created(): Promise<{ test: ReturnType<typeof projectHarness>; id: string }> {
  const test = projectHarness();
  const outcome = await test.createProject.execute({
    actor: amy,
    url: 'https://github.com/owner/repo',
  });
  if (!outcome.ok) throw new Error('The project was not created');
  return { test, id: outcome.value.project.id };
}

async function save(
  fixture: Awaited<ReturnType<typeof created>>,
  changes: Record<string, unknown>,
) {
  const outcome = await fixture.test.updateProjectSettings.execute({
    actor: amy,
    projectId: fixture.id,
    settings: settingsWith(changes),
  });
  if (!outcome.ok) throw new Error('The save was refused');
  return outcome.value;
}

describe('UpdateProjectSettings: parallelism follows the reader provider', () => {
  it('RF-436 the template default is 4, the value the rule sets', () => {
    expect(templateSettings.agents.parallelism).toBe(HOSTED_READER_PARALLELISM);
  });

  it('RF-436 a project made with an Ollama reader starts with parallelism 1', async () => {
    const fixture = await created();
    const project = await fixture.test.getProject.execute({ actor: amy, projectId: fixture.id });
    expect(project.ok && project.value.settings.agents.parallelism).toBe(1);
  });

  it('RF-436 local to hosted with the stored 1 still 1 is saved with 4 and the answer says so', async () => {
    const fixture = await created();

    const saved = await save(fixture, { ...hosted, 'agents.parallelism': 1 });

    expect(saved.project.settings.agents.parallelism).toBe(4);
    expect(saved.parallelismChange).toEqual({ from: 1, to: 4 });
    const stored = await fixture.test.getProject.execute({ actor: amy, projectId: fixture.id });
    expect(stored.ok && stored.value.settings.agents.parallelism).toBe(4);
  });

  it('RF-436 local to hosted with 2 keeps 2 and the answer says nothing', async () => {
    const fixture = await created();
    await save(fixture, { ...local, 'agents.parallelism': 2 });

    const saved = await save(fixture, { ...hosted, 'agents.parallelism': 2 });

    expect(saved.project.settings.agents.parallelism).toBe(2);
    expect(saved.parallelismChange).toBeUndefined();
  });

  it('RF-436 local to hosted with the stored 1 and a value changed in the same save keeps the value sent', async () => {
    const fixture = await created();

    const saved = await save(fixture, { ...hosted, 'agents.parallelism': 3 });

    expect(saved.project.settings.agents.parallelism).toBe(3);
    expect(saved.parallelismChange).toBeUndefined();
  });
});

describe('UpdateProjectSettings: parallelism is kept when the reader does not go hosted', () => {
  it('RF-436 local to hosted sending 1 over a stored 2 keeps the 1 the user chose', async () => {
    const fixture = await created();
    await save(fixture, { ...local, 'agents.parallelism': 2 });

    const saved = await save(fixture, { ...hosted, 'agents.parallelism': 1 });

    expect(saved.project.settings.agents.parallelism).toBe(1);
    expect(saved.parallelismChange).toBeUndefined();
  });

  it('RF-436 hosted to local changes nothing', async () => {
    const fixture = await created();
    await save(fixture, { ...hosted, 'agents.parallelism': 3 });

    const saved = await save(fixture, { ...local, 'agents.parallelism': 1 });

    expect(saved.project.settings.agents.parallelism).toBe(1);
    expect(saved.parallelismChange).toBeUndefined();
  });

  it('RF-436 a save without a provider change keeps a 1 on a local reader', async () => {
    const fixture = await created();

    const saved = await save(fixture, { ...local, 'agents.parallelism': 1 });

    expect(saved.project.settings.agents.parallelism).toBe(1);
    expect(saved.parallelismChange).toBeUndefined();
  });

  it('RF-436 a save without a provider change keeps a 1 on a hosted reader', async () => {
    const fixture = await created();
    await save(fixture, { ...hosted, 'agents.parallelism': 2 });
    await save(fixture, { ...hosted, 'agents.parallelism': 1 });

    const saved = await save(fixture, { ...hosted, 'agents.parallelism': 1 });

    expect(saved.project.settings.agents.parallelism).toBe(1);
    expect(saved.parallelismChange).toBeUndefined();
  });
});
