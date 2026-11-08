import { act, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { json, renderPage } from './fake-api.js';
import { doneKey, history } from './history-fixtures.js';
import { measures, understanding } from './understanding-fixtures.js';

// RF-231, RNF-010, WCAG 1.4.13, design-system.md section 5.1, P8-129: the Coverage tooltip of a History row
// is dismissed as the cost figures are (P8-117). Escape closes a tip the pointer rests on wherever the key
// is pressed, as a browser sends no key to a value that is only hovered; and the tip stays while the
// pointer crosses from the value onto it, even when the move leaves both boxes for a moment.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

/** Longer than the close delay of the overlay tooltip, shorter than a test's patience. */
const AFTER_DELAY_MS = 600;

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function coverageValue(): Promise<{ value: HTMLElement; wrap: HTMLElement }> {
  const settled = { ...history, runs: history.runs.slice(1) };
  renderPage(
    <HistoryPage />,
    {
      'GET /api/projects/p-1/history': json(200, settled),
      'GET /api/runs/r-1/understanding': understanding(measures()),
    },
    undefined,
    { projectId: 'p-1' },
  );
  const [cell] = await screen.findAllByText(doneKey);
  const row = cell?.closest('tr') ?? null;
  if (row === null) throw new Error(`No row for ${doneKey}.`);
  const value = await within(row).findByTestId('run-coverage');
  if (value.parentElement === null) throw new Error('The Coverage value has no box.');
  return { value, wrap: value.parentElement };
}

const isOpen = (wrap: HTMLElement): boolean =>
  wrap.hasAttribute('data-open') && !wrap.hasAttribute('data-dismissed');

async function hoverOpen(wrap: HTMLElement): Promise<void> {
  fireEvent.mouseEnter(wrap);
  await waitFor(() => {
    expect(isOpen(wrap)).toBe(true);
  });
}

describe('the Coverage tooltip of the history closed with Escape', () => {
  it('RF-231 given a Coverage tooltip that only the pointer rests on, Escape pressed anywhere closes it, and it opens again on the next hover', async () => {
    const { value, wrap } = await coverageValue();
    await hoverOpen(wrap);

    await act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(document.activeElement).not.toBe(value);
    expect(isOpen(wrap)).toBe(false);
    fireEvent.mouseLeave(wrap);
    await pause(AFTER_DELAY_MS);
    await hoverOpen(wrap);
  });

  it('RF-231 given a focused Coverage value the pointer rests on, Escape pressed anywhere closes it until the focus moves', async () => {
    const { value, wrap } = await coverageValue();
    await act(() => {
      value.focus();
    });
    await hoverOpen(wrap);

    await act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(isOpen(wrap)).toBe(false);
    expect(document.activeElement).toBe(value);
    fireEvent.mouseLeave(wrap);
    await pause(AFTER_DELAY_MS);
    fireEvent.mouseEnter(wrap);
    await pause(50);
    expect(isOpen(wrap)).toBe(false);
    await act(() => {
      value.blur();
    });
    await act(() => {
      value.focus();
    });
    expect(isOpen(wrap)).toBe(true);
  });

  it('RF-231 given no Coverage tooltip open, Escape leaves it alone', async () => {
    const { wrap } = await coverageValue();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await hoverOpen(wrap);
  });
});

describe('the Coverage tooltip of the history under a moving pointer', () => {
  it('RF-231 stays open while the pointer crosses from the value onto the tooltip through a gap', async () => {
    const { wrap } = await coverageValue();
    await hoverOpen(wrap);

    fireEvent.mouseLeave(wrap);
    await pause(50);
    expect(isOpen(wrap)).toBe(true);
    fireEvent.mouseEnter(wrap);
    await pause(AFTER_DELAY_MS);

    expect(isOpen(wrap)).toBe(true);
  });

  it('RF-231 closes when the pointer leaves for good', async () => {
    const { wrap } = await coverageValue();
    await hoverOpen(wrap);

    fireEvent.mouseLeave(wrap);

    await waitFor(() => {
      expect(isOpen(wrap)).toBe(false);
    });
  });
});
