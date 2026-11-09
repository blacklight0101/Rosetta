import { act, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CostTable, type CostRow } from '../../../web/src/pages/CostTable.js';
import { usageTotals } from './cost-fixtures.js';

// RF-428, RNF-010, P8-117: the one Tab stop of a table goes to an amount that can take focus, whatever the
// rows before it show, and it survives a row that is removed or turns plain.

const row = (key: string, costMicros: string): CostRow => ({
  key,
  name: key,
  local: false,
  totals: usageTotals({ cost: [{ currency: 'USD', costMicros }] }),
});

const table = (rows: readonly CostRow[]) => (
  <CostTable caption="By provider" firstColumn="Provider" rows={rows} />
);

const focusable = (container: Element): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('[data-rst-amount]'),
];

const stops = (container: Element): (string | null)[] =>
  focusable(container).map((amount) => amount.getAttribute('tabindex'));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cost table tab stop', () => {
  it('RF-428 given a first row whose amount is plain, the tab stop goes to the first amount that has a tooltip, and the arrows skip plain amounts', () => {
    const { container, getAllByText } = render(
      table([row('a', '0'), row('b', '7'), row('c', '0'), row('d', '7')]),
    );

    expect(getAllByText('$0.00').map((plain) => plain.hasAttribute('tabindex'))).toEqual([
      false,
      false,
    ]);
    expect(stops(container)).toEqual(['0', '-1']);
    const [first, second] = focusable(container);
    if (first === undefined || second === undefined) throw new Error('two amounts expected');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });
});

describe('cost table tab stop when the rows change', () => {
  it('RF-428 given a reached row whose amount turns plain, the tab stop goes to the first amount that has a tooltip', async () => {
    const { container, rerender } = render(table([row('a', '7'), row('b', '7'), row('c', '7')]));
    await act(() => {
      focusable(container)[2]?.focus();
    });
    expect(stops(container)).toEqual(['-1', '-1', '0']);

    rerender(table([row('a', '7'), row('b', '7'), row('c', '0')]));

    expect(stops(container)).toEqual(['0', '-1']);
  });

  it('RF-428 given a table where no amount has a tooltip, no amount is a tab stop', () => {
    const { container } = render(table([row('a', '0'), row('b', '0')]));

    expect(focusable(container)).toEqual([]);
  });

  it('RF-428 given the reached row is removed, the tab stop goes to the first row', async () => {
    const rows = [row('a', '7'), row('b', '7'), row('c', '7')];
    const { container, rerender } = render(table(rows));
    await act(() => {
      focusable(container)[2]?.focus();
    });
    expect(stops(container)).toEqual(['-1', '-1', '0']);

    rerender(table(rows.slice(0, 2)));

    expect(stops(container)).toEqual(['0', '-1']);
  });

  it('RF-428 given plain amounts, no document listener is added for them, and one only while a figure is open', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const keydowns = (): number => add.mock.calls.filter(([type]) => type === 'keydown').length;

    render(table([row('a', '0'), row('b', '0')]));
    expect(keydowns()).toBe(0);

    const { container } = render(table([row('c', '0'), row('d', '7'), row('e', '7')]));
    expect(keydowns()).toBe(0);

    await act(() => {
      focusable(container)[0]?.focus();
    });
    expect(keydowns()).toBe(1);
  });
});
