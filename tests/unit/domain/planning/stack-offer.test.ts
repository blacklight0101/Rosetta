import { describe, expect, it } from 'vitest';
import { stackLayers } from '../../../../src/domain/planning/planning-brief.js';
import { stackOfferFor } from '../../../../src/domain/planning/stack-offer.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// P7-29, RF-609, RF-645, DEC-203: the two catalogue proposals of each layer and whether the legacy
// technology may be kept.

const stack = shippedCatalogue.stack;
const dotnet = { kind: 'web', languages: ['csharp', 'aspnet'], workbook: false } as const;

describe('stackOfferFor', () => {
  it('RF-645 offers two proposals for each layer of a current .NET web stack, the first recommended', () => {
    const offer = stackOfferFor(dotnet, stack);
    expect(offer.map((each) => each.layer)).toEqual([...stackLayers]);
    for (const layer of offer) {
      expect(layer.proposals).toHaveLength(2);
      expect(layer.proposals[0]?.choice).not.toBe(layer.proposals[1]?.choice);
      expect(layer.keepLegacy).toBe(true);
    }
    const language = offer.find((each) => each.layer === 'language-runtime');
    expect(language?.proposals[0]?.choice).toBe('C# on .NET');
  });

  it('DEC-203 does not offer keeping an end-of-life legacy technology', () => {
    const offer = stackOfferFor({ ...dotnet, languages: ['vba'] }, stack);
    expect(offer.every((each) => !each.keepLegacy)).toBe(true);
  });

  it('DEC-203 limits the flag to the layers of the legacy technology', () => {
    const offer = stackOfferFor({ ...dotnet, languages: ['wcf'] }, stack);
    expect(offer.find((each) => each.layer === 'backend-framework')?.keepLegacy).toBe(false);
    expect(offer.find((each) => each.layer === 'database')?.keepLegacy).toBe(true);
  });

  it('DEC-203 does not offer keeping the legacy technology for an Excel workbook', () => {
    const offer = stackOfferFor({ kind: 'web', languages: [], workbook: true }, stack);
    expect(offer.every((each) => !each.keepLegacy)).toBe(true);
    expect(offer.find((each) => each.layer === 'language-runtime')?.proposals).toHaveLength(2);
  });

  it('RF-609 lists a layer with no catalogue option with no proposal', () => {
    const offer = stackOfferFor({ kind: 'keep', languages: [], workbook: false }, stack);
    expect(offer.every((each) => each.proposals.length === 0 && each.keepLegacy)).toBe(true);
  });

  it('RF-609 offers the same first proposal a skipped layer takes', () => {
    const offer = stackOfferFor(dotnet, stack);
    const first = stack.proposals.options.find(
      (each) => each.kind === 'web' && each.layer === 'data-access',
    );
    expect(offer.find((each) => each.layer === 'data-access')?.proposals[0]?.choice).toBe(
      first?.choice,
    );
  });
});
