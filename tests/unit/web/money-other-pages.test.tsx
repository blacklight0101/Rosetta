import { cleanup, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { carriesExactFigure } from '../../../web/src/components/CostFigure.js';
import { hasTooltip } from '../../../web/src/components/MoneyAmount.js';
import { costText } from '../../../web/src/lib/api-calls/format.js';
import { dollars } from '../../../web/src/lib/estimate-math.js';
import { costLabel } from '../../../web/src/lib/live-run/format.js';
import { moneyText } from '../../../web/src/lib/money.js';
import { costText as accountCostText } from '../../../web/src/pages/admin-format.js';
import { formatAmount, formatValue } from '../../../web/src/pages/setting-limits.js';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { json, renderPage } from './fake-api.js';
import { history, liveKey, doneKey } from './history-fixtures.js';

// RF-428, RF-1020, DEC-54, DEC-217, design-system.md section 10, P8-91: every money amount of every page
// other than the cost page is written by the one formatter (four decimals below $1, two above), so no
// page mixes 3 and 6 decimals, and an amount whose exact figure differs offers it in a tooltip.

afterEach(cleanup);

describe('the one money formatter on every text builder', () => {
  it.each([
    ['237000', '$0.2370'],
    ['3113515', '$3.11'],
    ['7', '<$0.0001'],
    ['0', '$0.00'],
    ['1234567890', '$1,234.57'],
  ])('RF-428 writes %s micro-dollars as %s whatever the helper', (micros, text) => {
    expect(moneyText(micros)).toBe(text);
    expect(moneyText(BigInt(micros))).toBe(text);
    expect(moneyText(Number(micros))).toBe(text);
    expect(costLabel(Number(micros))).toBe(text);
    expect(costText(Number(micros))).toBe(text);
    expect(dollars(BigInt(micros))).toBe(text);
  });

  it('RF-428 given the cost of an account in any currency, writes the amount by the formatter and the code after it', () => {
    expect(accountCostText([])).toBe('$0.00');
    expect(accountCostText([{ currency: 'USD', costMicros: '237000' }])).toBe('$0.2370');
    expect(accountCostText([{ currency: 'EUR', costMicros: '3113515' }])).toBe('3.11 EUR');
  });

  it('RF-428 given a dollar setting, writes it by the formatter', () => {
    expect(formatValue(0.5, 'dollars')).toBe('$0.5000');
    expect(formatValue(5, 'dollars')).toBe('$5.00');
    expect(formatValue(1500, 'count')).toBe('1,500');
  });

  it('RF-428 given two limits to compare, writes them by the formatter unless rounding would hide a difference', () => {
    expect(formatAmount(0.4, 'dollars')).toBe('$0.4000');
    expect(formatAmount(100, 'dollars')).toBe('$100.00');
    expect(formatAmount(1.004, 'dollars')).toBe('$1.004');
    expect(formatAmount(-2, 'dollars')).toBe('-$2.00');
  });

  it('RF-428 given a table of amounts, only an amount that has an exact figure can take the Tab stop', () => {
    expect(carriesExactFigure('3113515')).toBe(true);
    expect(carriesExactFigure('3880000')).toBe(false);
    expect([3_880_000, 237_000, 7].map(hasTooltip)).toEqual([false, true, true]);
    expect(hasTooltip('3880000')).toBe(false);
  });
});

describe('the history page', () => {
  it('RF-428 writes the cost of every run by the formatter, with the exact figure in a tooltip', async () => {
    renderPage(
      <HistoryPage />,
      { 'GET /api/projects/p-1/history': json(200, history) },
      undefined,
      {
        projectId: 'p-1',
      },
    );

    const [live] = await screen.findAllByText(liveKey);
    const row = within(live?.closest('tr') ?? document.body);
    expect(row.getByText('$0.4100')).not.toBeNull();
    expect(row.getByRole('tooltip').textContent).toBe('$0.41');
    const done = within((await screen.findAllByText(doneKey))[0]?.closest('tr') ?? document.body);
    expect(done.queryByText(/^\$\d+\.\d{3}$/u)).toBeNull();
    expect(done.queryByText(/^\$\d+\.\d{5,}$/u)).toBeNull();
  });

  it('RF-428 gives the amounts of the runs table one Tab stop', async () => {
    renderPage(
      <HistoryPage />,
      { 'GET /api/projects/p-1/history': json(200, history) },
      undefined,
      {
        projectId: 'p-1',
      },
    );

    const table = await screen.findByRole('table', { name: 'Runs' });
    const stops = [...table.querySelectorAll('[data-rst-amount]')].filter(
      (amount) => amount.getAttribute('tabindex') === '0',
    );

    expect(stops).toHaveLength(1);
  });
});
