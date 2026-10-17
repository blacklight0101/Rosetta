import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';

// RF-1003, P1-96: the tokens a run spent, as the recordings hold them and as the server totals them.

/** Input and output tokens of the calls with those indexes in a recording of tests/recordings/fake/. */
export async function recordedTokens(file: string, indexes: readonly number[]): Promise<number> {
  const recording = await loadRecording(join('tests', 'recordings', 'fake', file));
  return indexes.reduce((total, index) => {
    const attempt = recording.calls[index]?.attempts[0];
    if (attempt === undefined || !('response' in attempt))
      throw new Error(`No call ${String(index)}.`);
    const { inputTokens, outputTokens } = attempt.response.usage;
    return total + inputTokens + outputTokens;
  }, 0);
}

/** Input and output tokens of the run as the server totals them (GET /api/runs/:runId). */
export async function runTokens(page: Page, runPage: string): Promise<number> {
  const uuid = runPage.split('/').at(-1) ?? '';
  const body: unknown = await page.evaluate(async (id) => {
    const response = await fetch(`/api/runs/${id}`);
    const json: unknown = await response.json();
    return json;
  }, uuid);
  const totals: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'totals') : undefined;
  const field = (name: string): number => {
    const value: unknown =
      typeof totals === 'object' && totals !== null ? Reflect.get(totals, name) : undefined;
    return typeof value === 'number' ? value : Number.NaN;
  };
  return field('inputTokens') + field('outputTokens');
}
