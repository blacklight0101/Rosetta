import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1007, RF-240, RF-1105: GET and PUT /api/runs/:runId/answers through the server with a session.
// The answers file is the real adapter over a memory writer, so what the routes change is the text of
// the project's answers.md.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly run: Run;
  readonly earlier: Run;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const owner = actorOf(amyUser.account);
  // Two runs of one project, so their questions share one answers.md.
  const shared = sampleProject({ userId: owner.userId });
  const submit = async (): Promise<Run> => {
    const outcome = await test.runs.submit.execute({
      ...{ actor: owner, project: shared, stage: 'understand', options: {} },
    });
    if (!outcome.ok) throw new Error('The run was not accepted');
    return outcome.value.run;
  };
  const earlier = await submit();
  const run = await submit();
  const project = { userId: run.userId, projectId: run.projectId };
  await test.answers.addQuestions(project, [
    {
      cardId: 'OQ-001',
      runKey: earlier.runKey,
      question: 'Are orders deleted?',
      context: 'a:1-2 x',
    },
  ]);
  await test.answers.addQuestions(project, [
    { cardId: 'OQ-001', runKey: run.runKey, question: 'Is stock shown?', context: 'b:3-4 y' },
    { cardId: 'OQ-002', runKey: run.runKey, question: 'Who edits prices?', context: 'c:5-6 z' },
  ]);
  return {
    test,
    run,
    earlier,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const answersUrl = (run: Run): string => `/api/runs/${run.id}/answers`;
const fileOf = (test: TestServer, run: Run): string =>
  test.answerFiles.files.get(`projects/${run.projectId}/answers.md`) ?? '';

describe('GET /api/runs/:runId/answers', () => {
  it("RF-1007 lists the run's open questions with their context and answers", async () => {
    const { amy, run } = await setup();

    const response = await amy.request({ method: 'GET', url: answersUrl(run) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      questions: [
        { cardId: 'OQ-001', question: 'Is stock shown?', context: 'b:3-4 y', answer: '' },
        { cardId: 'OQ-002', question: 'Who edits prices?', context: 'c:5-6 z', answer: '' },
      ],
    });
  });
});

describe('PUT /api/runs/:runId/answers', () => {
  it('RF-1007 records an answer in answers.md and keeps the other answers', async () => {
    const { test, amy, run, earlier } = await setup();
    await amy.request({
      method: 'PUT',
      url: answersUrl(earlier),
      payload: { answers: [{ cardId: 'OQ-001', answer: 'Never.' }] },
    });
    await amy.request({
      method: 'PUT',
      url: answersUrl(run),
      payload: { answers: [{ cardId: 'OQ-001', answer: 'Yes, greyed out.' }] },
    });

    const response = await amy.request({
      method: 'PUT',
      url: answersUrl(run),
      payload: { answers: [{ cardId: 'OQ-002', answer: 'Only managers.' }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      questions: [
        { cardId: 'OQ-001', answer: 'Yes, greyed out.' },
        { cardId: 'OQ-002', answer: 'Only managers.' },
      ],
    });
    const text = fileOf(test, run);
    expect(text).toContain('- Answer: Never.');
    expect(text).toContain('- Answer: Yes, greyed out.');
    expect(text).toContain('- Answer: Only managers.');
  });
});

describe('PUT /api/runs/:runId/answers refusals', () => {
  it('RF-1007 answers 404 for a card id the run has no question for, and writes nothing', async () => {
    const { test, amy, run } = await setup();
    const before = fileOf(test, run);

    const response = await amy.request({
      method: 'PUT',
      url: answersUrl(run),
      payload: { answers: [{ cardId: 'OQ-003', answer: 'Hm.' }] },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(fileOf(test, run)).toBe(before);
  });
});

describe('PUT /api/runs/:runId/answers and its body', () => {
  it.each([
    ['no answers list', {}],
    ['an unknown field', { answers: [], extra: true }],
    ['a card id that is not an open question', { answers: [{ cardId: 'BR-001', answer: 'x' }] }],
    ['an answer that is not text', { answers: [{ cardId: 'OQ-001', answer: 5 }] }],
    ['an answer above the limit', { answers: [{ cardId: 'OQ-001', answer: 'a'.repeat(4001) }] }],
    [
      'the same question twice',
      {
        answers: [
          { cardId: 'OQ-001', answer: 'a' },
          { cardId: 'OQ-001', answer: 'b' },
        ],
      },
    ],
  ])('RF-1007 answers 400 for a body with %s', async (_name, payload) => {
    const { test, amy, run } = await setup();
    const before = fileOf(test, run);

    const response = await amy.request({ method: 'PUT', url: answersUrl(run), payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(fileOf(test, run)).toBe(before);
  });
});

describe('answers and access', () => {
  it("RF-1105 answers 404 for another user's run, like an unknown one, and writes nothing", async () => {
    const { test, bob, run } = await setup();
    const before = fileOf(test, run);
    const payload = { answers: [{ cardId: 'OQ-001', answer: 'Not mine.' }] };

    const read = await bob.request({ method: 'GET', url: answersUrl(run) });
    const write = await bob.request({ method: 'PUT', url: answersUrl(run), payload });
    const unknown = await bob.request({
      method: 'PUT',
      url: '/api/runs/not-a-uuid/answers',
      payload,
    });

    expect(read.statusCode).toBe(404);
    expect(write.statusCode).toBe(404);
    expect(write.json()).toEqual(unknown.json());
    expect(fileOf(test, run)).toBe(before);
  });
});

function answersOf(count: number): { cardId: string; answer: string }[] {
  return Array.from({ length: count }, (_value, index) => ({
    cardId: `OQ-${String(index + 1).padStart(3, '0')}`,
    answer: 'ok',
  }));
}

describe('PUT /api/runs/:runId/answers limits', () => {
  it('RF-1007 refuses 51 answers with RST-2000 and takes 50 past the shape check', async () => {
    const { test, amy, run } = await setup();
    const before = fileOf(test, run);

    const over = await amy.request({
      method: 'PUT',
      url: answersUrl(run),
      payload: { answers: answersOf(51) },
    });
    const atLimit = await amy.request({
      method: 'PUT',
      url: answersUrl(run),
      payload: { answers: answersOf(50) },
    });

    expect(over.statusCode).toBe(400);
    expect(over.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    // Fifty answers pass the shape check; the run has no such questions, so it is a 404, not a 400.
    expect(atLimit.statusCode).toBe(404);
    expect(fileOf(test, run)).toBe(before);
  });

  it('RF-1007 accepts an answer of 4000 characters', async () => {
    const { amy, run } = await setup();

    const response = await amy.request({
      method: 'PUT',
      url: answersUrl(run),
      payload: { answers: [{ cardId: 'OQ-001', answer: 'a'.repeat(4000) }] },
    });

    expect(response.statusCode).toBe(200);
  });

  it('RF-1007 refuses a body one byte above 256 KiB with RST-2000 and reads one at the limit', async () => {
    const { test, amy, run } = await setup();
    const limit = 256 * 1024;
    const body = (pad: number): string =>
      `${JSON.stringify({ answers: [{ cardId: 'OQ-001', answer: 'a' }] })}${' '.repeat(pad)}`;
    const empty = Buffer.byteLength(body(0));
    const send = (pad: number) =>
      amy.request({
        method: 'PUT',
        url: answersUrl(run),
        payload: body(pad),
        headers: { 'content-type': 'application/json' },
      });

    const atLimit = await send(limit - empty);
    const recorded = fileOf(test, run);
    const over = await send(limit - empty + 1);

    // Trailing spaces are valid JSON: a body of exactly 256 KiB is read and recorded.
    expect(atLimit.statusCode).toBe(200);
    expect(over.statusCode).toBe(400);
    expect(over.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(recorded).toContain('- Answer: a\n');
    expect(fileOf(test, run)).toBe(recorded);
  });
});

describe('PUT /api/runs/:runId/answers and CSRF', () => {
  it.each([
    ['no token', false],
    ['a wrong token', 'not-the-token'],
  ] as const)(
    'RF-1009 refuses a request with %s with 403 and writes nothing',
    async (_name, csrf) => {
      const { test, amy, run } = await setup();
      const before = fileOf(test, run);

      const response = await amy.request({
        method: 'PUT',
        url: answersUrl(run),
        payload: { answers: [{ cardId: 'OQ-001', answer: 'Sneaky.' }] },
        csrf,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
      expect(fileOf(test, run)).toBe(before);
    },
  );
});
