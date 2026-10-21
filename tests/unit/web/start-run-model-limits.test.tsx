import { screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { json } from './fake-api.js';
import { cloudEstimate, estimatePath } from './start-run-fixtures.js';
import { ready, renderStart } from './start-run-helpers.js';

// RF-405, RF-425, Q-57: the Assumptions of the start page estimate state the context window and
// the output limit of each role; an automatic Ollama context says what the estimate assumed.

function withLimits(roleLimits: Record<string, unknown>): Record<string, unknown> {
  const assumptions = cloudEstimate['assumptions'];
  if (typeof assumptions !== 'object' || assumptions === null) throw new Error('No assumptions');
  return { ...cloudEstimate, assumptions: { ...assumptions, roleLimits } };
}

const limit = (contextTokens: number, maxOutputTokens: number, contextAutomatic = false) => ({
  contextTokens,
  contextAutomatic,
  maxOutputTokens,
});

it('RF-405 shows the context and the output limit of each role', async () => {
  const body = withLimits({
    reader: limit(1_000_000, 16_000),
    verifier: limit(1_000_000, 4_000),
    summariser: limit(128_000, 4_000),
  });
  renderStart({ [`GET ${estimatePath}`]: json(200, body) });
  await ready();

  const text = screen.getByText(/^Limits:/u).textContent;
  expect(text).toContain('reader: context 1,000,000 tokens, output 16,000 tokens');
  expect(text).toContain('verifier: context 1,000,000 tokens, output 4,000 tokens');
  expect(text).toContain('summariser: context 128,000 tokens, output 4,000 tokens');
});

it('P3-75 an automatic Ollama context reads as an estimate, not as a limit', async () => {
  const body = withLimits({
    reader: limit(32_768, 4_096, true),
    verifier: limit(32_768, 2_048, true),
    summariser: limit(32_768, 2_048, true),
  });
  renderStart({ [`GET ${estimatePath}`]: json(200, body) });
  await ready();

  const text = screen.getByText(/^Limits:/u).textContent;
  expect(text).toContain('reader: context automatic (estimated at 32,768 tokens), output 4,096');
});

it('RF-405 an estimate without the limits shows no Limits line', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, cloudEstimate) });
  await ready();

  expect(screen.queryByText(/^Limits:/u)).toBeNull();
});
