import { describe, expect, it } from 'vitest';
import { parsePlanOptionsAnswer } from '../../../../src/application/planning/plan-options-answer.js';
import { validDraft } from '../../../support/plan-options-fixtures.js';

// RF-608, RF-609, ADR-013: the planner's answer is read as JSON the way every model answer is: fenced
// or inside prose, never trusting an unknown shape.

const json = JSON.stringify(validDraft());

describe('the planner answer', () => {
  it('RF-608 is read from fenced JSON and from JSON inside prose', () => {
    const fenced = parsePlanOptionsAnswer(`Here you are.\n\`\`\`json\n${json}\n\`\`\`\n`);
    const prose = parsePlanOptionsAnswer(`My answer is ${json} and that is all.`);

    expect(fenced).toEqual(validDraft());
    expect(prose).toEqual(validDraft());
  });

  it('RF-608 is no answer when it is not an object of that shape', () => {
    expect(parsePlanOptionsAnswer('I would use microservices.')).toBeUndefined();
    expect(parsePlanOptionsAnswer('{}')).toBeUndefined();
    expect(parsePlanOptionsAnswer('{"architecture": {"recommended": "clean"}}')).toBeUndefined();
    expect(parsePlanOptionsAnswer('[1, 2]')).toBeUndefined();
  });

  it('RF-609 is no answer when a layer holds a number or too many options', () => {
    const many = {
      ...validDraft(),
      stack: [{ layer: 'database', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    };
    const number = { ...validDraft(), stack: [{ layer: 'database', options: [1, 2] }] };

    expect(parsePlanOptionsAnswer(JSON.stringify(many))).toBeUndefined();
    expect(parsePlanOptionsAnswer(JSON.stringify(number))).toBeUndefined();
  });
});
