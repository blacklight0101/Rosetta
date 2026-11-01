import { describe, expect, it } from 'vitest';
import { legacyFactsOf } from '../../../../src/domain/planning/application-kind.js';
import { buildBrief, type PlanningBrief } from '../../../../src/domain/planning/planning-brief.js';
import { stackOfferFor } from '../../../../src/domain/planning/stack-offer.js';
import { proposeFor } from '../../../../src/domain/planning/stack-proposal.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { webFormsFiles } from '../../../support/proposal-scans.js';

// P7-30, RF-609, RF-624, RF-645, DEC-178: a typed answer that names only a platform is not specific.

const stack = shippedCatalogue.stack;
const web = legacyFactsOf({ files: webFormsFiles, sqlStatements: [] }, stack.proposals.signals);

function briefOf(answers: Parameters<typeof buildBrief>[0]): PlanningBrief {
  return { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-30T09:00:00.000Z' };
}

const typed = (layer: 'front-end' | 'backend-framework' | 'testing', choice: string) =>
  ({ layer, choice, custom: true }) as const;

describe('proposeFor: a typed answer that names only a platform (P7-30)', () => {
  it('RF-609 treats ".net" and "default" as open layers and proposes a concrete technology', () => {
    const made = proposeFor(
      briefOf({
        stack: [
          typed('front-end', '.net'),
          typed('backend-framework', '.NET'),
          typed('testing', 'default'),
        ],
      }),
      web,
      stack,
    );

    for (const layer of ['front-end', 'backend-framework', 'testing']) {
      const entry = made.brief.stack.find((each) => each.layer === layer);
      expect(entry?.proposed).toBe(true);
      expect(entry?.custom).toBe(false);
      expect(['.net', 'default']).not.toContain(entry?.choice.toLowerCase());
      expect(made.proposal.layers.map((each) => each.layer)).toContain(layer);
    }
    expect(made.brief.stack.find((each) => each.layer === 'front-end')?.choice).toBe('Razor Pages');
    expect(made.brief.stack).toHaveLength(7);
  });

  it('RF-609 a concrete typed technology is unchanged', () => {
    const owner = typed('front-end', 'Blazor Server');
    const made = proposeFor(briefOf({ stack: [owner] }), web, stack);

    expect(made.brief.stack.find((each) => each.layer === 'front-end')).toEqual(owner);
    expect(made.proposal.layers.map((each) => each.layer)).not.toContain('front-end');
  });

  it('RF-609 a platform answer takes the options of that platform, not those of the code map', () => {
    const nothing = legacyFactsOf({ files: [], sqlStatements: [] }, stack.proposals.signals);
    const made = proposeFor(briefOf({ stack: [typed('front-end', 'dotnet')] }), nothing, stack);

    expect(made.brief.stack.find((each) => each.layer === 'front-end')?.choice).toBe('Razor Pages');
  });
});

describe('stackOfferFor: the choices for a vague typed answer (P7-30)', () => {
  it('RF-645 lists the words and the .NET choices of the layer, the recommended first', () => {
    const offer = stackOfferFor(
      { kind: 'web', languages: ['csharp'], extensions: [], workbook: false },
      stack,
    );
    const frontEnd = offer.find((each) => each.layer === 'front-end') as unknown as {
      vague?: { words: string[]; proposals: { choice: string }[] }[];
    };

    const dotnet = frontEnd.vague?.find((each) => each.words.includes('.net'));
    expect(dotnet?.proposals[0]?.choice).toBe('Razor Pages');
    expect(frontEnd.vague?.some((each) => each.words.includes('default'))).toBe(true);
    expect(frontEnd.vague?.some((each) => each.words.includes('java'))).toBe(true);
  });
});
