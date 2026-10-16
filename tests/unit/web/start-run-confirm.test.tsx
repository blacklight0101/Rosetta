import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import {
  cloudEstimate,
  cloudEstimateAt,
  cloudWithUnpricedVerifier,
  estimatePath,
  localEstimate,
  project,
  projectPath,
  runAnswer,
  runsPath,
} from './start-run-fixtures.js';
import { consentLabel, input, ready, renderStart, start } from './start-run-helpers.js';

// RF-425 (second scenario), DEC-97, DEC-117, P2-08: an understand run whose likely cost is above
// the confirm threshold shows its estimate and asks before it starts. The fixture project asks
// above $0.25; the cloud estimate is $0.12 / $0.39 / $0.80.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const starts = (calls: readonly { method: string; path: string }[]): number =>
  calls.filter((call) => call.method === 'POST' && call.path === runsPath).length;

async function cloudPage(answers: Parameters<typeof renderStart>[0] = {}) {
  const page = renderStart({
    [`GET ${estimatePath}`]: json(200, cloudEstimate),
    [`POST ${runsPath}`]: runAnswer('understand', null),
    [`PUT ${projectPath}/settings`]: json(200, project),
    ...answers,
  });
  await ready();
  fireEvent.click(input(consentLabel));
  return page;
}

it('RF-425 a likely cost above the threshold shows the estimate and starts nothing yet', async () => {
  const { calls } = await cloudPage();

  fireEvent.click(start());

  const dialog = await screen.findByRole('dialog', { name: /Start this run\?/u });
  expect(dialog.textContent).toContain('$0.39');
  expect(dialog.textContent).toContain('$0.12');
  expect(dialog.textContent).toContain('$0.80');
  expect(dialog.textContent).toContain('$0.25');
  expect(within(dialog).getByText(/openai \/ gpt-5-nano/u)).not.toBeNull();
  expect(starts(calls)).toBe(0);
});

it('RF-425 confirming starts the run once', async () => {
  const { calls } = await cloudPage();
  fireEvent.click(start());
  await screen.findByRole('dialog', { name: /Start this run\?/u });

  fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));

  await screen.findByTestId('run-notice');
  expect(starts(calls)).toBe(1);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('RF-425 cancelling starts nothing and leaves Start ready to press again', async () => {
  const { calls } = await cloudPage();
  fireEvent.click(start());
  await screen.findByRole('dialog', { name: /Start this run\?/u });

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(starts(calls)).toBe(0);
  expect(start().disabled).toBe(false);
});

