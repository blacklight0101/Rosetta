import { describe, expect, it } from 'vitest';
import { keptPriorCards, keptRunCards } from '../../../src/presentation/kept-card-readers.js';
import { MemoryOutputWriter } from '../../support/memory-output-writer.js';

// RF-604, RF-1011 (P5-28): journey, plan estimate and plan source over one writer share one reader
// of the run's cards, so the card files are parsed once for the three of them.

describe('kept card readers', () => {
  it('RF-604 gives the same reader for the same writer and another for another writer', () => {
    const [one, two] = [new MemoryOutputWriter(), new MemoryOutputWriter()];

    expect(keptRunCards(one)).toBe(keptRunCards(one));
    expect(keptPriorCards(one)).toBe(keptPriorCards(one));
    expect(keptRunCards(one)).not.toBe(keptRunCards(two));
  });
});
