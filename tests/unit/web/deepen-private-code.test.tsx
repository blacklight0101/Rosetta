import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure, json, type Answer, type RenderedPage } from './fake-api.js';
import { openEnded } from './ended-run-helpers.js';
import {
  cloudRoles,
  deepenEstimate,
  estimatePath,
  measures,
  startPath,
  understanding,
  understandingPath,
} from './understanding-fixtures.js';

// RF-132, RF-143, DEC-148: the Deepen panel does not know the kind of the project, so it shows the
// private-code confirmation once the server asks for it (RST-1521), holds Start until it is
// ticked and sends it. A Deepen that was never refused sends no such field.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const posts = (page: Pick<RenderedPage, 'calls'>) =>
  page.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/deepen'));
const consentBox = /I understand; send masked excerpts to/u;
const privateBox = /my own code from this project/u;

async function opened(start: Answer) {
  const page = await openEnded({
    extra: {
      [understandingPath]: understanding(measures()),
      [estimatePath]: deepenEstimate({ roles: cloudRoles }),
      [startPath]: start,
    },
  });
  fireEvent.click(await within(turn()).findByRole('button', { name: 'Deepen this run' }));
  await screen.findByTestId('deepen-first-round');
  fireEvent.click(screen.getByLabelText(consentBox));
  return page;
}

async function confirmStart(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Start Deepen' }));
  const dialog = await screen.findByRole('dialog', { name: 'Start this Deepen?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and start' }));
}

const accepted = json(202, { id: 'run-new', stage: 'understand' });

it('RF-132 shows the private-code confirmation once the server asks, holds Start and then sends it', async () => {
  const answer: Answer = (call) => {
    const given =
      typeof call.body === 'object' && call.body !== null && 'privateCodeConfirmed' in call.body;
    return given ? accepted : failure(400, 'RST-1521');
  };
  const page = await opened(answer);
  expect(screen.queryByLabelText(privateBox)).toBeNull();

  await confirmStart();
  const box = await screen.findByLabelText(privateBox);

  expect(screen.getByRole('button', { name: 'Start Deepen' })).toHaveProperty('disabled', true);
  fireEvent.click(box);
  await confirmStart();
  await waitFor(() => {
    expect(posts(page).at(-1)?.body).toMatchObject({
      cloudConsent: true,
      privateCodeConfirmed: true,
    });
  });
});

it('RF-132 a Deepen that was not refused sends no such field', async () => {
  const page = await opened(accepted);

  await confirmStart();

  await waitFor(() => {
    expect(posts(page)).toHaveLength(1);
  });
  expect(posts(page)[0]?.body).not.toHaveProperty('privateCodeConfirmed');
});
