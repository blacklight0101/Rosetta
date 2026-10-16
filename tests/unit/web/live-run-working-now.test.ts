import { expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { workingNowOf } from '../../../web/src/lib/live-run/working-now.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  citationChecked,
  planned,
  stateAfter,
  toolCalled,
  turn,
} from './live-run-fixtures.js';

// RF-1015 (P1-169): "working now", up to three agents in plain words.

const area = (index: number): string => `Area ${String(index)}`;

const readers = (count: number): RunEvent[] =>
  Array.from({ length: count }, (_, index) => planned(index + 1, `r${String(index)}`, area(index)));

const started = (count: number): RunEvent[] =>
  Array.from({ length: count }, (_, index) =>
    agentStarted(10 + index, `r${String(index)}`, area(index)),
  );

it('RF-1015 says what a reader opens, in words', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    agentStarted(2, 'r1', 'Catalog'),
    toolCalled(3, 'r1', { path: 'Catalog/Create.aspx.cs', startLine: 1, endLine: 80 }),
  );

  expect(workingNowOf(state)).toEqual([
    expect.objectContaining({
      title: 'Reader · Catalog',
      text: 'Reading Catalog/Create.aspx.cs, lines 1–80',
    }),
  ]);
});

it('RF-1015 says a card was written once the agent has written one', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Models'),
    agentStarted(2, 'r1', 'Models'),
    cardProposed(3, 'r1', 'BR-001'),
  );

  expect(workingNowOf(state)[0]?.text).toBe('Wrote a card: Title of BR-001');
});

it('RF-1015 says an agent that has no tool call yet is thinking or starting', () => {
  const starting = stateAfter(planned(1, 'r1', 'Models'), agentStarted(2, 'r1', 'Models'));
  const thinking = stateAfter(
    planned(1, 'r1', 'Models'),
    agentStarted(2, 'r1', 'Models'),
    turn(3, 'r1', 1, [10, 2]),
  );

  expect(workingNowOf(starting)[0]?.text).toBe('Starting');
  expect(workingNowOf(thinking)[0]?.text).toBe('Thinking about what to read next');
});

it('RF-1015 lists no more than three, and keeps a place for the citation check', () => {
  const many = stateAfter(...readers(6), ...started(6));
  const withClaims = stateAfter(
    ...readers(6),
    ...started(6),
    cardProposed(30, 'r0', 'BR-001', 2),
    citationChecked(31, 'r0', 'BR-001.c1', true),
  );

  expect(workingNowOf(many)).toHaveLength(3);
  const items = workingNowOf(withClaims);
  expect(items).toHaveLength(3);
  expect(items.at(-1)).toMatchObject({ title: 'Citation check', role: 'verifier' });
});

it('RF-1015 tells how many claims were checked and whether all cite real lines', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    agentStarted(2, 'r1', 'Catalog'),
    cardProposed(3, 'r1', 'BR-001', 3),
    citationChecked(4, 'r1', 'BR-001.c1', true),
    citationChecked(5, 'r1', 'BR-001.c2', 'The lines do not exist.'),
  );
  const clean = stateAfter(
    planned(1, 'r1', 'Catalog'),
    agentStarted(2, 'r1', 'Catalog'),
    cardProposed(3, 'r1', 'BR-001', 1),
    citationChecked(4, 'r1', 'BR-001.c1', true),
  );

  const text = (current: ReturnType<typeof stateAfter>): string | undefined =>
    workingNowOf(current).find((item) => item.role === 'verifier')?.text;

  expect(text(state)).toBe('2 claims checked, 1 with a bad citation');
  expect(text(clean)).toBe('1 claim checked, all cite real lines');
});

it('RF-1015 leaves out agents that are waiting or have ended', () => {
  const state = stateAfter(
    planned(1, 'r1', 'Catalog'),
    planned(2, 'r2', 'Models'),
    agentStarted(3, 'r1', 'Catalog'),
    agentEnded(4, 'r1', 'Done'),
  );

  expect(workingNowOf(state)).toEqual([]);
});
