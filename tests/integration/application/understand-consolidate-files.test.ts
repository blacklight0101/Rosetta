import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LlmResponse } from '../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { made } from '../../support/consolidate-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-250, RF-240, DEC-98: a merge whose card files cannot be removed fails the run with the
// refusal's code, but the open questions of the readers still reach answers.md.

describe('an understand run: files of a merge that cannot be removed', UNDERSTAND_TIMEOUT, () => {
  const temp = useTempRoot('rosetta-consolidate-');
  const question = JSON.stringify({
    cards: [
      {
        type: 'OQ',
        title: 'Which items are listed?',
        area: '(root)',
        summary: 'The page lists whatever the service returns.',
        confidence: 'Low',
        claims: [{ text: 'The page shows every item.', citations: ['Default.aspx.cs:8-12'] }],
        question: 'Is any id allowed?',
        whyItMatters: 'The new system must refuse the same ids.',
        suggestedAnswers: [
          {
            answer: 'No, ids are checked',
            description: 'The service refuses unknown ids.',
            recommended: true,
          },
          { answer: 'Yes, any id', description: 'The page lists whatever exists.' },
          {
            answer: 'Yes, within one account',
            description: 'Ids are limited to the signed-in account.',
          },
        ],
      },
    ],
  });

  it('RF-250 RF-240 the open questions are still written, and the run fails with the refusal code', async () => {
    const decorateAnswer = (call: number, response: LlmResponse) =>
      call === 2 ? { ...response, text: question } : response;

    const { h, run } = await made(temp.path, { decorateAnswer, refuseRemoval: true });

    expect(run.endState).toBe('Failed');
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.pathOutsideRoot,
    });
    const answers = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
    expect(answers).toContain('Is any id allowed?');
  });
});
