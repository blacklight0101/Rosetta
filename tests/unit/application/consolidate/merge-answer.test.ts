import { describe, expect, it } from 'vitest';
import { parseMergeAnswer } from '../../../../src/application/consolidate/merge-answer.js';

// RF-250, ADR-013: the summariser's answer is untrusted text; only a well-formed list of merges is used.

const answer = {
  merges: [{ ids: ['ENT-001', 'ENT-002'], title: 'Customer', summary: 'A buyer.' }],
};

describe('parseMergeAnswer', () => {
  it('RF-250 reads a list of merges', () => {
    expect(parseMergeAnswer(JSON.stringify(answer))).toEqual(answer.merges);
  });

  it('RF-250 reads a list inside a fence and prose', () => {
    const text = `Here you go:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`\nDone.`;

    expect(parseMergeAnswer(text)).toEqual(answer.merges);
  });

  it('RF-250 an answer with no merge is an empty list, not a failure', () => {
    expect(parseMergeAnswer('{"merges": []}')).toEqual([]);
  });

  it.each([
    ['prose', 'They look alike to me.'],
    ['a different shape', '{"cards": []}'],
    ['a merge without a title', '{"merges":[{"ids":["A-1","A-2"],"summary":"s"}]}'],
    ['ids that are not text', '{"merges":[{"ids":[1,2],"title":"t","summary":"s"}]}'],
    ['an empty title', '{"merges":[{"ids":["A-1","A-2"],"title":"  ","summary":"s"}]}'],
    [
      'a title of 201 characters',
      JSON.stringify({ merges: [{ ids: ['A-1', 'A-2'], title: 'x'.repeat(201), summary: 's' }] }),
    ],
  ])('RF-250 %s gives no merge at all', (_name, text) => {
    expect(parseMergeAnswer(text)).toBeUndefined();
  });

  it('RF-250 a key that could change a prototype is dropped', () => {
    const text = '{"merges":[{"ids":["A-1","A-2"],"title":"t","summary":"s","__proto__":{"x":1}}]}';

    const merges = parseMergeAnswer(text);

    expect(merges).toEqual([{ ids: ['A-1', 'A-2'], title: 't', summary: 's' }]);
    expect(Object.keys(merges?.[0] ?? {})).not.toContain('__proto__');
  });
});
