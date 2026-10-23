import { fireEvent, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json } from './fake-api.js';
import {
  estimateOf,
  estimatePath,
  roleOf,
  runAnswer,
  runsPath,
  type RoleBody,
} from './start-run-fixtures.js';
import { ready, renderStart, start } from './start-run-helpers.js';

// RF-429 (P3-111, EV-27): an understand run on local models whose likely tokens are above the run
// token cap (2,000,000 in the fixture project) asks before it starts, and names the cap; one within
// the cap starts as before.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const local = (role: 'reader' | 'verifier'): RoleBody =>
  roleOf({ role, provider: 'ollama', kind: 'ollama', model: 'gemma4:e4b', costs: ['0', '0', '0'] });

/** A local estimate whose likely total is the given tokens. */
function localLikely(tokens: number): Record<string, unknown> {
  const body = estimateOf([local('reader'), local('verifier')]);
  const total = body['total'] as { likely: Record<string, unknown> };
  return {
    ...body,
    total: { ...total, likely: { ...total.likely, inputTokens: tokens, outputTokens: 0 } },
  };
}

const starts = (calls: readonly { method: string; path: string }[]): number =>
  calls.filter((call) => call.method === 'POST' && call.path === runsPath).length;

it('RF-429 a likely token count above the run token cap asks first and names both figures', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: json(200, localLikely(21_363_174)),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  fireEvent.click(start());

  const dialog = await screen.findByRole('dialog', { name: /Start this run\?/u });
  expect(dialog.textContent).toContain('21,363,174 tokens');
  expect(dialog.textContent).toContain('2,000,000 tokens');
  expect(dialog.textContent).toContain('choose fewer areas');
  expect(starts(calls)).toBe(0);
});

it('RF-429 confirming starts the run once; cancelling starts nothing', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: json(200, localLikely(3_000_000)),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();
  fireEvent.click(start());
  await screen.findByRole('dialog', { name: /Start this run\?/u });

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(starts(calls)).toBe(0);
  fireEvent.click(start());
  await screen.findByRole('dialog', { name: /Start this run\?/u });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

  await screen.findByTestId('run-notice');
  expect(starts(calls)).toBe(1);
});

it('RF-429 a likely token count within the run token cap starts without asking', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: json(200, localLikely(1_999_999)),
    [`POST ${runsPath}`]: runAnswer('understand', null),
  });
  await ready();

  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(starts(calls)).toBe(1);
});
