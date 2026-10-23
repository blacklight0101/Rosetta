import { describe, expect, it } from 'vitest';
import { MemoizedMasker } from '../../../../src/infrastructure/guards/memoized-masker.js';
import {
  SecretMasker,
  type TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RNF-003, RF-1011 (P5-22): remembering the masker's answers changes nothing but how often it runs.

function counting(): { masker: TextMasker; calls: () => number } {
  const inner = new SecretMasker();
  let count = 0;
  return {
    masker: {
      mask: (text) => {
        count += 1;
        return inner.mask(text);
      },
    },
    calls: () => count,
  };
}

describe('MemoizedMasker', () => {
  it('RNF-003 gives the answer of the masker it wraps, secrets included', () => {
    const plain = new SecretMasker();
    const memo = new MemoizedMasker(new SecretMasker());
    for (const text of ['hello', `key ${fakeOpenAiKey}`, 'hello', `key ${fakeOpenAiKey}`]) {
      expect(memo.mask(text)).toEqual(plain.mask(text));
    }
  });

  it('RF-1011 asks the masker once for a short text it sees again', () => {
    const { masker, calls } = counting();
    const memo = new MemoizedMasker(masker);

    memo.mask('latencyMs');
    memo.mask('latencyMs');

    expect(calls()).toBe(1);
  });

  it('RF-1011 does not remember a long text', () => {
    const { masker, calls } = counting();
    const memo = new MemoizedMasker(masker);
    const long = 'x'.repeat(1000);

    memo.mask(long);
    memo.mask(long);

    expect(calls()).toBe(2);
  });
});
