import { describe, expect, it } from 'vitest';
import { tilesOf } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { failedAreasOf } from '../../../web/src/lib/live-run/run-summary.js';
import { agentEnded, cardProposed, planned, stateAfter } from './live-run-fixtures.js';

// RF-208, RF-1016: the failed areas of the notice and the gap tiles of the code map are one
// notion. An area whose agent ended without a usable card is both; an area that gave a card is
// neither, whatever way its agent ended.

const codeMap = [{ name: 'Catalog', estimatedTokens: 9_000, thirdParty: false }];
const endings = ['Failed', 'InvalidOutput', 'StoppedByCap', 'TurnLimitReached'] as const;

describe('the failed areas and the code map agree', () => {
  it.each(endings)('RF-208 an area whose agent ended %s without a card is a gap tile', (ending) => {
    const state = stateAfter(planned(1, 'r1', 'Catalog'), agentEnded(2, 'r1', ending));

    expect(failedAreasOf(state).map((each) => each.area)).toEqual(['Catalog']);
    expect(tilesOf(state, codeMap).map((tile) => tile.state)).toEqual(['gap']);
  });

  it.each(endings.filter((each) => each !== 'Failed' && each !== 'InvalidOutput'))(
    'RF-208 an area whose agent ended %s with a card is read, not a gap',
    (ending) => {
      const state = stateAfter(
        planned(1, 'r1', 'Catalog'),
        cardProposed(2, 'r1', 'FEAT-001'),
        agentEnded(3, 'r1', ending, 1),
      );

      expect(failedAreasOf(state)).toEqual([]);
      expect(tilesOf(state, codeMap).map((tile) => tile.state)).toEqual(['done']);
    },
  );
});
