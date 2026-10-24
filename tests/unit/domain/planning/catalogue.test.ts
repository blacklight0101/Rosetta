import { noStackData } from '../../../../src/domain/planning/stack-data.js';
import { describe, expect, it } from 'vitest';
import {
  catalogueProblems,
  defaultPrinciples,
  isArchitectureStyleId,
} from '../../../../src/domain/planning/catalogue.js';
import { completeEntries, sampleEntry } from '../../../support/catalogue-fixtures.js';

// RF-606, DEC-74: the catalogue's completeness rules and the defaults of a new brief.

describe('catalogueProblems', () => {
  it('RF-606 a catalogue with every group and the six styles has no problem', () => {
    expect(catalogueProblems(completeEntries())).toEqual([]);
  });

  it('RF-606 names an id that appears twice', () => {
    const entries = [...completeEntries(), sampleEntry('method-entry', 'method')];

    expect(catalogueProblems(entries)).toEqual(['The entry method-entry appears more than once.']);
  });

  it('RF-606 names a group without entries', () => {
    const entries = completeEntries().filter((entry) => entry.group !== 'security');

    expect(catalogueProblems(entries)).toEqual(['The group security has no entry.']);
  });

  it('RF-606 names an architecture style that is missing', () => {
    const entries = completeEntries().filter((entry) => entry.id !== 'hexagonal');

    expect(catalogueProblems(entries)).toEqual(['The architecture style hexagonal is missing.']);
  });
});

describe('defaultPrinciples', () => {
  it('RF-606 lists the ids switched on by default, sorted', () => {
    const entries = [
      sampleEntry('tdd', 'method', true),
      sampleEntry('mikado', 'modernisation'),
      sampleEntry('adrs', 'documentation', true),
    ];

    expect(
      defaultPrinciples({ version: 1, sha256: '', entries, styles: [], stack: noStackData }),
    ).toEqual(['adrs', 'tdd']);
  });
});

describe('isArchitectureStyleId', () => {
  it('RF-606 knows the six styles and nothing else', () => {
    expect(isArchitectureStyleId('clean')).toBe(true);
    expect(isArchitectureStyleId('solid')).toBe(false);
  });
});
