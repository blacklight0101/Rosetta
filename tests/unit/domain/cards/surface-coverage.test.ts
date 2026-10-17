import { describe, expect, it } from 'vitest';
import { surfaceCoverage } from '../../../../src/domain/cards/area-coverage.js';

// RF-263, RF-230: the coverage of an area counts the FLOW and SCRN cards it gave and says whether
// the code map marked it for them.

describe('the flow and screen coverage of an area', () => {
  it('RF-263 counts the flow and the screen cards of the area and no other type', () => {
    const cards = [
      { type: 'FLOW' as const },
      { type: 'FLOW' as const },
      { type: 'SCRN' as const },
      { type: 'BR' as const },
      { type: 'OQ' as const },
    ];

    expect(surfaceCoverage({ flows: true, screens: true }, cards)).toEqual({
      flowsMarked: true,
      screensMarked: true,
      flowCards: 2,
      screenCards: 1,
    });
  });

  it('RF-261 an area with no pages is coverage with the screens unmarked and none written', () => {
    expect(surfaceCoverage({ flows: true, screens: false }, [{ type: 'FLOW' as const }])).toEqual({
      flowsMarked: true,
      screensMarked: false,
      flowCards: 1,
      screenCards: 0,
    });
  });
});
