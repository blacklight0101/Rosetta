import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, type Answer, type RenderedPage } from './fake-api.js';
import { openEnded } from './ended-run-helpers.js';
import {
  cloudEstimate as planCloudEstimate,
  cloudProject,
  savedBrief,
} from './plan-setup-fixtures.js';
import { base, ready as planReady, renderPlan } from './plan-setup-helpers.js';
import {
  cloudEstimate,
  estimatePath as startEstimatePath,
  runAnswer,
  runsPath,
} from './start-run-fixtures.js';
import { consentLabel, ready as startReady, renderStart, start } from './start-run-helpers.js';
import {
  cloudRoles,
  deepenEstimate,
  estimatePath,
  measures,
  startPath,
  understanding,
  understandingPath,
} from './understanding-fixtures.js';

// RF-143, RF-209, DEC-209 (P8-81): while a consent of the project holds for the roles a page starts,
// the start page, the Deepen panel and Plan setup show one line with the date it was given, the
// providers and Withdraw instead of the boxes, and the start sends no box. Withdraw withdraws the
// consent and the boxes come back. With no consent that holds, the boxes show as before.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const consentPath = `${base}/consent`;
const heldConsent = {
  consent: {
    id: 'c-1',
    givenAt: '2026-11-03T09:00:00.000Z',
    endsAt: '2026-12-03T09:00:00.000Z',
    providers: ['anthropic'],
    kinds: ['cloud'],
  },
};
const lineText =
  "You agreed on 3 Nov 2026 to send masked excerpts of your own code from this project to Anthropic. It lasts until 3 Dec 2026, or until a role's provider changes.";
const anyConsentBox = /I understand; send masked excerpts/u;

/** The consent holds until it is withdrawn; the read answers what the store now holds. */
function consentStore(): Readonly<Record<string, Answer>> {
  let held = true;
  return {
    [`GET ${consentPath}`]: () => json(200, held ? heldConsent : { consent: null }),
    [`DELETE ${consentPath}`]: () => {
      held = false;
      return json(200, { withdrawn: 1 });
    },
  };
}

const reads = (page: Pick<RenderedPage, 'calls'>, start: string) =>
  page.calls.filter((call) => call.method === 'GET' && call.path === `${consentPath}?for=${start}`);

async function withdraws(page: Pick<RenderedPage, 'calls'>): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
  await waitFor(() => {
    expect(page.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
  });
}

describe('RF-143 the consent line of the start page', () => {
  async function cloudStart(answers: Readonly<Record<string, Answer>>) {
    const page = renderStart({
      [`GET ${startEstimatePath}`]: json(200, cloudEstimate),
      [`POST ${runsPath}`]: runAnswer('understand', null),
      ...answers,
    });
    await startReady();
    return page;
  }

  it('RF-143 P8-81 a consent that holds shows one line, no box, and Start does not wait for it', async () => {
    const page = await cloudStart(consentStore());

    const line = await screen.findByText(lineText);

    expect(line).toBeTruthy();
    expect(reads(page, 'understand')).not.toHaveLength(0);
    expect(screen.queryByLabelText(consentLabel)).toBeNull();
    expect(start().disabled).toBe(false);
  });

  it('RF-143 P8-81 Withdraw withdraws the consent and the box comes back', async () => {
    const page = await cloudStart(consentStore());
    await screen.findByText(lineText);

    await withdraws(page);

    expect(await screen.findByLabelText(consentLabel)).toBeTruthy();
    expect(screen.queryByText(lineText)).toBeNull();
    expect(start().disabled).toBe(true);
  });

  it('RF-143 P8-81 with no consent that holds the box shows as before', async () => {
    await cloudStart({ [`GET ${consentPath}`]: json(200, { consent: null }) });

    expect(await screen.findByLabelText(consentLabel)).toBeTruthy();
    expect(screen.queryByText(/^You agreed on/u)).toBeNull();
  });
});

describe('RF-209 the consent line of the Deepen panel', () => {
  const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
  const startDeepen = (): HTMLButtonElement => {
    const button = screen.getByRole('button', { name: 'Start Deepen' });
    if (!(button instanceof HTMLButtonElement)) throw new Error('Not a button.');
    return button;
  };

  async function openedPanel() {
    const page = await openEnded({
      extra: {
        [understandingPath]: understanding(measures()),
        [estimatePath]: deepenEstimate({ roles: cloudRoles }),
        [startPath]: json(202, { id: 'run-new', stage: 'understand' }),
        ...consentStore(),
      },
    });
    fireEvent.click(await within(turn()).findByRole('button', { name: 'Deepen this run' }));
    await screen.findByTestId('deepen-first-round');
    return page;
  }

  it('RF-209 P8-81 a consent that holds shows the line, and the start sends no box', async () => {
    const page = await openedPanel();
    await screen.findByText(lineText);

    expect(screen.queryByLabelText(anyConsentBox)).toBeNull();
    expect(startDeepen().disabled).toBe(false);
    fireEvent.click(startDeepen());
    const dialog = await screen.findByRole('dialog', { name: 'Start this Deepen?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and start' }));

    await waitFor(() => {
      expect(page.calls.filter((call) => call.path.endsWith('/deepen'))).toHaveLength(1);
    });
    const posted = page.calls.find((call) => call.path.endsWith('/deepen'));
    expect(posted?.body).not.toMatchObject({ cloudConsent: true });
    expect(posted?.body).not.toHaveProperty('privateCodeConfirmed');
  });

  it('RF-209 P8-81 Withdraw brings the consent box back and Start Deepen waits for it', async () => {
    const page = await openedPanel();
    await screen.findByText(lineText);

    await withdraws(page);

    expect(await screen.findByLabelText(anyConsentBox)).toBeTruthy();
    expect(startDeepen().disabled).toBe(true);
  });
});

describe('RF-143 the consent line of Plan setup', () => {
  function renderCloudPlan() {
    return renderPlan({
      [`GET ${base}`]: json(200, cloudProject),
      [`GET ${base}/planning-brief`]: json(200, savedBrief),
      [`GET ${base}/plan-estimate`]: json(200, planCloudEstimate),
      ...consentStore(),
    });
  }

  it('RF-143 P8-81 a consent that holds for the planner shows the line and no box', async () => {
    const page = renderCloudPlan();
    await planReady();

    expect(await screen.findByText(lineText)).toBeTruthy();
    expect(reads(page, 'plan')).not.toHaveLength(0);
    expect(screen.queryByRole('checkbox', { name: anyConsentBox })).toBeNull();
    const write = screen.getByRole('button', { name: /^Start the plan/u });
    expect(write.getAttribute('title') ?? '').not.toContain('consent');
  });

  it('RF-143 P8-81 Withdraw brings the consent box back', async () => {
    const page = renderCloudPlan();
    await planReady();
    await screen.findByText(lineText);

    await withdraws(page);

    expect(await screen.findByRole('checkbox', { name: anyConsentBox })).toBeTruthy();
  });
});
