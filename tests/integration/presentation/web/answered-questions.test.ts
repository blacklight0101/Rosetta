import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { seedQuestionCards } from '../../../support/question-cards.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-241, RF-1001: GET /api/projects/:id/answered-questions tells the start page how many questions
// have an answer and are still Open, that is, whether "Re-run with answers" has anything to do.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const runKey = '20261012-100000-understand';

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const project = sampleProject({ userId: amyUser.account.id });
  await test.projects.insertOrFind(project);
  const ref = { userId: amyUser.account.id, projectId: project.id };
  await test.answers.addQuestions(ref, [
    { cardId: 'OQ-001', runKey, question: 'Is stock shown?', context: 'a:1-2 x' },
    { cardId: 'OQ-002', runKey, question: 'Who edits prices?', context: 'b:3-4 y' },
    { cardId: 'OQ-003', runKey, question: 'Are orders deleted?', context: 'c:5-6 z' },
  ]);
  seedQuestionCards(test.answerFiles, ref, runKey, [
    { id: 'OQ-001', area: 'Catalog', state: 'Open' },
    { id: 'OQ-002', area: 'Catalog', state: 'Answered' },
    { id: 'OQ-003', area: 'Orders', state: 'Open' },
  ]);
  return {
    test,
    ref,
    project,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const urlOf = (projectId: string): string => `/api/projects/${projectId}/answered-questions`;

describe('GET /api/projects/:id/answered-questions', () => {
  it('RF-241 counts zero while no question has an answer', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({ method: 'GET', url: urlOf(project.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: 0 });
  });

  it('RF-241 counts the answered questions whose card is still Open, not the Answered ones', async () => {
    const { test, ref, amy, project } = await setup();
    await test.answers.recordAnswers(ref, runKey, [
      { cardId: 'OQ-001', answer: 'Yes.' },
      { cardId: 'OQ-002', answer: 'Managers.' },
    ]);

    const response = await amy.request({ method: 'GET', url: urlOf(project.id) });

    expect(response.json()).toEqual({ count: 1 });
  });

  it("RF-1105 answers 404 for another user's project, like an unknown one", async () => {
    const { bob, project } = await setup();

    const other = await bob.request({ method: 'GET', url: urlOf(project.id) });
    const unknown = await bob.request({ method: 'GET', url: urlOf('not-a-uuid') });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(other.json()).toEqual(unknown.json());
  });
});
