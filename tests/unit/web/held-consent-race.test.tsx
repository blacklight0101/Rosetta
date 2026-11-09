import { fireEvent, screen, waitFor } from '@testing-library/preact';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { describe, expect, it } from 'vitest';
import { useHeldConsent } from '../../../web/src/pages/use-held-consent.js';
import { json, renderPage } from './fake-api.js';

// RF-143, DEC-209 (P8-81): the consent is read again when the project changes (a saved setting moves
// `updatedAt`). Under load two reads can be in flight and answer in either order. The page must end
// with the answer of the newer read and never stay busy, so it shows either the boxes or the line.

const consentPath = '/api/projects/p-1/consent';
const held = {
  consent: {
    id: 'c-1',
    givenAt: '2026-11-03T09:00:00.000Z',
    endsAt: '2026-12-03T09:00:00.000Z',
    providers: ['openai'],
    kinds: ['cloud'],
  },
};
const none = { consent: null };

/** What the page shows from the hook: busy (the notice marked busy), the line, or the boxes. */
function Probe(): JSX.Element {
  const [refresh, setRefresh] = useState('2026-11-09T00:00:00.000Z');
  const state = useHeldConsent('p-1', 'understand', refresh);
  const shown = state.reading ? 'busy' : state.consent === undefined ? 'boxes' : 'line';
  return (
    <>
      <p data-testid="shown">{shown}</p>
      <button
        type="button"
        onClick={() => {
          setRefresh('2026-11-09T00:00:01.000Z');
        }}
      >
        Save settings
      </button>
    </>
  );
}

/** Renders the probe with every consent read held until the test answers it. */
function renderHeldReads() {
  const answers: ((body: unknown) => void)[] = [];
  renderPage(<Probe />, {
    [`GET ${consentPath}`]: () =>
      new Promise<Response>((resolve) => {
        answers.push((body) => {
          resolve(json(200, body));
        });
      }),
  });
  return answers;
}

const shown = (): string => screen.getByTestId('shown').textContent;

async function twoReadsInFlight(): Promise<((body: unknown) => void)[]> {
  const answers = renderHeldReads();
  await waitFor(() => {
    expect(answers).toHaveLength(1);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await waitFor(() => {
    expect(answers).toHaveLength(2);
  });
  expect(shown()).toBe('busy');
  return answers;
}

describe('RF-143 P8-81 the consent read again while the first read is in flight', () => {
  it('RF-143 P8-81 the newer read answers first and the older one, answering later, changes nothing', async () => {
    const [older, newer] = await twoReadsInFlight();

    newer?.(held);
    await waitFor(() => {
      expect(shown()).toBe('line');
    });
    older?.(none);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shown()).toBe('line');
  });

  it('RF-143 P8-81 the older read answers first and is dropped; the page waits for the newer one', async () => {
    const [older, newer] = await twoReadsInFlight();

    older?.(held);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shown()).toBe('busy');
    newer?.(none);

    await waitFor(() => {
      expect(shown()).toBe('boxes');
    });
  });
});
