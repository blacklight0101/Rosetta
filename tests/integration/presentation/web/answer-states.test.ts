import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { seedQuestionCards } from '../../../support/question-cards.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1007, RF-241: the state of each question on GET and PUT /api/runs/:runId/answers. A question is
// Answered once its OQ card is; a question whose card file is gone reads Open.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const owner = actorOf(amyUser.account);
  const outcome = await test.runs.submit.execute({
    ...{ actor: owner, project: sampleProject({ userId: owner.userId }) },
    ...{ stage: 'understand', options: {} },
  });
  if (!outcome.ok) throw new Error('The run was not accepted');
  const { run } = outcome.value;
  const ref = { userId: run.userId, projectId: run.projectId };
  await test.answers.addQuestions(ref, [
    { cardId: 'OQ-001', runKey: run.runKey, question: 'Is stock shown?', context: 'b:3-4 y' },
    { cardId: 'OQ-002', runKey: run.runKey, question: 'Who edits prices?', context: 'c:5-6 z' },
  ]);
  const amy = await signedInBrowser(test.server, amyUser);
  return { test, ref, run, amy, url: `/api/runs/${run.id}/answers` };
}

describe('the state of the questions of a run', () => {
  it('RF-1007 RF-241 shows a question as Answered once its OQ card is, the other as Open', async () => {
    const { test, ref, run, amy, url } = await setup();
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
      { id: 'OQ-002', area: 'Orders', state: 'Open' },
    ]);

    const response = await amy.request({ method: 'GET', url });

    expect(response.json()).toMatchObject({
      questions: [
        { cardId: 'OQ-001', state: 'Answered' },
        { cardId: 'OQ-002', state: 'Open' },
      ],
    });
  });

  it('RF-1007 shows a question whose card file is gone as Open', async () => {
    const { amy, url } = await setup();

    const response = await amy.request({ method: 'GET', url });

    expect(response.json()).toMatchObject({ questions: [{ state: 'Open' }, { state: 'Open' }] });
  });

  it('RF-1007 RF-241 gives the state with the questions an answer saves', async () => {
    const { test, ref, run, amy, url } = await setup();
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
      { id: 'OQ-002', area: 'Orders', state: 'Open' },
    ]);

    const response = await amy.request({
      method: 'PUT',
      url,
      payload: { answers: [{ cardId: 'OQ-002', answer: 'Managers.' }] },
    });

    expect(response.json()).toMatchObject({
      questions: [
        { cardId: 'OQ-001', state: 'Answered' },
        { cardId: 'OQ-002', answer: 'Managers.', state: 'Open' },
      ],
    });
  });
});
