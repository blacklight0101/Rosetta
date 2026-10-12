import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { newProjectSettings, settingsWith } from '../../../support/project-fixtures.js';
import { amy, bob, projectHarness, root } from '../../../support/project-harness.js';

// RF-010 (all scenarios), RF-002 (first two), RF-1105 (both): the project use cases.

async function created(): Promise<{ test: ReturnType<typeof projectHarness>; id: string }> {
  const test = projectHarness();
  const outcome = await test.createProject.execute({
    actor: amy,
    url: 'https://github.com/owner/repo',
  });
  if (!outcome.ok) throw new Error('The project was not created');
  return { test, id: outcome.value.project.id };
}

async function withAmy(): Promise<ReturnType<typeof projectHarness>> {
  const test = projectHarness();
  await test.users.insert(sampleAccount({ id: amy.userId, userName: 'amy', displayName: 'Amy' }));
  await test.createProject.execute({ actor: amy, url: 'https://github.com/owner/repo' });
  return test;
}

describe('CreateProject', () => {
  it('RF-010 a public GitHub URL becomes a project with its URL, ref, subpath and default settings', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.execute({
      actor: amy,
      url: 'https://github.com/Dotnet-Architecture/eShopModernizing/tree/master/eShopLegacyWebFormsSolution',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.created).toBe(true);
    expect(outcome.value.project).toMatchObject({
      userId: amy.userId,
      name: 'Dotnet-Architecture/eShopModernizing',
      sourceUrl: 'https://github.com/dotnet-architecture/eshopmodernizing',
      ref: 'master',
      subpath: 'eShopLegacyWebFormsSolution',
      settings: newProjectSettings,
    });
    expect(await test.projects.find(amy.userId, outcome.value.project.id)).toEqual(
      outcome.value.project,
    );
  });

  it('RF-010 a URL without a ref or subpath stores them empty, meaning the default branch and the root', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.execute({
      actor: amy,
      url: ' https://github.com/owner/repo.git/ ',
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: { project: { name: 'owner/repo', ref: '', subpath: '' } },
    });
  });

  it('RF-010 the project appears only in the list of its owner', async () => {
    const test = projectHarness();
    await test.createProject.execute({ actor: amy, url: 'https://github.com/owner/repo' });

    expect(await test.listProjects.execute({ actor: amy })).toHaveLength(1);
    expect(await test.listProjects.execute({ actor: bob })).toEqual([]);
  });
});

describe('CreateProject: refused addresses', () => {
  it.each([
    ['https://gitlab.com/owner/repo', 'not-github'],
    ['http://github.com/owner/repo', 'not-https'],
    ['not a url', 'not-a-url'],
    ['https://github.com/owner', 'missing-repository'],
    ['https://github.com/owner/repo/tree/-bad', 'invalid-ref'],
  ])(
    'RF-010 %j is refused with RST-1900 and the reason %s, and nothing is created',
    async (url, reason) => {
      const test = projectHarness();

      const outcome = await test.createProject.execute({ actor: amy, url });

      expect(outcome).toEqual({
        ok: false,
        error: { code: ERROR_CODES.githubUrlInvalid, reason },
      });
      expect(await test.listProjects.execute({ actor: amy })).toEqual([]);
    },
  );

  it('RF-010 the same URL, ref and subpath again opens the existing project instead of creating one', async () => {
    const test = projectHarness();
    const first = await test.createProject.execute({
      actor: amy,
      url: 'https://github.com/owner/repo/tree/main/src',
    });
    const again = await test.createProject.execute({
      actor: amy,
      url: 'https://GitHub.com/OWNER/repo/tree/main/src/',
    });

    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.value).toEqual({ project: first.value.project, created: false });
    expect(await test.listProjects.execute({ actor: amy })).toHaveLength(1);
  });
});

describe('CreateProject: ref, subpath, users and server defaults', () => {
  it('RF-010 another ref or subpath is another project, and another user may have the same one', async () => {
    const test = projectHarness();
    await test.createProject.execute({ actor: amy, url: 'https://github.com/owner/repo' });
    const other = await test.createProject.execute({
      actor: amy,
      url: 'https://github.com/owner/repo/tree/dev',
    });
    const bobs = await test.createProject.execute({
      actor: bob,
      url: 'https://github.com/owner/repo',
    });

    expect(other.ok && other.value.created).toBe(true);
    expect(bobs.ok && bobs.value.created).toBe(true);
    expect(await test.listProjects.execute({ actor: amy })).toHaveLength(2);
  });

  it('DEC-106 the models of a new project come from the defaultRoles server setting', async () => {
    const test = projectHarness({
      reader: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' },
    });

    const outcome = await test.createProject.execute({
      actor: amy,
      url: 'https://github.com/owner/repo',
    });

    expect(outcome.ok && outcome.value.project.settings.roles.reader).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini-2024-07-18',
    });
  });
});

