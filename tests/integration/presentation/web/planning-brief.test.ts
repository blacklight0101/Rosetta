import type { InjectOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-605, DEC-80, RF-1105: GET and PUT /api/projects/:id/planning-brief through the server with a
// session. The brief file is the real adapter over a memory writer, so what the routes change is
// the text of the project's planning-brief.json.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const project = sampleProject({ userId: actorOf(amyUser.account).userId });
  await test.projects.insertOrFind(project);
  return {
    test,
    project,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const briefUrl = (projectId: string): string => `/api/projects/${projectId}/planning-brief`;
const fileOf = (test: TestServer, projectId: string): string | undefined =>
  test.briefFiles.files.get(`projects/${projectId}/planning-brief.json`);

async function put(browser: TestBrowser, projectId: string, payload: InjectOptions['payload']) {
  return browser.request({ method: 'PUT', url: briefUrl(projectId), payload });
}

describe('GET /api/projects/:id/planning-brief', () => {
  it('RF-605 a project without a saved brief shows every default and writes nothing', async () => {
    const { test, amy, project } = await setup();

    const response = await amy.request({ method: 'GET', url: briefUrl(project.id) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      saved: false,
      outOfDate: false,
      brief: { savedAt: null, migration: 'strangler-fig', architecture: { style: 'layered' } },
    });
    expect(response.json<{ brief: { defaulted: string[] } }>().brief.defaulted).toContain(
      'principles',
    );
    expect(fileOf(test, project.id)).toBeUndefined();
  });

  it("RF-1105 another user's project and an unknown id answer 404", async () => {
    const { bob, project } = await setup();

    const other = await bob.request({ method: 'GET', url: briefUrl(project.id) });
    const unknown = await bob.request({ method: 'GET', url: briefUrl('not-a-uuid') });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('PUT /api/projects/:id/planning-brief: saving', () => {
  it('RF-605 saves the answers, stores planning-brief.json and shows it again on a read', async () => {
    const { test, amy, project } = await setup();

    const response = await put(amy, project.id, {
      principles: ['tdd', 'solid'],
      migration: 'parallel-change',
      stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      saved: true,
      outOfDate: false,
      brief: {
        principles: ['solid', 'tdd'],
        migration: 'parallel-change',
        stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
        savedAt: test.clock.now().toISOString(),
      },
    });
    expect(JSON.parse(fileOf(test, project.id) ?? 'null')).toMatchObject({
      schemaVersion: 1,
      migration: 'parallel-change',
    });
    const read = await amy.request({ method: 'GET', url: briefUrl(project.id) });
    expect(read.json()).toEqual(response.json());
  });

  it('RF-605 a question left out is listed as defaulted', async () => {
    const { amy, project } = await setup();

    const response = await put(amy, project.id, { migration: 'rewrite' });

    const { defaulted } = response.json<{ brief: { defaulted: string[] } }>().brief;
    expect(defaulted).not.toContain('migration');
    expect(defaulted).toContain('principles');
    expect(defaulted).toContain('stack.hosting');
  });
});

describe('PUT /api/projects/:id/planning-brief: refusals', () => {
  it("RF-1105 another user's project answers 404 and writes nothing", async () => {
    const { test, bob, project } = await setup();

    const response = await put(bob, project.id, { migration: 'rewrite' });

    expect(response.statusCode).toBe(404);
    expect(fileOf(test, project.id)).toBeUndefined();
  });

  it.each([
    ['an unknown key', { extra: true }],
    ['an unknown migration strategy', { migration: 'big-bang' }],
    [
      'a stack choice over 200 characters',
      { stack: [{ layer: 'testing', choice: 'x'.repeat(201), custom: true }] },
    ],
    ['a body that is not an object', []],
  ])('RF-605 refuses %s with 400 and writes nothing', async (_name, payload) => {
    const { test, amy, project } = await setup();

    const response = await put(amy, project.id, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(fileOf(test, project.id)).toBeUndefined();
  });
});

describe('PUT /api/projects/:id/planning-brief: field problems', () => {
  it('RF-605 refuses an unknown principle and a repeated layer with their fields', async () => {
    const { test, amy, project } = await setup();

    const unknown = await put(amy, project.id, { principles: ['tdd', 'nonsense'] });
    const repeated = await put(amy, project.id, {
      stack: [
        { layer: 'testing', choice: 'Vitest', custom: false },
        { layer: 'testing', choice: 'Jest', custom: false },
      ],
    });

    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ problems: [{ field: 'principles.1' }] });
    expect(repeated.statusCode).toBe(400);
    expect(repeated.json()).toMatchObject({ problems: [{ field: 'stack' }] });
    expect(fileOf(test, project.id)).toBeUndefined();
  });
});

describe('PUT /api/projects/:id/planning-brief: typed build method', () => {
  const agentBuild = { aiAssisted: true, agentTool: { kind: 'claude-code' } };

  it('DEC-187 refuses a typed build method together with agents building, and writes nothing', async () => {
    const { test, amy, project } = await setup();

    const response = await put(amy, project.id, {
      buildMethod: agentBuild,
      typed: { buildMethod: 'Our own process' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.requestInvalid,
      problems: [{ field: 'typed.buildMethod' }],
    });
    expect(fileOf(test, project.id)).toBeUndefined();
  });

  it('DEC-187 a typed build method alone still saves, and the question leaves defaulted', async () => {
    const { amy, project } = await setup();

    const response = await put(amy, project.id, { typed: { buildMethod: 'Our own process' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      saved: true,
      brief: { buildMethod: { aiAssisted: false }, typed: { buildMethod: 'Our own process' } },
    });
    expect(response.json<{ brief: { defaulted: string[] } }>().brief.defaulted).not.toContain(
      'buildMethod',
    );
  });

  it('DEC-187 an agent build alone still saves', async () => {
    const { amy, project } = await setup();

    const response = await put(amy, project.id, { buildMethod: agentBuild });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      saved: true,
      brief: { buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } } },
    });
  });
});

describe('planning brief out of date', () => {
  it('RF-605 changing an answer after a package exists tells the page the package is out of date', async () => {
    const { test, amy, project } = await setup();
    await put(amy, project.id, { migration: 'rewrite' });
    test.clock.advance(60_000);
    const inserted = await test.runs.runs.insert(
      sampleRun({
        userId: project.userId,
        projectId: project.id,
        stage: 'plan',
        queueState: 'Ended',
        endState: 'Completed',
        startedAt: test.clock.now().getTime(),
      }),
    );
    expect(inserted.ok).toBe(true);
    const upToDate = await amy.request({ method: 'GET', url: briefUrl(project.id) });
    test.clock.advance(60_000);

    const changed = await put(amy, project.id, { migration: 'parallel-change' });
    const read = await amy.request({ method: 'GET', url: briefUrl(project.id) });

    expect(upToDate.json()).toMatchObject({ outOfDate: false });
    expect(changed.json()).toMatchObject({ outOfDate: true });
    expect(read.json()).toMatchObject({ outOfDate: true });
  });
});
