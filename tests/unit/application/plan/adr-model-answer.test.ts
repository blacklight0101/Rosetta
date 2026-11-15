import { describe, expect, it } from 'vitest';
import { parseAdrModelAnswer } from '../../../../src/application/plan/adr-model-answer.js';

// RF-623, P9-15, ADR-013: the answer of the check of the data model against the decision records is
// untrusted text, read as one bounded JSON object; anything else is no answer.

const entry = { decision: 'ADR-001', structure: 'catalog_hilo', reason: 'The item ids.' };

describe('the answer of the check of the data model against the decisions', () => {
  it('RF-623 P9-15 reads the structures each record needs, fenced like the other answers', () => {
    const text = `Here it is:\n\`\`\`json\n${JSON.stringify({ missing: [entry] })}\n\`\`\``;

    expect(parseAdrModelAnswer(text)).toEqual({ missing: [entry] });
  });

  it('RF-623 P9-15 an empty list is an answer', () => {
    expect(parseAdrModelAnswer('{"missing": []}')).toEqual({ missing: [] });
  });

  it.each([
    ['prose', 'Every record has its tables.'],
    ['no list', '{"tables": []}'],
    ['a record by number', JSON.stringify({ missing: [{ ...entry, decision: 1 }] })],
    ['an empty structure', JSON.stringify({ missing: [{ ...entry, structure: ' ' }] })],
    ['too many entries', JSON.stringify({ missing: Array.from({ length: 101 }, () => entry) })],
    [
      'a structure too long',
      JSON.stringify({ missing: [{ ...entry, structure: 'a'.repeat(201) }] }),
    ],
  ])('RF-623 P9-15 %s is no answer', (_, text) => {
    expect(parseAdrModelAnswer(text)).toBeUndefined();
  });
});
