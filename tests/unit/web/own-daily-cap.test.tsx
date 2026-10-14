import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { dollarsToMicros, microsToDollars } from '../../../web/src/lib/usd.js';
import { SettingsPage } from '../../../web/src/pages/SettingsPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';

// DEC-107, RF-1106: the optional daily cap on the user's own keys, on the settings page. The
// amount is typed in dollars and travels as a decimal string of micro-dollars, never as a float;
// an empty field means no cap.

const capRoute = '/api/account/daily-cap';

function renderCap(answers: Readonly<Record<string, Answer>>) {
  return renderPage(<SettingsPage />, {
    'GET /api/account/keys': json(200, { keys: [] }),
    ...answers,
  });
}

async function capField(): Promise<HTMLElement> {
  const slot = await screen.findByTestId('own-daily-cap');
  return within(slot).findByLabelText('Daily cap for my own keys');
}

function valueOf(element: HTMLElement): string {
  return element instanceof HTMLInputElement ? element.value : '';
}

function saveButton(): HTMLElement {
  return within(screen.getByTestId('own-daily-cap')).getByRole('button', { name: 'Save cap' });
}

describe('dollar amounts', () => {
  it.each([
    ['1', '1000000'],
    ['1.5', '1500000'],
    ['0.000001', '1'],
    ['$2.25', '2250000'],
    [' 12,000.10 ', '12000100000'],
  ])('DEC-107 reads %s dollars as %s micro-dollars', (text, micros) => {
    expect(dollarsToMicros(text)).toBe(micros);
  });

  it.each(['abc', '1.0000001', '1e3', '', '.'])('DEC-107 refuses %j', (text) => {
    expect(dollarsToMicros(text)).toBeUndefined();
  });

  it('DEC-107 shows micro-dollars as dollars without trailing zeros past the cents', () => {
    expect(microsToDollars('1500000')).toBe('1.50');
    expect(microsToDollars('1')).toBe('0.000001');
    expect(microsToDollars('9007199254740993')).toBe('9007199254.740993');
  });
});

describe('own daily cap on the settings page', () => {
  it('DEC-107 shows the saved cap in dollars', async () => {
    renderCap({ [`GET ${capRoute}`]: json(200, { ownDailyCapMicros: '1500000' }) });

    await waitFor(async () => {
      expect(valueOf(await capField())).toBe('1.50');
    });
  });

  it('DEC-107 saves a cap with the CSRF token and says so', async () => {
    const { calls } = renderCap({
      [`GET ${capRoute}`]: json(200, { ownDailyCapMicros: null }),
      [`PUT ${capRoute}`]: json(200, { ownDailyCapMicros: '2250000' }),
    });
    fireEvent.input(await capField(), { target: { value: '2.25' } });

    fireEvent.click(saveButton());

    await screen.findByText(
      'Saved: runs on your own keys stop before they pass $2.25 in a UTC day.',
    );
    expect(calls.at(-1)).toEqual({
      method: 'PUT',
      path: capRoute,
      csrf: 'csrf-0',
      body: { ownDailyCapMicros: '2250000' },
    });
  });

  it('DEC-107 an empty field removes the cap', async () => {
    const { calls } = renderCap({
      [`GET ${capRoute}`]: json(200, { ownDailyCapMicros: '1000000' }),
      [`PUT ${capRoute}`]: json(200, { ownDailyCapMicros: null }),
    });
    const field = await capField();
    await waitFor(() => {
      expect(valueOf(field)).toBe('1.00');
    });
    fireEvent.input(field, { target: { value: '' } });

    fireEvent.click(saveButton());

    await screen.findByText('Saved: no daily cap on your own keys.');
    expect(calls.at(-1)?.body).toEqual({ ownDailyCapMicros: null });
  });
});

describe('own daily cap refusals', () => {
  it('DEC-107 an amount that is not dollars is refused next to the field, nothing is sent', async () => {
    const { calls } = renderCap({ [`GET ${capRoute}`]: json(200, { ownDailyCapMicros: null }) });
    const field = await capField();
    fireEvent.input(field, { target: { value: 'ten' } });

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(field.getAttribute('aria-invalid')).toBe('true');
    });
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);
  });

  it('DEC-107 a refusal of the server shows its code next to the field', async () => {
    renderCap({
      [`GET ${capRoute}`]: json(200, { ownDailyCapMicros: null }),
      [`PUT ${capRoute}`]: failure(400, 'RST-1005', [
        { field: 'ownDailyCapMicros', code: 'RST-1003' },
      ]),
    });
    fireEvent.input(await capField(), { target: { value: '3' } });

    fireEvent.click(saveButton());

    expect(
      (await within(screen.getByTestId('own-daily-cap')).findByText(/RST-1003/u)).textContent,
    ).toContain('RST-1003');
  });

  it('DEC-107 a cap that cannot be loaded shows the error and no form', async () => {
    renderCap({ [`GET ${capRoute}`]: failure(500, 'RST-2006') });

    const slot = await screen.findByTestId('own-daily-cap');

    expect((await within(slot).findByRole('alert')).textContent).toContain('RST-2006');
    expect(within(slot).queryByRole('button', { name: 'Save cap' })).toBeNull();
  });
});
