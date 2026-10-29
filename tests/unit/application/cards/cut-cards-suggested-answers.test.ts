import { describe, expect, it } from 'vitest';
import { readCutCards } from '../../../../src/application/cards/cut-cards.js';
import { cardObject } from '../../../support/card-output.js';

// RF-645, RF-208, Q-55: the finished cards of a cut-off answer are read by the same rule as a whole
// answer, so with suggested answers required an OQ card without them is refused, not kept.

const checkout = cardObject({ title: 'Checkout' });
const bareQuestion = cardObject({
  type: 'OQ',
  title: 'Tax rounding',
  question: 'Which rounding rule does finance want?',
  whyItMatters: 'The totals differ by a cent.',
});
const whole = JSON.stringify({ cards: [checkout, bareQuestion, cardObject({ title: 'Mailer' })] });
const cut = whole.slice(0, whole.lastIndexOf('Mailer'));

describe('RF-645 the finished cards of a cut-off answer', () => {
  it('RF-645 an OQ card without suggested answers is refused when they are required', () => {
    const read = readCutCards(cut, new Map(), { suggestedAnswers: 'required' });

    expect(read?.drafts.map((draft) => draft.title)).toEqual(['Checkout']);
    expect(read?.problems.map((problem) => problem.path)).toEqual([
      'cards.1.suggestedAnswers',
      'cards.2',
    ]);
  });

  it('RF-243 the same card is kept when suggested answers are optional', () => {
    const read = readCutCards(cut);

    expect(read?.drafts.map((draft) => draft.title)).toEqual(['Checkout', 'Tax rounding']);
  });
});
