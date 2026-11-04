import { expect, it } from 'vitest';
import { tilesOf, type CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { journeyOf } from '../../../web/src/lib/live-run/journey.js';
import {
  agentEnded,
  agentStarted,
  ev,
  planned,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';

// RF-230, RF-1016 (P8-93, UX-23): a tile whose agents ended is "partly read" when the coverage says
// less than the coverage bar of its first-party tokens was read, and the Read step does not count it
// as read.

const area = (name: string, estimatedTokens: number): CodeAreaInfo => ({
  name,
  estimatedTokens,
  thirdParty: false,
});
const codeMap = [area('Catalog', 9_000), area('Models', 4_000)];

const state = stateAfter(
  ev(1, 'run.started', startedData),
  planned(2, 'r1', 'Catalog'),
  planned(3, 'r2', 'Models'),
  agentStarted(4, 'r1', 'Catalog'),
  agentEnded(5, 'r1', 'Done', 1),
  agentStarted(6, 'r2', 'Models'),
  agentEnded(7, 'r2', 'Done', 1),
);

it('RF-230 a tile that ended below the bar is partly read and keeps its share', () => {
  const tiles = tilesOf(state, codeMap, new Map([['Catalog', 0.16]]));

  expect(tiles.map((tile) => [tile.name, tile.state, tile.readShare])).toEqual([
    ['Catalog', 'partly', 0.16],
    ['Models', 'done', undefined],
  ]);
});

it('RF-230 a tile still being read or waiting is not marked partly read from an earlier listing', () => {
  const working = stateAfter(
    ev(1, 'run.started', startedData),
    planned(2, 'r1', 'Catalog'),
    planned(3, 'r2', 'Models'),
    agentStarted(4, 'r1', 'Catalog'),
  );

  const tiles = tilesOf(
    working,
    codeMap,
    new Map([
      ['Catalog', 0.1],
      ['Models', 0.1],
    ]),
  );

  expect(tiles.map((tile) => tile.state)).toEqual(['reading', 'waiting']);
});

it('RF-230 the Read step counts an area read below the bar as partly read, not as read', () => {
  const tiles = tilesOf(state, codeMap, new Map([['Catalog', 0.16]]));

  const steps = journeyOf({ stage: 'understand', phase: { kind: 'running' }, state, tiles });

  expect(steps.find((step) => step.key === 'read')?.detail).toBe('1 of 2 areas, 1 partly read');
});

it('RF-230 the Read step says nothing of partly read areas when none is', () => {
  const tiles = tilesOf(state, codeMap, new Map());

  const steps = journeyOf({ stage: 'understand', phase: { kind: 'running' }, state, tiles });

  expect(steps.find((step) => step.key === 'read')?.detail).toBe('2 of 2 areas');
});
