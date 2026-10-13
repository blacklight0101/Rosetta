import { fireEvent, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { logsBody, logsPath } from './api-calls-fixtures.js';
import { renderCalls, standard } from './api-calls-helpers.js';
import { json } from './fake-api.js';

// RF-1011, RF-009, RF-507, DEC-57 (P1-37): the Logs panel of `/runs/:runId/calls`.

const logsPanel = (): HTMLElement => screen.getByRole('region', { name: 'Logs' });
const messages = (): string[] =>
  within(logsPanel())
    .queryAllByTestId('log-entry')
    .map((entry) => entry.textContent);

describe('the Logs panel', () => {
  it('RF-1011 shows info, warn and error entries and hides debug until it is turned on', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');

    expect(messages().join('\n')).not.toContain('Turn 1 begins.');
    expect(messages()).toHaveLength(4);

    fireEvent.click(within(logsPanel()).getByRole('button', { name: 'debug' }));

    expect(messages().join('\n')).toContain('Turn 1 begins.');
    expect(messages()).toHaveLength(5);
  });

  it('RF-1011 filters the entries by level', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');
    const panel = within(logsPanel());

    expect(panel.getByRole('button', { name: 'error' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(panel.getByRole('button', { name: 'info' }));
    fireEvent.click(panel.getByRole('button', { name: 'warn' }));

    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('Timeout after 30 s.');
    expect(messages()[0]).toContain('RST-1505');
  });
});

describe('the security events of the Logs panel', () => {
  it('RF-1011 shows the number of security events and filters the log to them when it is pressed', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');
    const counter = within(logsPanel()).getByRole('button', { name: /Security events/u });
    expect(counter.textContent).toContain('1');
    expect(counter.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(counter);

    expect(counter.getAttribute('aria-pressed')).toBe('true');
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain('security');
    fireEvent.click(counter);
    expect(messages()).toHaveLength(4);
  });

  it('RF-1011 RF-507 shows a message as text', async () => {
    renderCalls();
    await screen.findAllByTestId('log-entry');

    expect(logsPanel().textContent).toContain('Masked a <b>password</b> before it was sent.');
    expect(logsPanel().querySelector('b')).toBeNull();
  });

  it('RF-1011 says when the run has logged nothing yet', async () => {
    renderCalls({
      ...standard,
      [`GET ${logsPath}`]: json(
        200,
        logsBody({ total: 0, entries: [], counts: {}, securityEvents: 0 }),
      ),
    });

    expect(await screen.findByText(/No log entries yet/u)).toBeTruthy();
  });
});
