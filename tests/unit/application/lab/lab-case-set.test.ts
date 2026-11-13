import { describe, expect, it } from 'vitest';
import { parseLabCaseSet } from '../../../../src/application/lab/lab-case-set.js';

// RF-1401, ADR-029: a case set is hand-written data, parsed strictly; a case holds the inputs of a
// prompt, which its target parses.

const valid = {
  schemaVersion: 1,
  version: 'sample-1',
  prompt: 'verifier/claim',
  description: 'A tiny synthetic set.',
  cases: [
    { id: 'a-1', expected: 'Supported', input: { claim: 'x' } },
    { id: 'a-2', split: 'held-back', input: { claim: 'y' } },
  ],
};

describe('the lab case set', () => {
  it('RF-1401 reads a set and gives each case the split `tune` unless it says otherwise', () => {
    const result = parseLabCaseSet(valid);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prompt).toBe('verifier/claim');
    expect(result.value.cases.map((each) => [each.id, each.split, each.expected])).toEqual([
      ['a-1', 'tune', 'Supported'],
      ['a-2', 'held-back', undefined],
    ]);
  });

  it('RF-1401 names every problem: a repeated id, an unknown key and a split that does not exist', () => {
    const result = parseLabCaseSet({
      ...valid,
      stray: true,
      cases: [
        { id: 'a-1', input: {} },
        { id: 'a-1', split: 'other', input: {} },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.error.join('\n');
    expect(text).toContain('stray');
    expect(text).toContain('a-1');
    expect(text).toContain('split');
  });

  it('RF-1401 refuses a set with no case', () => {
    expect(parseLabCaseSet({ ...valid, cases: [] }).ok).toBe(false);
  });
});
