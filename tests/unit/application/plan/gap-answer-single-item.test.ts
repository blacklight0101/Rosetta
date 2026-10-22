import { describe, expect, it } from 'vitest';
import { parseGapAnswer } from '../../../../src/application/plan/gap-answer.js';
import { scenario } from '../../../support/task-card-fixtures.js';

// RF-627, Q-54: the single-item rule. When the block held exactly one uncovered item and the answer
// exactly one card that names no builds, the card builds that item; a card that names builds keeps
// them, and an answer of two cards gets no rule.

const bare = {
  title: 'Implement System Dashboard UI',
  phase: 1,
  requirements: [1],
  acceptanceCriteria: [scenario],
  invariant: 'The dashboard shows the system state.',
  riskClass: 'none',
};

const read = (value: unknown, single?: string) => parseGapAnswer(JSON.stringify(value), single);

describe('parseGapAnswer: the single-item rule', () => {
  it('RF-627 the one card that names no builds builds the only uncovered item', () => {
    const answer = read({ tasks: [bare] }, 'screen:SCRN-005');

    expect(answer?.drafts.map((each) => each.builds)).toEqual([['screen:SCRN-005']]);
    expect(answer?.problems).toEqual([]);
    expect(answer?.singleItemRule).toBe('screen:SCRN-005');
  });

  it('RF-627 an empty builds list is a card that names no builds too', () => {
    const answer = read({ tasks: [{ ...bare, builds: [] }] }, 'screen:SCRN-005');

    expect(answer?.drafts.map((each) => each.builds)).toEqual([['screen:SCRN-005']]);
  });

  it('RF-627 a card that names the item keeps its builds and the rule does not apply', () => {
    const named = ['screen:SCRN-005', 'flow:FLOW-007'];
    const answer = read({ tasks: [{ ...bare, builds: named }] }, 'screen:SCRN-005');

    expect(answer?.drafts.map((each) => each.builds)).toEqual([named]);
    expect(answer?.singleItemRule).toBeUndefined();
  });

  it('RF-627 a card that names only a title or other ids builds the one item', () => {
    const answer = read({ tasks: [{ ...bare, builds: ['System Dashboard'] }] }, 'screen:SCRN-005');

    expect(answer?.drafts.map((each) => each.builds)).toEqual([['screen:SCRN-005']]);
    expect(answer?.singleItemRule).toBe('screen:SCRN-005');
  });

  it('RF-627 two cards that name no builds get no rule and are both left out', () => {
    const answer = read({ tasks: [bare, bare] }, 'screen:SCRN-005');

    expect(answer?.drafts).toEqual([]);
    expect(answer?.problems.map((each) => each.field)).toEqual(['builds', 'builds']);
    expect(answer?.singleItemRule).toBeUndefined();
  });

  it('RF-627 without an uncovered item the card is read as before', () => {
    const answer = read({ tasks: [bare] });

    expect(answer?.drafts).toEqual([]);
    expect(answer?.problems.map((each) => each.field)).toEqual(['builds']);
  });
});