describe('GetProject and ListProjects', () => {
  it('RF-1105 another user asking for a project id gets the same answer as for an unknown id', async () => {
    const test = projectHarness();
    const created = await test.createProject.execute({
      actor: amy,
      url: 'https://github.com/owner/repo',
    });
    if (!created.ok) throw new Error('The project was not created');
    const { id } = created.value.project;

    expect(await test.getProject.execute({ actor: amy, projectId: id })).toEqual({
      ok: true,
      value: created.value.project,
    });
    const foreign = await test.getProject.execute({ actor: bob, projectId: id });
    const unknown = await test.getProject.execute({
      actor: bob,
      projectId: '00000000-0000-4000-a000-00000000ffff',
    });
    expect(foreign).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual(foreign);
    expect(await test.getProject.execute({ actor: root, projectId: id })).toEqual(foreign);
  });
});

describe('UpdateProjectSettings', () => {
  it('RF-002 valid settings are stored and the update time moves', async () => {
    const { test, id } = await created();
    test.clock.advance(60_000);
    const settings = settingsWith({ 'budget.run.maxCostMicros': 250_000, 'agents.parallelism': 2 });

    const outcome = await test.updateProjectSettings.execute({
      actor: amy,
      projectId: id,
      settings,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.settings.budget.run.maxCostMicros).toBe(250_000);
    expect(outcome.value.updatedAt).toBe(test.clock.now().getTime());
    expect(await test.getProject.execute({ actor: amy, projectId: id })).toEqual(outcome);
  });
});

describe('UpdateProjectSettings: refusals', () => {
  it('RF-002 invalid settings change nothing and each problem is returned with its field and code', async () => {
    const { test, id } = await created();
    const before = await test.getProject.execute({ actor: amy, projectId: id });
    const settings = settingsWith({
      'budget.run.maxCostMicros': -1,
      'roles.reader.model': '',
      'providers.ollama.baseUrl': 'http://example.test',
    });

    const outcome = await test.updateProjectSettings.execute({
      actor: amy,
      projectId: id,
      settings,
    });

    expect(outcome).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.settingsInvalid,
        problems: [
          { field: 'budget.run.maxCostMicros', code: ERROR_CODES.settingsCapNegative },
          { field: 'providers.ollama.baseUrl', code: ERROR_CODES.settingsBaseUrlRefused },
          { field: 'roles.reader.model', code: ERROR_CODES.settingsModelMissing },
        ],
      },
    });
    expect(await test.getProject.execute({ actor: amy, projectId: id })).toEqual(before);
  });

  it('RF-1105 another user cannot change the settings: the answer is not found, before any check', async () => {
    const { test, id } = await created();

    const outcome = await test.updateProjectSettings.execute({
      actor: bob,
      projectId: id,
      settings: { nonsense: true },
    });

    expect(outcome).toEqual({ ok: false, error: { code: ERROR_CODES.notFound } });
  });
});

describe('OpenWorkspace', () => {
  it('RF-1105 the administrator reads the projects of another user and an audit event is written', async () => {
    const test = await withAmy();

    const outcome = await test.openWorkspace.execute({
      actor: root,
      ownerId: amy.userId,
      ip: '203.0.113.9',
    });

    expect(outcome.ok && outcome.value.projects).toHaveLength(1);
    expect(outcome.ok && outcome.value.owner.userName).toBe('amy');
    const [event, ...rest] = await test.audit.list({ since: new Date(0) });
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      actorUserId: root.userId,
      action: 'admin.workspace_opened',
      targetType: 'user',
      targetId: amy.userId,
      ip: '203.0.113.9',
      outcome: 'ok',
      detail: { projects: 1 },
    });
  });
});

describe('OpenWorkspace: refusals', () => {
  it('RF-1105 a user who is not an administrator is refused and nothing is read or audited', async () => {
    const test = await withAmy();

    const outcome = await test.openWorkspace.execute({
      actor: bob,
      ownerId: amy.userId,
      ip: '203.0.113.9',
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notAllowed });
    expect(await test.audit.list({ since: new Date(0) })).toEqual([]);
  });

  it('RF-1105 an unknown user id is not found and writes no audit event', async () => {
    const test = await withAmy();

    const outcome = await test.openWorkspace.execute({
      actor: root,
      ownerId: '00000000-0000-4000-9000-00000000ffff',
      ip: '203.0.113.9',
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(await test.audit.list({ since: new Date(0) })).toEqual([]);
  });
});
