import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { agentPanel, valueOf } from './live-run-page.js';
import { OVERVIEW_CALL_TOKENS } from './overview-call.js';
import { recordedTokens, runTokens } from './run-tokens.js';

/**
 * P1-96, RF-301: the meter of a finished understand run. Each role's tokens come from its usage
 * events, so they cover every call the run made (the recorded reader calls and, for an Ollama
 * reader, its check before the first task; the verifier's recorded verdicts) and add up to the
 * totals the server keeps for the run.
 */
export async function expectMeterFromUsage(
  page: Page,
  finishedRun: string,
  areas: readonly string[],
): Promise<void> {
  const tokens = await runTokens(page, finishedRun);
  const verifier = await recordedTokens('verifier-csharp-full.json', [0, 1, 2, 3, 4]);
  const reader = await recordedTokens('understand-csharp-full.json', [0, 1, 2, 3, 6, 7, 8, 9, 10]);
  expect(tokens).toBeGreaterThanOrEqual(reader + verifier);
  const meter = page.getByRole('region', { name: 'Run meter' });
  const row = (name: RegExp) => meter.getByRole('row', { name });
  // The summariser's merge fails in this server (RST-1506); its overview is answered (RF-264).
  const readerTokens = tokens - verifier - OVERVIEW_CALL_TOKENS;
  await expect(row(/reader/u)).toContainText(readerTokens.toLocaleString('en-US'));
  await expect(row(/verifier/u)).toContainText(verifier.toLocaleString('en-US'));
  await expect(row(/Total/u)).toContainText(tokens.toLocaleString('en-US'));
  const costCell = (name: RegExp) => row(name).getByRole('cell').last();
  await expect(costCell(/reader/u)).toHaveText(/^\$\d+\.\d+$/u);
  await expect(costCell(/Total/u)).toHaveText(/^\$\d+\.\d+$/u);
  for (const area of areas)
    await expect(valueOf(agentPanel(page, area), 'Cost')).toHaveText(/^\$/u);
  await expect(meter).not.toContainText('shows a dash');
}
