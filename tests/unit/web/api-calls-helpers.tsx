import { screen, within } from '@testing-library/preact';
import { callsBody, callsPath, logsBody, logsPath, runUuid } from './api-calls-fixtures.js';
import { json, renderPage, type Answer, type RenderedPage } from './fake-api.js';
import { ApiCallsPage } from '../../../web/src/pages/ApiCallsPage.js';

// RF-1011 (P1-37): what the tests of the API calls and logs page share: the standard answers of the
// calls and logs routes, the page rendered over them and the rows of the calls table.

export const standard: Readonly<Record<string, Answer>> = {
  [`GET ${callsPath}`]: json(200, callsBody()),
  [`GET ${logsPath}`]: json(200, logsBody()),
};

export function renderCalls(answers: Readonly<Record<string, Answer>> = standard): RenderedPage {
  return renderPage(<ApiCallsPage />, answers, undefined, { runId: runUuid });
}

export const callsPanel = (): HTMLElement => screen.getByRole('region', { name: 'API calls' });

export const rowOf = (seq: number): HTMLElement => {
  const found = within(callsPanel())
    .getAllByTestId('call-row')
    .find((row) => row.getAttribute('data-seq') === String(seq));
  if (found === undefined) throw new Error(`No row for call ${String(seq)}.`);
  return found;
};

export const rowSeqs = (): string[] =>
  within(callsPanel())
    .queryAllByTestId('call-row')
    .map((row) => row.getAttribute('data-seq') ?? '');

export async function loaded(): Promise<void> {
  await screen.findAllByTestId('call-row');
}