it('RF-425 a likely cost exactly at the threshold starts without asking', async () => {
  const { calls } = await cloudPage({
    [`GET ${estimatePath}`]: json(200, cloudEstimateAt('250000')),
  });

  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(starts(calls)).toBe(1);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('RF-425 a likely cost one micro-dollar above the threshold asks', async () => {
  await cloudPage({ [`GET ${estimatePath}`]: json(200, cloudEstimateAt('250001')) });

  fireEvent.click(start());

  expect(await screen.findByRole('dialog', { name: /Start this run\?/u })).not.toBeNull();
});

it('RF-425 the threshold typed on the page decides, before it is saved', async () => {
  const { calls } = await cloudPage();

  fireEvent.input(input('Ask before a run estimated above (USD)'), { target: { value: '0.50' } });
  fireEvent.click(start());

  await waitFor(() => {
    expect(starts(calls)).toBe(1);
  });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('RF-425 a threshold of zero asks for any run that costs something, and not for one that costs nothing', async () => {
  const paid = await cloudPage();
  fireEvent.input(input('Ask before a run estimated above (USD)'), { target: { value: '0' } });
  fireEvent.click(start());
  expect(await screen.findByRole('dialog', { name: /Start this run\?/u })).not.toBeNull();
  expect(starts(paid.calls)).toBe(0);
});

it('RF-425 a run on local models costs nothing, so it never asks, even with a threshold of zero', async () => {
  const { calls } = renderStart({
    [`GET ${estimatePath}`]: json(200, localEstimate),
    [`POST ${runsPath}`]: runAnswer('understand', null),
    [`PUT ${projectPath}/settings`]: json(200, project),
  });
  await ready();

  fireEvent.input(input('Ask before a run estimated above (USD)'), { target: { value: '0' } });
  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(starts(calls)).toBe(1);
});

it('RF-425 a scan has no estimate to confirm', async () => {
  const { calls } = await cloudPage({ [`POST ${runsPath}`]: runAnswer('scan', null) });

  fireEvent.click(input('Scan only'));
  fireEvent.click(start());

  await screen.findByTestId('run-notice');
  expect(starts(calls)).toBe(1);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('RF-425 RF-427 the figure asked about leaves out a model without a price and says so', async () => {
  await cloudPage({ [`GET ${estimatePath}`]: json(200, cloudWithUnpricedVerifier) });

  fireEvent.click(start());

  const dialog = await screen.findByRole('dialog', { name: /Start this run\?/u });
  expect(dialog.textContent).toContain('at least $0.39');
  expect(dialog.textContent).toContain('openai / gpt-mystery');
  expect(dialog.textContent).toContain('no price');
});

it('RF-425 Escape closes the question with the keyboard and gives the focus back to Start', async () => {
  const { calls } = await cloudPage();
  start().focus();
  fireEvent.click(start());
  const dialog = await screen.findByRole('dialog', { name: /Start this run\?/u });

  fireEvent.keyDown(dialog, { key: 'Escape' });

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(start());
  expect(starts(calls)).toBe(0);
});

describe('the question is asked once for a figure', () => {
  let estimate: Record<string, unknown> = cloudEstimate;

  async function afterAFailedStart() {
    estimate = cloudEstimate;
    const page = await cloudPage({
      [`GET ${estimatePath}`]: () => json(200, estimate),
      [`POST ${runsPath}`]: failure(400, 'RST-2302'),
    });
    fireEvent.click(start());
    await screen.findByRole('dialog', { name: /Start this run\?/u });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and start' }));
    await screen.findByTestId('error-banner');
    return page;
  }

  async function reestimate(next: Record<string, unknown>, calls: readonly { path: string }[]) {
    const before = calls.filter((call) => call.path === estimatePath).length;
    estimate = next;
    fireEvent.click(screen.getByRole('button', { name: 'Re-estimate' }));
    await waitFor(() => {
      expect(calls.filter((call) => call.path === estimatePath).length).toBeGreaterThan(before);
    });
    await ready();
  }

  it('RF-425 pressing Start again after a refused start does not ask again', async () => {
    const { calls } = await afterAFailedStart();

    fireEvent.click(start());

    await waitFor(() => {
      expect(starts(calls)).toBe(2);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('RF-425 a re-estimate with the same or a lower figure does not ask again', async () => {
    const { calls } = await afterAFailedStart();

    await reestimate(cloudEstimateAt('300000'), calls);
    fireEvent.click(start());

    await waitFor(() => {
      expect(starts(calls)).toBe(2);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('RF-425 a re-estimate that raises the figure asks again, with the new figure', async () => {
    const { calls } = await afterAFailedStart();

    await reestimate(cloudEstimateAt('500000'), calls);
    fireEvent.click(start());

    const dialog = await screen.findByRole('dialog', { name: /Start this run\?/u });
    expect(dialog.textContent).toContain('$0.50');
    expect(starts(calls)).toBe(1);
  });

  it('RF-425 a figure that was only cancelled is asked about again', async () => {
    const { calls } = await cloudPage();
    fireEvent.click(start());
    await screen.findByRole('dialog', { name: /Start this run\?/u });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(start());

    expect(await screen.findByRole('dialog', { name: /Start this run\?/u })).not.toBeNull();
    expect(starts(calls)).toBe(0);
  });
});
