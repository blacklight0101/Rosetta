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

describe('the failed areas of the read step', () => {
  it('EV-16 an area with an agent that ended without a card counts as failed, as the tiles and the notice do', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      planned(2, 'r1', 'Catalog'),
      planned(3, 'r2', 'Models'),
      planned(4, 'r3', 'Setup'),
      agentStarted(5, 'r1', 'Catalog'),
      agentEnded(6, 'r1', 'TurnLimitReached'),
      agentStarted(7, 'r2', 'Models'),
      cardProposed(8, 'r2', 'BR-002', 1),
      agentEnded(9, 'r2', 'Failed', 1),
      agentStarted(10, 'r3', 'Setup'),
      agentEnded(11, 'r3', 'Done', 0),
    );

    expect(readDetail(state)).toBe('2 of 3 areas, 1 failed');
  });

  it('EV-16 a turn-limited area with no card is failed, not read (1 of 2, 1 failed)', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      planned(2, 'r1', 'Catalog'),
      planned(3, 'r2', 'Models'),
      agentStarted(4, 'r1', 'Catalog'),
      agentEnded(5, 'r1', 'TurnLimitReached'),
      agentStarted(6, 'r2', 'Models'),
      agentEnded(7, 'r2', 'Done', 0),
    );

    expect(readDetail(state)).toBe('1 of 2 areas, 1 failed');
  });

  it('EV-16 an area whose earlier agent ended without a card is failed even if a later agent wrote cards', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      planned(2, 'r1', 'Catalog'),
      planned(3, 'r2', 'Catalog'),
      agentStarted(4, 'r1', 'Catalog'),
      agentEnded(5, 'r1', 'TurnLimitReached'),
      agentStarted(6, 'r2', 'Catalog'),
      cardProposed(7, 'r2', 'BR-003', 1),
      agentEnded(8, 'r2', 'Done', 1),
    );

    expect(readDetail(state)).toBe('0 of 1 areas, 1 failed');
  });
});

/** The detail of the read step of a running understand run in this state. */
function readDetail(state: ReturnType<typeof stateAfter>): string | undefined {
  const steps = journeyOf({
    stage: 'understand',
    phase: { kind: 'running' },
    state,
    tiles: tilesOf(state, undefined),
  });
  return steps.find((step) => step.key === 'read')?.detail;
}
