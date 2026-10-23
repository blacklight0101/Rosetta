import { describe, expect, it } from 'vitest';
import { cardsText, tilesOf } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { journeyOf } from '../../../web/src/lib/live-run/journey.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  deepenStarted,
  ev,
  planned,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';

// RF-1015, RF-1016, RF-209 (EV-16): the read step counts the areas read, not the areas that failed,
// and a Deepen tile says that its cards are the new ones the Deepen wrote.

describe('the run journey and the code map of a run', () => {
  it('EV-16 an area whose agent failed is not counted as read', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      planned(2, 'r1', 'Catalog'),
      planned(3, 'r2', 'Models'),
      planned(4, 'r3', 'Setup'),
      agentStarted(5, 'r1', 'Catalog'),
      agentEnded(6, 'r1', 'Done', 1),
      agentStarted(7, 'r2', 'Models'),
      agentEnded(8, 'r2', 'Failed'),
      agentStarted(9, 'r3', 'Setup'),
      agentEnded(10, 'r3', 'Failed'),
    );
    const steps = journeyOf({
      stage: 'understand',
      phase: { kind: 'running' },
      state,
      tiles: tilesOf(state, undefined),
    });

    expect(steps.find((step) => step.key === 'read')?.detail).toBe('1 of 3 areas, 2 failed');
  });

  it('EV-16 a tile of a Deepen run counts the new cards its agents wrote', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      deepenStarted(2, 3),
      planned(3, 'r1', 'Catalog'),
      agentStarted(4, 'r1', 'Catalog'),
      cardProposed(5, 'r1', 'BR-001', 1),
      agentEnded(6, 'r1', 'Done', 1),
    );
    const catalog = tilesOf(state, undefined).find((tile) => tile.name === 'Catalog');

    expect(catalog === undefined ? '' : cardsText(catalog)).toBe('1 new card');
  });
});
