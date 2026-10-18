import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { failure, json, type RenderedPage } from './fake-api.js';
import { openEnded, type EndedOptions } from './ended-run-helpers.js';
import {
  cloudRoles,
  deepenEstimate,
  estimatePath,
  measures,
  startPath,
  understanding,
  understandingPath,
} from './understanding-fixtures.js';
import { runPath } from './live-run-helpers.js';

// RF-209, RF-614, RF-425, RF-143, DEC-145: the Deepen action in the "Your turn" panel of a run that
// ended Completed: the estimate of the first round and of all rounds against the run cap, nothing
// started until the owner confirms, the round limit (1 to 5, default 3), the coverage pass and the
// consent where the provider is in the cloud.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const base = { [understandingPath]: understanding(measures()) };

async function opened(extra: EndedOptions['extra'] = {}) {
  const page = await openEnded({
    extra: { ...base, [estimatePath]: deepenEstimate(), ...extra },
  });
  fireEvent.click(await within(turn()).findByRole('button', { name: 'Deepen this run' }));
  await screen.findByTestId('deepen-first-round');
  return page;
}

const posts = (page: Pick<RenderedPage, 'calls'>, suffix: string) =>
  page.calls.filter((call) => call.method === 'POST' && call.path.endsWith(suffix));

const startAnswer = { [startPath]: json(202, { id: 'run-new', stage: 'understand' }) };

async function confirmStart(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Start Deepen' }));
  const dialog = await screen.findByRole('dialog', { name: 'Start this Deepen?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and start' }));
}

describe('RF-209 the Deepen action', () => {
  it('RF-209 offers Deepen on a run that ended Completed and starts nothing by itself', async () => {
    const page = await openEnded({ extra: base });

    expect(await within(turn()).findByRole('button', { name: 'Deepen this run' })).toBeTruthy();
    expect(page.calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('RF-209 offers no Deepen on a run that did not end Completed', async () => {
    await openEnded({ extra: base, endState: 'CapReached' });

    await screen.findByRole('region', { name: 'Your turn' });
    expect(screen.queryByRole('button', { name: 'Deepen this run' })).toBeNull();
  });

  it('RF-209 asks for the estimate with three rounds and the coverage pass ticked', async () => {
    const page = await opened();

    expect(posts(page, '/deepen/estimate').at(-1)?.body).toEqual({
      maxRounds: 3,
      coveragePass: true,
    });
    expect(screen.getByLabelText('Rounds at most')).toHaveProperty('value', '3');
    expect(screen.getByLabelText(/Also read first-party files never read/u)).toHaveProperty(
      'checked',
      true,
    );
    expect(posts(page, '/deepen')).toEqual([]);
  });
});

describe('RF-209 the estimate of a Deepen', () => {
  it('RF-209 shows the first round and all rounds, all rounds as a working ceiling', async () => {
    await opened();

    const first = screen.getByTestId('deepen-first-round').textContent;
    expect(first).toContain('likely $0.40');
    expect(first).toContain('judges 10 claims');
    expect(first).toContain('re-reads 40 rejected claims');
    const all = screen.getByTestId('deepen-all-rounds').textContent;
    expect(all).toContain('Up to 3 rounds');
    expect(all).toContain('likely $1.20');
    expect(all).toContain('a working ceiling, not a maximum');
    expect(all).toContain('The run cap of $2.00 is what stops the run');
  });

  it('RF-209 warns, with a glyph, that all rounds may pass the run cap', async () => {
    await opened();

    const warning = screen.getByTestId('deepen-over-cap');
    expect(warning.textContent).toContain('could pass the run cap');
    expect(warning.querySelector('svg')).not.toBeNull();
  });

  it('RF-209 asks again for the estimate when the round limit or the coverage pass changes', async () => {
    const page = await opened();

    fireEvent.change(screen.getByLabelText('Rounds at most'), { target: { value: '5' } });
    await waitFor(() => {
      expect(posts(page, '/deepen/estimate').at(-1)?.body).toEqual({
        maxRounds: 5,
        coveragePass: true,
      });
    });
    fireEvent.click(screen.getByLabelText(/Also read first-party files never read/u));
    await waitFor(() => {
      expect(posts(page, '/deepen/estimate').at(-1)?.body).toEqual({
        maxRounds: 5,
        coveragePass: false,
      });
    });
  });

  it('RF-209 offers the round limits 1 to 5', async () => {
    await opened();

    const options = within(screen.getByLabelText('Rounds at most')).getAllByRole('option');
    expect(options.map((each) => each.textContent)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('RF-209 starting a Deepen', () => {
  it('RF-209 starts nothing until the owner confirms, then starts and opens the new run', async () => {
    const page = await opened(startAnswer);

    fireEvent.click(screen.getByRole('button', { name: 'Start Deepen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start this Deepen?' });
    expect(posts(page, '/deepen')).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and start' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/runs/run-new');
    });
    expect(posts(page, '/deepen').at(-1)?.body).toEqual({
      ...{ confirmed: true, maxRounds: 3, coveragePass: true },
      cloudConsent: false,
    });
  });

  it('RF-1105 keeps the page and shows the refusal when the run is not found', async () => {
    const page = await opened({ [startPath]: failure(404, 'RST-2003') });

    await confirmStart();

    expect(await screen.findByText('Message of RST-2003.')).toBeTruthy();
    expect(window.location.pathname).not.toContain('run-new');
    expect(posts(page, '/deepen')).toHaveLength(1);
  });
});

describe('RF-143 a Deepen whose provider is in the cloud', () => {
  const cloud = { [estimatePath]: deepenEstimate({ roles: cloudRoles }) };

  it('RF-143 asks for the consent and keeps Start off until it is given', async () => {
    await opened(cloud);

    const start = screen.getByRole('button', { name: 'Start Deepen' });
    expect(start.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Code will leave this machine.')).toBeTruthy();
  });

  it('RF-143 sends the consent with the confirmation', async () => {
    const page = await opened({ ...cloud, ...startAnswer });

    fireEvent.click(screen.getByLabelText(/I understand; send masked excerpts to/u));
    await confirmStart();

    await waitFor(() => {
      expect(posts(page, '/deepen').at(-1)?.body).toMatchObject({ cloudConsent: true });
    });
  });
});

it('RF-209 uses the run of this page for the estimate', async () => {
  const page = await opened();

  expect(posts(page, '/deepen/estimate').at(-1)?.path).toBe(`${runPath}/deepen/estimate`);
});
