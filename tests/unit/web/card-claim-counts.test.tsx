import { render, screen, within } from '@testing-library/preact';
import type { JSX } from 'preact';
import { expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { CardsTab } from '../../../web/src/pages/CardsTab.js';
import { cardProposed, citationChecked, ev, planned, stateAfter } from './live-run-fixtures.js';

// RF-1004, RF-1014, RF-1015 (P1-176): the counts of the claims of each card on the Evidence tab,
// as text with a glyph for each count, so that colour never carries the meaning alone.

const judged = (seq: number, claimId: string, status: string, reason?: string): RunEvent =>
  ev(
    seq,
    'verify.claim.judged',
    { claimId, status, ...(reason === undefined ? {} : { reason }) },
    'r1',
  );

function cardsView(...events: readonly RunEvent[]): JSX.Element {
  const state = stateAfter(...events);
  return <CardsTab state={state} claims={state.claims} source={undefined} />;
}

/** The counts element of the card row with this id. */
function countsOf(cardId: string): HTMLElement {
  const row = screen.getAllByTestId('card-row').find((each) => each.textContent.includes(cardId));
  if (row === undefined) throw new Error(`no card row for ${cardId}`);
  return within(row).getByTestId('card-counts');
}

it('RF-1004 a card with two supported, one rejected and one citation invalid claim shows those counts, not citation invalid alone', () => {
  render(
    cardsView(
      planned(1, 'r1', 'Catalog'),
      cardProposed(2, 'r1', 'FEAT-001', 4),
      citationChecked(3, 'r1', 'FEAT-001.c1', true),
      judged(4, 'FEAT-001.c1', 'Supported'),
      citationChecked(5, 'r1', 'FEAT-001.c2', true),
      judged(6, 'FEAT-001.c2', 'Supported'),
      citationChecked(7, 'r1', 'FEAT-001.c3', true),
      judged(8, 'FEAT-001.c3', 'Rejected', 'the line does not say it'),
      citationChecked(9, 'r1', 'FEAT-001.c4', 'line 9 is past the end'),
    ),
  );

  const counts = countsOf('FEAT-001');
  expect(counts.textContent).toBe('2 supported · 1 rejected · 1 citation invalid');
  expect(counts.querySelectorAll('svg')).toHaveLength(3);
});

it('RF-1004 a card whose only claim is rejected shows rejected and no citation invalid', () => {
  render(
    cardsView(
      planned(1, 'r1', 'Catalog'),
      cardProposed(2, 'r1', 'ENT-001', 1),
      citationChecked(3, 'r1', 'ENT-001.c1', true),
      judged(4, 'ENT-001.c1', 'Rejected', 'not an entity'),
    ),
  );

  expect(countsOf('ENT-001').textContent).toBe('1 rejected');
});

it('RF-1014 a card with no claim yet shows waiting, not all supported', () => {
  render(cardsView(planned(1, 'r1', 'Catalog'), cardProposed(2, 'r1', 'BR-002', 0)));

  expect(countsOf('BR-002').textContent).toBe('waiting');
});

it('RF-1014 a card whose claims are all supported shows one all supported mark', () => {
  render(
    cardsView(
      planned(1, 'r1', 'Catalog'),
      cardProposed(2, 'r1', 'BR-001', 2),
      citationChecked(3, 'r1', 'BR-001.c1', true),
      citationChecked(4, 'r1', 'BR-001.c2', true),
      judged(5, 'BR-001.c1', 'Supported'),
      judged(6, 'BR-001.c2', 'Supported'),
    ),
  );

  expect(countsOf('BR-001').textContent).toBe('all supported');
});

it('RF-1015 the waiting count changes as the citation check and the judgement arrive', () => {
  const first = [planned(1, 'r1', 'Catalog'), cardProposed(2, 'r1', 'FEAT-002', 2)];
  const { rerender } = render(cardsView(...first));
  expect(countsOf('FEAT-002').textContent).toBe('2 waiting');

  const second = [...first, citationChecked(3, 'r1', 'FEAT-002.c1', true)];
  rerender(cardsView(...second));
  expect(countsOf('FEAT-002').textContent).toBe('2 waiting');

  const third = [...second, judged(4, 'FEAT-002.c1', 'Supported')];
  rerender(cardsView(...third));
  expect(countsOf('FEAT-002').textContent).toBe('1 supported · 1 waiting');
});

it('RF-1015 a replay of the same events shows the same counts as the live view', () => {
  const events = [
    planned(1, 'r1', 'Catalog'),
    cardProposed(2, 'r1', 'FEAT-003', 2),
    citationChecked(3, 'r1', 'FEAT-003.c1', true),
    judged(4, 'FEAT-003.c1', 'Unverified'),
    citationChecked(5, 'r1', 'FEAT-003.c2', 'line 9 is past the end'),
  ];
  const { unmount } = render(cardsView(...events));
  const live = countsOf('FEAT-003').textContent;
  unmount();

  render(cardsView(...events));
  expect(countsOf('FEAT-003').textContent).toBe(live);
  expect(live).toBe('1 citation invalid · 1 unverified');
});
