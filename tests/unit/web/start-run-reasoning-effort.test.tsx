import { screen, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { json } from './fake-api.js';
import { estimateOf, estimatePath, roleOf } from './start-run-fixtures.js';
import { ready, renderStart } from './start-run-helpers.js';

// RF-425, Q-58, P3-86: the start page shows a role's reasoning effort beside its model when the
// estimate names one, and nothing for a role that has none.

const table = (): HTMLElement => screen.getByRole('table', { name: 'Estimate per role' });

const withEffort = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    keySource: 'user',
    reasoningEffort: 'low',
    costs: ['120000', '390000', '800000'],
  }),
  roleOf({
    role: 'verifier',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-4.1-mini',
    keySource: 'user',
    costs: ['10000', '20000', '40000'],
  }),
]);

it('RF-425 shows the reasoning effort of a role next to its model', async () => {
  renderStart({ [`GET ${estimatePath}`]: json(200, withEffort) });
  await ready();

  const reader = within(table()).getByRole('row', { name: /reader/u });
  expect(reader.textContent).toContain('openai / gpt-5-nano');
  expect(reader.textContent).toContain('reasoning effort low');
  const verifier = within(table()).getByRole('row', { name: /verifier/u });
  expect(verifier.textContent).not.toContain('reasoning effort');
});
