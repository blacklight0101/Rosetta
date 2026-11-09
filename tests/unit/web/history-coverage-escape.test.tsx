import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { json, renderPage } from './fake-api.js';
import { doneKey, history } from './history-fixtures.js';
import { measures, understanding } from './understanding-fixtures.js';

// RF-231, RNF-010, WCAG 1.4.13, design-system.md section 5.1, P8-129: the Coverage tooltip of a History row
// is dismissed as the cost figures are (P8-117). Escape closes a tip the pointer rests on wherever the key
// is pressed, as a browser sends no key to a value that is only hovered; and the tip stays while the
// pointer crosses from the value onto it, even when the move leaves both boxes for a moment.

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

/** Longer than the close delay of the overlay tooltip, shorter than a test's patience. */
const AFTER_DELAY_MS = 600;

/** Fake timers start once the page is up, so the waits of the page itself stay real. */
async function pause(ms: number): Promise<void> {
  await act(() => {
    vi.advanceTimersByTime(ms);
  });
}

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
    vi.useFakeTimers();

    await act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(document.activeElement).not.toBe(value);
    expect(isOpen(wrap)).toBe(false);
    fireEvent.mouseLeave(wrap);
    await pause(AFTER_DELAY_MS);
    vi.useRealTimers();
    await hoverOpen(wrap);
  });

  it('RF-231 given a focused Coverage value the pointer rests on, Escape pressed anywhere closes it until the focus moves', async () => {
    const { value, wrap } = await coverageValue();
    await act(() => {
      value.focus();
    });
    await hoverOpen(wrap);
    vi.useFakeTimers();

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
});

describe('the Coverage tooltip of the history and an Escape with no tooltip open', () => {
  it('RF-231 given no Coverage tooltip open, Escape leaves it alone', async () => {
    const { wrap } = await coverageValue();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.mouseEnter(wrap);

    await waitFor(() => {
      expect(isOpen(wrap)).toBe(true);
    });
  });
});

describe('the Coverage tooltip of the history under a moving pointer', () => {
  it('RF-231 stays open while the pointer crosses from the value onto the tooltip through a gap', async () => {
    const { wrap } = await coverageValue();
    await hoverOpen(wrap);
    vi.useFakeTimers();

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
    vi.useFakeTimers();

    fireEvent.mouseLeave(wrap);
    await pause(AFTER_DELAY_MS);

    expect(isOpen(wrap)).toBe(false);
  });
});

/** The keydown handlers the document still holds, from the adds and removes seen since the spies began. */
function trackKeydown(): () => number {
  const held = new Set<unknown>();
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
    if (type === 'keydown') held.add(handler);
    add(type, handler, options);
  });
  vi.spyOn(document, 'removeEventListener').mockImplementation((type, handler, options) => {
    if (type === 'keydown') held.delete(handler);
    remove(type, handler, options);
  });
  return () => held.size;
}

describe('the Coverage tooltip of the history and its keydown listener', () => {
  it('RF-231 holds a document keydown listener only while the tooltip is open, and none once it closed', async () => {
    const { wrap } = await coverageValue();
    const held = trackKeydown();
    expect(held()).toBe(0);

    await hoverOpen(wrap);
    expect(held()).toBe(1);
    vi.useFakeTimers();
    fireEvent.mouseLeave(wrap);
    await pause(AFTER_DELAY_MS);

    expect(isOpen(wrap)).toBe(false);
    expect(held()).toBe(0);
  });

  it('RF-231 leaves no document keydown listener behind when the page unmounts with the tooltip open', async () => {
    const { wrap } = await coverageValue();
    const held = trackKeydown();
    await hoverOpen(wrap);
    expect(held()).toBe(1);

    cleanup();

    expect(held()).toBe(0);
  });
});
