import { expect, it } from 'vitest';
import { tilesOf, type CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  ev,
  planned,
  stateAfter,
  toolCalled,
  toolResult,
  turn,
} from './live-run-fixtures.js';

// RF-1016 (P1-169): the tiles of the living code map, folded from the areas of the code map (with
// their estimated tokens and whether they are third-party) and the agents of the run.

const area = (name: string, estimatedTokens: number, thirdParty = false): CodeAreaInfo => ({
  name,
  estimatedTokens,
  thirdParty,
});

const codeMap = [area('Catalog', 9_000), area('Models', 4_000), area('Setup', 500)];

it('RF-1016 is sized by the estimated tokens of its area', () => {
  const tiles = tilesOf(stateAfter(), codeMap);

  expect(tiles.map((tile) => [tile.name, tile.columns, tile.rows])).toEqual([
    ['Catalog', 4, 3],
    ['Models', 3, 2],
    ['Setup', 2, 1],
  ]);
});

it('RF-1016 waits until its agent starts, is being read while the agent works and is read when it ends', () => {
  const planning = stateAfter(planned(1, 'r1', 'Catalog'), planned(2, 'r2', 'Models'));
  const working = stateAfter(
    planned(1, 'r1', 'Catalog'),
    planned(2, 'r2', 'Models'),
    agentStarted(3, 'r1', 'Catalog'),
  );
  const ended = stateAfter(
    planned(1, 'r1', 'Catalog'),
    planned(2, 'r2', 'Models'),
    agentStarted(3, 'r1', 'Catalog'),
    agentEnded(4, 'r1', 'Done', 0),
  );

  const states = (state: ReturnType<typeof stateAfter>): readonly string[] =>
    tilesOf(state, codeMap)
      .slice(0, 2)
      .map((tile) => tile.state);

  expect(states(planning)).toEqual(['waiting', 'waiting']);
  expect(states(working)).toEqual(['reading', 'waiting']);
  expect(states(ended)).toEqual(['done', 'waiting']);
});

it('RF-1016 carries one mark per card its agent proposed and the files it read', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    agentStarted(2, 'r1', 'Catalog'),
    toolCalled(3, 'r1', { path: 'Catalog/Edit.aspx.cs', startLine: 1, endLine: 9 }),
    toolResult(4, 'r1', true),
    cardProposed(5, 'r1', 'BR-001'),
    cardProposed(6, 'r1', 'BR-002'),
  );

  const [catalog] = tilesOf(state, codeMap);

  expect(catalog).toMatchObject({ cards: 2, filesRead: 1, agentTaskId: 'r1' });
});

it('RF-1016 shows how much of the estimate a reading agent has used, never more than 95 percent', () => {
  const over = stateAfter(
    planned(1, 'r1', 'Models'),
    agentStarted(2, 'r1', 'Models'),
    turn(3, 'r1', 1, [90_000, 100]),
  );

  expect(tilesOf(over, codeMap)[1]?.progress).toBe(95);
  expect(tilesOf(stateAfter(), codeMap)[1]?.progress).toBeUndefined();
});

it('RF-1016 reports the share of the estimate used by a reading agent', () => {
  const half = stateAfter(
    planned(1, 'r1', 'Models'),
    agentStarted(2, 'r1', 'Models'),
    turn(3, 'r1', 1, [1_900, 100]),
  );

  expect(tilesOf(half, codeMap)[1]?.progress).toBe(50);
});

it('RF-1016 is not covered when the run planned its work and left the area out, or its agent failed', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    agentStarted(2, 'r1', 'Catalog'),
    agentEnded(3, 'r1', 'Failed'),
  );

  expect(tilesOf(state, codeMap).map((tile) => tile.state)).toEqual(['gap', 'gap', 'gap']);
});

const withLibraries = [...codeMap, area('jQuery', 40_000, true), area('Bootstrap', 20_000, true)];

it('RF-1016 are drawn as library, left out, after the own areas, and do not set the size of the others', () => {
  const tiles = tilesOf(stateAfter(planned(1, 'r1', 'Catalog')), withLibraries);

  expect(tiles.map((tile) => [tile.name, tile.state])).toEqual([
    ['Catalog', 'waiting'],
    ['Models', 'gap'],
    ['Setup', 'gap'],
    ['jQuery', 'library'],
    ['Bootstrap', 'library'],
  ]);
  expect(tiles[0]?.rows).toBe(3);
  expect(tiles[3]).toMatchObject({ columns: 4, rows: 1 });
});

it('RF-1016 a third-party area the user chose to read is an ordinary tile', () => {
  const state = stateAfter(planned(1, 'r1', 'jQuery'), agentStarted(2, 'r1', 'jQuery'));

  const jquery = tilesOf(state, withLibraries).find((tile) => tile.name === 'jQuery');

  expect(jquery?.state).toBe('reading');
});

it('RF-1016 are the areas of its agents in plan order, all of one size', () => {
  const state = stateAfter(planned(1, 'r1', 'Catalog'), planned(2, 'r2', 'Services'));

  const tiles = tilesOf(state, undefined);

  expect(tiles.map((tile) => [tile.name, tile.state, tile.columns, tile.rows])).toEqual([
    ['Catalog', 'waiting', 4, 3],
    ['Services', 'waiting', 4, 3],
  ]);
});

it('RF-1016 leave out the agents that are not readers, which have no area of their own', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    ev(2, 'agent.planned', { area: 'all', role: 'verifier', model: 'm' }, 'v-1'),
  );

  expect(tilesOf(state, undefined).map((tile) => tile.name)).toEqual(['Catalog']);
});

it('RF-1016 are none for a run without agents', () => {
  expect(tilesOf(stateAfter(), undefined)).toEqual([]);
});

it('RF-1016 keeps an agent area the code map does not name, after the others', () => {
  const state = stateAfter(planned(1, 'r1', 'Elsewhere'));

  expect(tilesOf(state, codeMap).map((tile) => tile.name)).toEqual([
    'Catalog',
    'Models',
    'Setup',
    'Elsewhere',
  ]);
});

it('RF-1016 keeps a name that holds HTML as plain text and lists 120 areas', () => {
  const areas = Array.from({ length: 120 }, (_, index) =>
    area(`Area ${String(index)}`, 100 + index),
  );
  const hostile = [area('<img src=x onerror=alert(1)>', 100), ...areas];

  const tiles = tilesOf(stateAfter(), hostile);

  expect(tiles).toHaveLength(121);
  expect(tiles[0]?.name).toBe('<img src=x onerror=alert(1)>');
});
