import { expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { cardViewsOf } from '../../../web/src/lib/live-run/card-checks.js';
import { cardProposed, citationChecked, ev, planned, stateAfter } from './live-run-fixtures.js';

// RF-1004, RF-1014, RF-1015 (P1-169, P1-176): what the claims of each card say, counted per status.

const judged = (seq: number, claimId: string, status: string, reason?: string): RunEvent =>
  ev(
    seq,
    'verify.claim.judged',
    { claimId, status, ...(reason === undefined ? {} : { reason }) },
    'r1',
  );

const judgementEnded = (seq: number): RunEvent => ev(seq, 'verify.judgement.ended', {});

/** The summary of the first card of the events, or undefined when no card exists. */
const summaryOf = (...events: readonly RunEvent[]): unknown =>
  cardViewsOf(stateAfter(...events))[0]?.summary;

it('RF-1004 a card whose claims are only rejected counts them as rejected and never as citation invalid', () => {
  const summary = summaryOf(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'ENT-001', 1),
    citationChecked(3, 'r1', 'ENT-001.c1', true),
    judged(4, 'ENT-001.c1', 'Rejected', 'not an entity'),
  );

  expect(summary).toEqual({ kind: 'counts', parts: [{ kind: 'rejected', count: 1 }] });
});

it('RF-1004 a card shows the counts of its claims in order, only the non-zero ones', () => {
  const summary = summaryOf(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'FEAT-001', 4),
    citationChecked(3, 'r1', 'FEAT-001.c1', true),
    judged(4, 'FEAT-001.c1', 'Supported'),
    citationChecked(5, 'r1', 'FEAT-001.c2', true),
    judged(6, 'FEAT-001.c2', 'Supported'),
    citationChecked(7, 'r1', 'FEAT-001.c3', true),
    judged(8, 'FEAT-001.c3', 'Rejected', 'the line does not say it'),
    citationChecked(9, 'r1', 'FEAT-001.c4', 'line 9 is past the end'),
  );

  expect(summary).toEqual({
    kind: 'counts',
    parts: [
      { kind: 'supported', count: 2 },
      { kind: 'rejected', count: 1 },
      { kind: 'citation-invalid', count: 1 },
    ],
  });
});

it('RF-1014 a card with no claim yet is waiting, never all supported', () => {
  const summary = summaryOf(planned(1, 'r1', 'Catalog'), cardProposed(2, 'r1', 'BR-002', 0));

  expect(summary).toEqual({ kind: 'waiting' });
});

it('RF-1014 a card whose claims are all supported keeps a single all supported mark', () => {
  const summary = summaryOf(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'BR-001', 2),
    citationChecked(3, 'r1', 'BR-001.c1', true),
    citationChecked(4, 'r1', 'BR-001.c2', true),
    judged(5, 'BR-001.c1', 'Supported'),
    judged(6, 'BR-001.c2', 'Supported'),
  );

  expect(summary).toEqual({ kind: 'all-supported' });
});

it('RF-1014 a claim still waiting for its check or for the judgement counts as waiting', () => {
  const summary = summaryOf(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'BR-001', 3),
    citationChecked(3, 'r1', 'BR-001.c1', true),
    citationChecked(4, 'r1', 'BR-001.c2', 'line 9 is past the end'),
  );

  expect(summary).toEqual({
    kind: 'counts',
    parts: [
      { kind: 'citation-invalid', count: 1 },
      { kind: 'waiting', count: 2 },
    ],
  });
});

it('RF-1014 a claim that passed its check but was left unjudged after the step ended is not judged', () => {
  const summary = summaryOf(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'BR-001', 2),
    citationChecked(3, 'r1', 'BR-001.c1', true),
    citationChecked(4, 'r1', 'BR-001.c2', true),
    judgementEnded(5),
  );

  expect(summary).toEqual({ kind: 'counts', parts: [{ kind: 'not-judged', count: 2 }] });
});

it('RF-301 a claim judged Unverified is counted as unverified', () => {
  const summary = summaryOf(
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'BR-001', 2),
    citationChecked(3, 'r1', 'BR-001.c1', true),
    citationChecked(4, 'r1', 'BR-001.c2', true),
    judged(5, 'BR-001.c1', 'Supported'),
    judged(6, 'BR-001.c2', 'Unverified'),
  );

  expect(summary).toEqual({
    kind: 'counts',
    parts: [
      { kind: 'supported', count: 1 },
      { kind: 'unverified', count: 1 },
    ],
  });
});

it('RF-1015 the counts follow the citation check and the judgement as they arrive, and a replay gives the same counts', () => {
  const events = [
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'FEAT-001', 3),
    citationChecked(3, 'r1', 'FEAT-001.c1', true),
    judged(4, 'FEAT-001.c1', 'Supported'),
    citationChecked(5, 'r1', 'FEAT-001.c2', 'line 9 is past the end'),
    citationChecked(6, 'r1', 'FEAT-001.c3', true),
    judged(7, 'FEAT-001.c3', 'Rejected', 'no'),
  ];
  const seen = events.map((_, index) => summaryOf(...events.slice(0, index + 1)));

  expect(seen).toEqual([
    undefined,
    { kind: 'counts', parts: [{ kind: 'waiting', count: 3 }] },
    { kind: 'counts', parts: [{ kind: 'waiting', count: 3 }] },
    {
      kind: 'counts',
      parts: [
        { kind: 'supported', count: 1 },
        { kind: 'waiting', count: 2 },
      ],
    },
    {
      kind: 'counts',
      parts: [
        { kind: 'supported', count: 1 },
        { kind: 'citation-invalid', count: 1 },
        { kind: 'waiting', count: 1 },
      ],
    },
    {
      kind: 'counts',
      parts: [
        { kind: 'supported', count: 1 },
        { kind: 'citation-invalid', count: 1 },
        { kind: 'waiting', count: 1 },
      ],
    },
    {
      kind: 'counts',
      parts: [
        { kind: 'supported', count: 1 },
        { kind: 'rejected', count: 1 },
        { kind: 'citation-invalid', count: 1 },
      ],
    },
  ]);
  expect(summaryOf(...events)).toEqual(seen[seen.length - 1]);
});

it('RF-1004 a card keeps the type and the title the agent gave it', () => {
  const state = stateAfter(planned(1, 'r1', 'Catalog'), cardProposed(2, 'r1', 'BR-001', 1));

  expect(cardViewsOf(state)).toEqual([
    expect.objectContaining({ cardId: 'BR-001', type: 'BR', title: 'Title of BR-001' }),
  ]);
});
