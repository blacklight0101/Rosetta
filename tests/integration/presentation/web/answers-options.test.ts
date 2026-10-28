import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-645, RF-1007, RF-240, DEC-178: the answers API carries the suggested answers of a question and
// records which one was chosen, or that the answer was typed, in the project's answers.md.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const options = [
  { answer: 'Yes, show it', description: 'Keep the list.', recommended: true },
  { answer: 'No, hide it', description: 'Hide the item.', recommended: false },
  { answer: 'Only in stock', description: 'Name the condition.', recommended: false },
];

async function setup(): Promise<{ test: TestServer; amy: TestBrowser; run: Run }> {
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
  const project = { userId: run.userId, projectId: run.projectId };
  await test.answers.addQuestions(project, [
    {
      cardId: 'OQ-001',
      runKey: run.runKey,
      question: 'Is stock shown?',
      context: 'b:3-4 y',
      options,
    },
    { cardId: 'OQ-002', runKey: run.runKey, question: 'Who edits prices?', context: 'c:5-6 z' },
  ]);
  return { test, run, amy: await signedInBrowser(test.server, amyUser) };
}

const urlOf = (run: Run): string => `/api/runs/${run.id}/answers`;
const fileOf = (test: TestServer, run: Run): string =>
  test.answerFiles.files.get(`projects/${run.projectId}/answers.md`) ?? '';

describe('the answers API and suggested answers', () => {
  it('RF-645 lists the options of a question and none for one saved before the change', async () => {
    const { amy, run } = await setup();

    const response = await amy.request({ method: 'GET', url: urlOf(run) });

    expect(response.json()).toMatchObject({
      questions: [{ cardId: 'OQ-001', options, chosen: '' }, { cardId: 'OQ-002' }],
    });
    const [, legacy] = response.json<{ questions: Record<string, unknown>[] }>().questions;
    expect(legacy).not.toHaveProperty('options');
    expect(legacy).not.toHaveProperty('chosen');
  });
});

describe('the answers API and the chosen option', () => {
  it('RF-1007 RF-645 choosing an option writes its answer and its number to answers.md', async () => {
    const { test, amy, run } = await setup();

    const response = await amy.request({
      method: 'PUT',
      url: urlOf(run),
      payload: { answers: [{ cardId: 'OQ-001', answer: 'No, hide it', chosen: 2 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      questions: [{ cardId: 'OQ-001', answer: 'No, hide it', chosen: '2' }, { cardId: 'OQ-002' }],
    });
    expect(fileOf(test, run)).toContain('- Chosen: 2\n- Answer: No, hide it\n');
  });

  it('RF-1007 RF-645 a typed answer is recorded as typed', async () => {
    const { test, amy, run } = await setup();

    await amy.request({
      method: 'PUT',
      url: urlOf(run),
      payload: { answers: [{ cardId: 'OQ-001', answer: 'Staff only.', chosen: 'typed' }] },
    });

    expect(fileOf(test, run)).toContain('- Chosen: typed\n- Answer: Staff only.\n');
  });
});

describe('the answers API and refused or old questions', () => {
  it('RF-645 an option number the question does not have answers 400 and writes nothing', async () => {
    const { test, amy, run } = await setup();
    const before = fileOf(test, run);

    const response = await amy.request({
      method: 'PUT',
      url: urlOf(run),
      payload: { answers: [{ cardId: 'OQ-001', answer: 'x', chosen: 7 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(fileOf(test, run)).toBe(before);
  });

  it('RF-645 a question saved before the change still takes a free answer', async () => {
    const { test, amy, run } = await setup();

    const response = await amy.request({
      method: 'PUT',
      url: urlOf(run),
      payload: { answers: [{ cardId: 'OQ-002', answer: 'Managers.' }] },
    });

    expect(response.statusCode).toBe(200);
    expect(fileOf(test, run)).toContain('- Answer: Managers.');
  });
});
