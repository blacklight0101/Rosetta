import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import type { AccountTotals } from '../../../web/src/api/cost-schemas.js';
import { App } from '../../../web/src/app/App.js';
import type { RouteDefinition } from '../../../web/src/app/route-types.js';
import { useAnnounceUsage } from '../../../web/src/app/usage-signal.js';
import { adminTotals, usageTotals, userTotals } from './cost-fixtures.js';
import { json } from './fake-api.js';

// RF-1010, RF-1106, DEC-49, P1-36: the totals pill in every signed-in header ("Your total" from the
// ledger; the administrator also sees the server month against the cap), read again when a page
// announces a model call, and the administrator's cap banner from 80% on every page.

const ana = { id: 'u-1', userName: 'ana', displayName: 'Ana Ruiz', role: 'user', state: 'Active' };

/** A page that announces a model call each time its button is pressed, like the live run page. */
function RunningPage(): JSX.Element {
  const [turns, setTurns] = useState(0);
  useAnnounceUsage(turns);
  return (
    <button
      type="button"
      onClick={() => {
        setTurns(turns + 1);
      }}
    >
      Model call
    </button>
  );
}

const routes: readonly RouteDefinition[] = [
  {
    path: '/projects',
    title: 'Projects',
    access: 'user',
    chrome: 'shell',
    component: () => <h1>Projects</h1>,
  },
  {
    path: '/projects/:projectId/start',
    title: 'Start',
    access: 'user',
    chrome: 'shell',
    component: RunningPage,
  },
  {
    path: '/admin/users',
    title: 'Users',
    access: 'admin',
    chrome: 'shell',
    component: () => <h1>Users</h1>,
  },
];

function appAt(path: string, role: 'user' | 'admin', totals: () => AccountTotals) {
  window.history.pushState({}, '', path);
  const asked: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    asked.push(url);
    if (url === '/api/account/totals') return Promise.resolve(json(200, totals()));
    return Promise.resolve(json(200, { user: { ...ana, role }, csrfToken: 'csrf-1' }));
  };
  render(<App client={createApiClient({ fetch: fetchFn })} routes={routes} assign={vi.fn()} />);
  return { totalsCalls: () => asked.filter((url) => url === '/api/account/totals').length };
}

const pill = () => screen.findByTestId('header-totals');

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('totals pill', () => {
  it('RF-1010 shows the user total tokens (input, output, cached) and cost from the ledger', async () => {
    appAt('/projects', 'user', () => userTotals);

    const totals = await pill();

    await waitFor(() => {
      expect(totals.textContent).toContain('Your total');
    });
    expect(totals.textContent).toContain('1,280,000 tokens');
    expect(totals.textContent).toContain('$3.88');
    expect(totals.textContent).toContain('in 1,200,000');
    expect(totals.textContent).toContain('out 80,000');
    expect(totals.textContent).toContain('cached 22,118');
    expect(totals.textContent).not.toContain('Server, this month');
  });

  it('RF-1010 links to the breakdown of the open project, one click away', async () => {
    appAt('/projects/p-1/start', 'user', () => userTotals);

    const link = await within(await pill()).findByRole('link', { name: /Your total/u });

    expect(link.getAttribute('href')).toBe('/projects/p-1/cost');
  });

  it('RF-1010 RF-1106 the administrator also sees the server month against the cap', async () => {
    appAt('/projects', 'admin', () => adminTotals());

    const totals = await pill();

    await waitFor(() => {
      expect(totals.textContent).toContain('Server, this month');
    });
    expect(totals.textContent).toContain('$8.50 of $10.00');
  });
});

describe('totals pill for a local-only account', () => {
  it('P5-07 shows tokens and no dollar amount when every call ran on a local model', async () => {
    appAt('/projects', 'user', () => ({ ...userTotals, local: true }));

    const totals = await pill();

    await waitFor(() => {
      expect(totals.textContent).toContain('Your total');
    });
    expect(totals.textContent).toContain('1,280,000 tokens');
    expect(totals.textContent).not.toContain('$');
  });

  it('P5-07 keeps the dollars of an account with a priced model', async () => {
    appAt('/projects', 'user', () => ({ ...userTotals, local: false }));

    const totals = await pill();

    await waitFor(() => {
      expect(totals.textContent).toContain('$3.88');
    });
  });
});

describe('totals pill during a run', () => {
  it('RF-1010 reads the ledger again when a page announces a model call, without a reload', async () => {
    let answer = userTotals;
    const { totalsCalls } = appAt('/projects/p-1/start', 'user', () => answer);
    const totals = await pill();
    await waitFor(() => {
      expect(totals.textContent).toContain('$3.88');
    });

    answer = {
      totals: usageTotals({ cost: [{ currency: 'USD', costMicros: '4100000' }] }),
      local: false,
      server: null,
    };
    fireEvent.click(screen.getByRole('button', { name: 'Model call' }));

    await waitFor(() => {
      expect(totals.textContent).toContain('$4.10');
    });
    expect(totalsCalls()).toBe(2);
  });
});

describe('cap banner', () => {
  it('RF-1106 warns the administrator on every page from 80% of the server monthly cap', async () => {
    appAt('/projects', 'admin', () => adminTotals());

    const banner = await screen.findByText(/The server has used 85% of its monthly cap/u);

    expect(banner).not.toBeNull();
  });

  it('RF-1106 shows no banner below 80%, and none to a user', async () => {
    appAt('/projects', 'admin', () => adminTotals('7990000'));
    await waitFor(async () => {
      expect((await pill()).textContent).toContain('$7.99 of $10.00');
    });
    expect(screen.queryByText(/of its monthly cap/u)).toBeNull();
  });

  it('RF-1106 shows the banner of an administration page in the shell slot, linked to the caps form', async () => {
    appAt('/admin/users', 'admin', () => adminTotals());

    const slot = await screen.findByTestId('shell-banners');

    await waitFor(() => {
      expect(slot.textContent).toContain('The server has used 85% of its monthly cap');
    });
    expect(within(slot).getByRole('link', { name: 'Review caps' }).getAttribute('href')).toBe(
      '#caps',
    );
  });

  it('RF-1106 the banner of another page links to the users and caps page', async () => {
    appAt('/projects', 'admin', () => adminTotals());

    const slot = await screen.findByTestId('shell-banners');

    expect(within(slot).getByRole('link', { name: 'Review caps' }).getAttribute('href')).toBe(
      '/admin/users',
    );
  });
});
