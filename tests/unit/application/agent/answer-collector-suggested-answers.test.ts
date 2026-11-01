import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { collectCards, type AskModel } from '../../../../src/application/agent/answer-collector.js';
import type { AnswerText } from '../../../../src/application/agent/cut-answer.js';
import type { ReaderPrompts } from '../../../../src/application/agent/reader-prompts.js';
import { err, ok } from '../../../../src/domain/errors/result.js';
import { testReaderPrompts } from '../../../support/agent-fixtures.js';
import { cardObject } from '../../../support/card-output.js';

// RF-645, RF-243, RF-208, DEC-178: the collector reads an answer with the card format the task
// sent. With card-format v4 an OQ card without suggested answers is refused and the repair request
// (repair.v5) asks for them; a valid reply is kept. With v2 the same card is read as before. An
// answer cut off at the output limit keeps its finished cards by the same rule.

const checkout = cardObject({ title: 'Checkout' });

function answer(label: string, recommended = false): Record<string, unknown> {
  return { answer: label, description: `What ${label} means.`, recommended };
}

const bareQuestion = cardObject({
  type: 'OQ',
  title: 'Tax rounding',
  question: 'Which rounding rule does finance want on invoice totals?',
  whyItMatters: 'The totals differ by a cent between the lines and the sum.',
});

const answeredQuestion = {
  ...bareQuestion,
  suggestedAnswers: [answer('Round each line', true), answer('Round the total'), answer('Both')],
};

const cutCard = cardObject({
  title: 'Mailer',
  claims: [{ text: 'It sends a mail after the order.', citations: ['src/Orders/Mailer.cs:3-9'] }],
});

async function promptsOf(cardFormatVersion: 'v2' | 'v3'): Promise<ReaderPrompts> {
  const name = 'cards/repair.v5.md';
  const text = await readFile(`prompts/${name}`, 'utf8');
  return {
    ...testReaderPrompts,
    cardFormat: {
      ...testReaderPrompts.cardFormat,
      name: `cards/card-format.${cardFormatVersion}.md`,
      version: cardFormatVersion,
    },
    repair: { name, version: 'v4', sha256: '0'.repeat(64), text },
  };
}

function finished(text: string): AnswerText {
  return { text, finishReason: 'stop' };
}

/** The model's side: records each follow-up and answers with the next reply, or fails. */
function model(replies: readonly string[]): { ask: AskModel; sent: string[] } {
  const sent: string[] = [];
  const ask: AskModel = (_previous, message) => {
    const reply = replies[sent.length];
    sent.push(message);
    if (reply === undefined) return Promise.resolve(err({ reason: 'max-turns' }));
    return Promise.resolve(ok(finished(reply)));
  };
  return { ask, sent };
}

const scope = { rows: () => Promise.resolve(undefined) };

function collect(first: AnswerText, prompts: ReaderPrompts, ask: AskModel) {
  return collectCards(first, ask, prompts, scope);
}

describe('RF-645 the collector asks for suggested answers with card-format v4', () => {
  it('RF-645 an OQ card without suggested answers is refused and the repair.v5 request is sent', async () => {
    const prompts = await promptsOf('v3');
    const { ask, sent } = model([JSON.stringify({ cards: [checkout, answeredQuestion] })]);

    const result = await collect(
      finished(JSON.stringify({ cards: [checkout, bareQuestion] })),
      prompts,
      ask,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('cards.1.suggestedAnswers');
    expect(sent[0]).toContain(
      'A problem about `suggestedAnswers` asks for at least three suggested answers',
    );
    expect(result.problems).toEqual([]);
    const question = result.drafts.find((draft) => draft.type === 'OQ');
    expect(question?.suggestedAnswers?.map((each) => each.answer)).toEqual([
      'Round each line',
      'Round the total',
      'Both',
    ]);
  });

  it('RF-243 with card-format v2 the old OQ card is accepted and no repair is sent', async () => {
    const prompts = await promptsOf('v2');
    const { ask, sent } = model([]);

    const result = await collect(
      finished(JSON.stringify({ cards: [checkout, bareQuestion] })),
      prompts,
      ask,
    );

    expect(sent).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
    expect(result.drafts[1]?.suggestedAnswers).toBeUndefined();
  });
});

describe('RF-645 an answer cut off with card-format v4 keeps only valid OQ cards', () => {
  const whole = JSON.stringify({ cards: [checkout, bareQuestion, cutCard] });
  const cut: AnswerText = {
    text: whole.slice(0, whole.indexOf('after the order') + 5),
    finishReason: 'length',
  };

  it('RF-645 the finished OQ card without suggested answers is refused, not kept', async () => {
    const { ask } = model([]);

    const result = await collect(cut, await promptsOf('v3'), ask);

    expect(result.cutKept).toBe(true);
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout']);
    expect(result.problems.map((problem) => problem.path)).toContain('cards.1.suggestedAnswers');
  });

  it('RF-243 with card-format v2 the finished OQ card is kept as before', async () => {
    const { ask } = model([]);

    const result = await collect(cut, await promptsOf('v2'), ask);

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
  });
});
