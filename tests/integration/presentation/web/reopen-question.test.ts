import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { seedQuestionCards } from '../../../support/question-cards.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-241, RF-1007, RF-1105: POST /api/runs/:runId/answers/:cardId/reopen opens an Answered question
// again, so an answer edited after that is used by the next re-run. It writes the card files, logs the
// reopening, answers the run's questions as they are now, and answers 404 for an unknown question or
// another user's run. A run that has not ended (queued or running) is refused with 409, as its agents
// are still writing the cards (P2-44).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup(options: { readonly ended?: boolean; readonly queued?: boolean } = {}) {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const owner = actorOf(amyUser.account);
  if (options.queued === true) {
    // The first run takes the only running slot, so the next one waits in the queue.
    await test.runs.submit.execute({
      ...{ actor: owner, project: sampleProject({ userId: owner.userId }) },
      ...{ stage: 'understand', options: {} },
    });
  }
  const outcome = await test.runs.submit.execute({
    ...{ actor: owner, project: sampleProject({ userId: owner.userId }) },
    ...{ stage: 'understand', options: {} },
  });
  if (!outcome.ok) throw new Error('The run was not accepted');
  const { run } = outcome.value;
  if (options.ended !== false) {
    await test.runs.runs.end(run.id, 'Interrupted', test.runs.clock.now().getTime());
  }
  const ref = { userId: run.userId, projectId: run.projectId };
  await test.answers.addQuestions(ref, [
    { cardId: 'OQ-001', runKey: run.runKey, question: 'Is stock shown?', context: 'b:3-4 y' },
    { cardId: 'OQ-002', runKey: run.runKey, question: 'Who edits prices?', context: 'c:5-6 z' },
  ]);
  const amy = await signedInBrowser(test.server, amyUser);
  const bob = await signedInBrowser(test.server, bobUser);
  const url = `/api/runs/${run.id}/answers`;
  const cardFile = (id: string): string =>
    test.answerFiles.files.get(`projects/${run.projectId}/runs/${run.runKey}/cards/OQ/${id}.md`) ??
    '';
  return { test, ref, run, amy, bob, url, cardFile };
}

describe('POST /api/runs/:runId/answers/:cardId/reopen', () => {
  it('RF-241 RF-1007 opens an Answered question again and logs it', async () => {
    const { test, ref, run, amy, url, cardFile } = await setup();
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
      { id: 'OQ-002', area: 'Orders', state: 'Answered' },
    ]);

    const response = await amy.request({ method: 'POST', url: `${url}/OQ-001/reopen` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      questions: [
        { cardId: 'OQ-001', state: 'Open' },
        { cardId: 'OQ-002', state: 'Answered' },
      ],
    });
    expect(cardFile('OQ-001')).toContain('State: Open');
    expect(cardFile('OQ-002')).toContain('State: Answered');
    const entries = test.logger.entries.filter((entry) => entry.runId === run.runKey);
    expect(entries.map((entry) => [entry.level, entry.message])).toContainEqual([
      'info',
      expect.stringMatching(/OQ-001.*reopened/iu),
    ]);
  });
});

describe('POST /api/runs/:runId/answers/:cardId/reopen, merged and refused', () => {
  it('RF-241 RF-250 opens every card behind a merged question', async () => {
    const { test, ref, run, amy, url, cardFile } = await setup();
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered', question: 'Is stock shown?' },
      { id: 'OQ-002', area: 'Orders', state: 'Answered', question: 'is stock shown' },
    ]);

    await amy.request({ method: 'POST', url: `${url}/OQ-001/reopen` });

    expect(cardFile('OQ-001')).toContain('State: Open');
    expect(cardFile('OQ-002')).toContain('State: Open');
  });

  it('RF-241 changes nothing and logs nothing for a question that is still Open', async () => {
    const { test, ref, run, amy, url, cardFile } = await setup();
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Open' },
      { id: 'OQ-002', area: 'Orders', state: 'Open' },
    ]);
    const before = cardFile('OQ-001');

    const response = await amy.request({ method: 'POST', url: `${url}/OQ-001/reopen` });

    expect(response.statusCode).toBe(200);
    expect(cardFile('OQ-001')).toBe(before);
    expect(test.logger.entries.filter((entry) => /reopened/iu.test(entry.message))).toEqual([]);
  });

  it('RF-1105 answers 404 for a card the run has no question for and for another user', async () => {
    const { test, ref, run, amy, bob, url, cardFile } = await setup();
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
    ]);

    const unknown = await amy.request({ method: 'POST', url: `${url}/OQ-009/reopen` });
    const other = await bob.request({ method: 'POST', url: `${url}/OQ-001/reopen` });

    expect(unknown.statusCode).toBe(404);
    expect(other.statusCode).toBe(404);
    expect(cardFile('OQ-001')).toContain('State: Answered');
  });
});

describe('POST /api/runs/:runId/answers/:cardId/reopen, a run that has not ended', () => {
  it('RF-241 RF-1105 P2-44 answers 409 and changes nothing while the run has not ended', async () => {
    const { test, ref, run, amy, url, cardFile } = await setup({ ended: false });
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
    ]);

    const response = await amy.request({ method: 'POST', url: `${url}/OQ-001/reopen` });

    expect(response.statusCode).toBe(409);
    expect(cardFile('OQ-001')).toContain('State: Answered');
    expect(test.logger.entries.filter((entry) => /reopened/iu.test(entry.message))).toEqual([]);
  });

  it('RF-241 P2-44 answers 409 for a run that is still queued', async () => {
    const { test, ref, run, amy, url, cardFile } = await setup({ ended: false, queued: true });
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
    ]);

    const response = await amy.request({ method: 'POST', url: `${url}/OQ-001/reopen` });

    expect(run.queueState).toBe('Queued');
    expect(response.statusCode).toBe(409);
    expect(cardFile('OQ-001')).toContain('State: Answered');
  });

  it('RF-1105 P2-44 answers 404, not 409, for another user and for an unknown card', async () => {
    const { test, ref, run, amy, bob, url } = await setup({ ended: false });
    seedQuestionCards(test.answerFiles, ref, run.runKey, [
      { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
    ]);

    const other = await bob.request({ method: 'POST', url: `${url}/OQ-001/reopen` });
    const unknown = await amy.request({ method: 'POST', url: `${url}/OQ-009/reopen` });

    expect(other.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
  });
});

describe('POST /api/runs/:runId/answers/:cardId/reopen, forged requests', () => {
  const refusals: [string, { origin?: string | null; csrf?: string | false }][] = [
    ['no Origin', { origin: null }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['no CSRF token', { csrf: false }],
    ['a wrong CSRF token', { csrf: 'not-the-token' }],
  ];

  it.each(refusals)(
    'RF-1105 refuses a reopen with %s and changes nothing',
    async (_name, extra) => {
      const { test, ref, run, amy, url, cardFile } = await setup();
      seedQuestionCards(test.answerFiles, ref, run.runKey, [
        { id: 'OQ-001', area: 'Catalog', state: 'Answered' },
      ]);

      const response = await amy.request({ method: 'POST', url: `${url}/OQ-001/reopen`, ...extra });

      expect(response.statusCode).toBe(403);
      expect(cardFile('OQ-001')).toContain('State: Answered');
    },
  );
});
