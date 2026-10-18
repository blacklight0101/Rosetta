import { describe, expect, it } from 'vitest';
import { parseCoverageAnswer } from '../../../../src/application/plan/coverage-answer.js';

// RF-627, ADR-013: the planner's links are untrusted text, read as one JSON object (fenced or in
// prose) with every list and text bounded. Which ids are items is the domain's decision.

const link = { task: 1, builds: ['feature:F-001', 'table:customer'] };

describe('parseCoverageAnswer', () => {
  it('RF-627 reads a fenced JSON object', () => {
    const answer = '```json\n' + JSON.stringify({ links: [link] }) + '\n```';

    expect(parseCoverageAnswer(answer)).toEqual({ links: [link] });
  });

  it('RF-627 reads the object inside prose', () => {
    const answer = `Here: ${JSON.stringify({ links: [link, { task: 2, builds: [] }] })} Done.`;

    expect(parseCoverageAnswer(answer)?.links).toHaveLength(2);
  });

  it('RF-627 an answer that links nothing is still an answer', () => {
    expect(parseCoverageAnswer('{"links": []}')).toEqual({ links: [] });
  });
});

describe('parseCoverageAnswer: refusals', () => {
  const tooMany = Array.from({ length: 201 }, () => link);

  it.each([
    ['text that is not JSON', 'Everything is covered.'],
    ['an object without links', '{"tasks": []}'],
    ['a link without a task', JSON.stringify({ links: [{ builds: ['feature:F-001'] }] })],
    ['a task position of 0', JSON.stringify({ links: [{ task: 0, builds: [] }] })],
    ['a task position that is not a whole number', JSON.stringify({ links: [{ task: 1.5 }] })],
    ['a link without builds', JSON.stringify({ links: [{ task: 1 }] })],
    ['builds that are not text', JSON.stringify({ links: [{ task: 1, builds: [7] }] })],
    [
      'an id of 301 characters',
      JSON.stringify({ links: [{ task: 1, builds: ['t'.repeat(301)] }] }),
    ],
    [
      '501 ids in one link',
      JSON.stringify({ links: [{ task: 1, builds: Array.from({ length: 501 }, () => 'a') }] }),
    ],
    ['201 links', JSON.stringify({ links: tooMany })],
  ])('RF-627 refuses %s', (_name, answer) => {
    expect(parseCoverageAnswer(answer)).toBeUndefined();
  });

  it('RF-627 takes the first object of the output that reads as links', () => {
    const answer = `{"unrelated": 1} then ${JSON.stringify({ links: [link] })}`;

    expect(parseCoverageAnswer(answer)).toEqual({ links: [link] });
  });
});
