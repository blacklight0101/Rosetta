import { fireEvent, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// RF-420, RF-427, DEC-107, P2-16: a price override can carry the price of the tokens a call writes
// to the provider's prompt cache; left empty, the override has no cache-write price and a provider
// that bills cache writes treats the model as unpriced.

const route = '/api/projects/p-1';
const demo = projectOf('p-1', 'octo/demo');

function type(label: string, value: string): void {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

it('RF-420 saves an override with its cache-write price in micro-dollars', async () => {
  const { calls } = renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, demo), [`PUT ${route}/settings`]: json(200, demo) },
    undefined,
    { projectId: 'p-1' },
  );
  await screen.findByRole('heading', { name: 'Project settings' });

  fireEvent.click(screen.getByRole('button', { name: 'Add price override' }));
  fireEvent.change(screen.getByLabelText('Override 1 provider'), {
    target: { value: 'anthropic' },
  });
  type('Override 1 model', 'claude-test');
  type('Override 1 input (USD per million tokens)', '3');
  type('Override 1 output (USD per million tokens)', '15');
  type('Override 1 cached input (USD per million tokens)', '0.30');
  type('Override 1 cache write (USD per million tokens)', '3.75');
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await screen.findByText('Settings saved.');
  expect(calls.at(-1)?.body).toMatchObject({
    budget: {
      prices: [
        {
          provider: 'anthropic',
          model: 'claude-test',
          inputPerMillionMicros: 3_000_000,
          cacheWriteInputPerMillionMicros: 3_750_000,
        },
      ],
    },
  });
});

describe('the warning for an Anthropic override without a cache-write price', () => {
  const warning = /Override 1 has no cache-write price/;

  async function withOverride(provider: string): Promise<void> {
    renderPage(<ProjectSettingsPage />, { [`GET ${route}`]: json(200, demo) }, undefined, {
      projectId: 'p-1',
    });
    await screen.findByRole('heading', { name: 'Project settings' });
    fireEvent.click(screen.getByRole('button', { name: 'Add price override' }));
    fireEvent.change(screen.getByLabelText('Override 1 provider'), { target: { value: provider } });
  }

  it('RF-427 warns before saving when an Anthropic override has no cache-write price', async () => {
    await withOverride('anthropic');

    expect(screen.getByText(warning)).toBeTruthy();
  });

  it('RF-427 the warning goes once the cache-write price is typed', async () => {
    await withOverride('anthropic');

    type('Override 1 cache write (USD per million tokens)', '3.75');

    expect(screen.queryByText(warning)).toBeNull();
  });

  it('RF-427 the cache-write field is described by the warning while the warning shows', async () => {
    await withOverride('anthropic');
    const field = screen.getByLabelText('Override 1 cache write (USD per million tokens)');
    const warningId = screen.getByText(warning).id;

    expect(warningId).not.toBe('');
    expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(warningId);

    type('Override 1 cache write (USD per million tokens)', '3.75');

    expect(field.getAttribute('aria-describedby') ?? '').not.toContain(warningId);
  });

  it('RF-427 a provider that bills no cache write gets no warning', async () => {
    await withOverride('openai');

    expect(screen.queryByText(warning)).toBeNull();
  });
});
