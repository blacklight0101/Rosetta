import { describe, expect, it } from 'vitest';
import type { TaskResult } from '../../../../src/application/ports/task-results.js';
import { transitionClaim } from '../../../../src/domain/cards/card.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FileTaskResults } from '../../../../src/infrastructure/cards/file-task-results.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardsOf } from '../../../support/card-output-harness.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { openWriter } from '../../../support/open-writer.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-006, RF-141, RNF-002, data-model.md section 3.7a: `task-results.json` keeps what each ended
// reader task left, so a resume can keep it. Masked like every file Rosetta writes; a file it
// cannot read is an error with a code, never guessed.

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const scope = { id: 'run-1', userId, projectId: 'p1', runKey: '20261012-100000-understand' };
const file = `projects/p1/runs/${scope.runKey}/task-results.json`;

function resultOf(): TaskResult {
  const [card] = cardsOf();
  if (card === undefined) throw new Error('No card');
  const verdict = {
    step: 'judgement',
    reason: 'The run stopped at its cap.',
    model: 'run-stopped',
    at: '2026-10-12T10:00:00.000Z',
  } as const;
  const moved = transitionClaim(card, `${card.id}.c1`, 'Unverified', verdict);
  if (!moved.ok) throw new Error('The claim did not move');
  return {
    agentTaskId: 'reader-001',
    area: 'orders',
    state: 'Done',
    turns: 3,
    withoutCards: false,
    cards: [moved.value],
    coverage: {
      area: 'orders',
      files: [{ path: 'src/a.cs', read: [{ startLine: 1, endLine: 9 }] }],
      tokens: 100,
      readTokens: 40,
      readTokenShare: 0.4,
    },
  };
}

describe('FileTaskResults', () => {
  const data = useTempRoot('rosetta-task-results-');

  function open() {
    const writer = openWriter(data.path);
    return { writer, results: new FileTaskResults({ writer, masker: new SecretMasker() }) };
  }

  it('RF-006 reads back what it wrote, claim statuses and verdicts included', async () => {
    const { results } = open();
    const written = [resultOf()];

    await results.write(scope, written);

    expect(await results.read(scope)).toEqual(written);
  });

  it('RF-006 has no results for a run that wrote none', async () => {
    const { results } = open();

    expect(await results.read(scope)).toEqual([]);
  });

  it('RF-141 masks a secret in the text of a card before it is stored', async () => {
    const { writer, results } = open();
    const first = resultOf();
    const [card] = first.cards;
    if (card === undefined) throw new Error('No card');

    await results.write(scope, [
      { ...first, cards: [{ ...card, summary: `key ${fakeOpenAiKey}` }] },
    ]);

    const saved = await writer.readText({ userId, path: file });
    expect(saved.ok && saved.value).not.toContain(fakeOpenAiKey);
    expect(saved.ok && saved.value).toContain('[MASKED:api-key]');
  });
});

describe('FileTaskResults, a file it cannot read', () => {
  const data = useTempRoot('rosetta-task-results-bad-');

  function open() {
    const writer = openWriter(data.path);
    return { writer, results: new FileTaskResults({ writer, masker: new SecretMasker() }) };
  }

  it.each([
    ['text that is not JSON', 'not json'],
    ['a newer schema version', JSON.stringify({ schemaVersion: 2, tasks: [] })],
    [
      'a task without its coverage',
      JSON.stringify({ schemaVersion: 1, tasks: [{ agentTaskId: 'x' }] }),
    ],
  ])('RF-006 refuses a file with %s, with RST-1309', async (_name, text) => {
    const { writer, results } = open();
    await writer.writeText({ userId, path: file }, text);

    await expect(results.read(scope)).rejects.toMatchObject({
      code: ERROR_CODES.taskResultsUnreadable,
    });
  });
});
