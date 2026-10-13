import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { AdminSnapshotsPage } from '../../../web/src/pages/AdminSnapshotsPage.js';
import { ana, failure, json, renderPage, type Answer } from './fake-api.js';
import { olderSnapshot, unusedSnapshot, webformsSnapshot } from './history-fixtures.js';

// RF-1012, RF-1102, P1-40: `/admin/snapshots`, the downloaded snapshots with their size and last use
// for the administrator, and the deletion of one that no run in progress uses.

const listPath = 'GET /api/admin/snapshots';
const snapshots = [webformsSnapshot, olderSnapshot, unusedSnapshot];
const admin = { ...ana, role: 'admin' } as const;

function renderSnapshots(answers: Readonly<Record<string, Answer>> = {}) {
  return renderPage(
    <AdminSnapshotsPage />,
    { [listPath]: json(200, { snapshots }), ...answers },
    admin,
  );
}

async function rowOf(text: string): Promise<HTMLElement> {
  const row = (await screen.findByText(text)).closest('tr');
  if (row === null) throw new Error(`No row for ${text}.`);
  return row;
}

describe('snapshots table', () => {
  it('RF-1012 lists each snapshot with its commit, download time, files, size and use', async () => {
    renderSnapshots();

    const table = await screen.findByRole('table', { name: 'Downloaded snapshots' });

    expect(screen.getByRole('heading', { name: 'Downloaded snapshots', level: 1 })).not.toBeNull();
    const first = within(table).getAllByRole('row')[1];
    if (first === undefined) throw new Error('The table has no row.');
    for (const text of ['octo/webforms', 'a1b2c3d', '2026-10-11 09:11', '412', '18.4 MB']) {
      expect(within(first).getByText(text)).not.toBeNull();
    }
    expect(within(first).getByText('3 runs, 1 running')).not.toBeNull();
    expect(within(first).getByText('last used 2026-10-11 09:12')).not.toBeNull();
  });

  it('RF-1012 says how many runs use an older snapshot and that an unused one is unused', async () => {
    renderSnapshots();

    const older = within(await rowOf('18.1 MB'));
    const unused = within(await rowOf('octo/demo'));

    expect(older.getByText('1 run')).not.toBeNull();
    expect(unused.getByText('unused')).not.toBeNull();
    expect(unused.queryByText(/last used/u)).toBeNull();
  });
});

describe('snapshots table, states', () => {
  it('RF-1012 disables Delete for a snapshot that a run in progress uses, with the reason', async () => {
    renderSnapshots();

    const used = within(await rowOf('18.4 MB'));

    const button = used.getByRole('button', {
      name: /^Delete \(in use\): snapshot octo\/webforms/u,
    });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('title')).toBe('In use by a running run');
  });

  it('RF-1012 says so when no snapshot is downloaded', async () => {
    renderSnapshots({ [listPath]: json(200, { snapshots: [] }) });

    expect(await screen.findByText(/No snapshots are downloaded/u)).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('RF-1102 shows the refusal and no table to a user who is not the administrator', async () => {
    renderSnapshots({ [listPath]: failure(403, 'RST-2102') });

    expect((await screen.findByTestId('error-banner-code')).textContent).toBe('RST-2102');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('deleting a snapshot', () => {
  const olderName = /^Delete: snapshot octo\/webforms 0f1e2d3/u;
  const olderKey = encodeURIComponent(olderSnapshot.key);

  it('RF-1012 asks first, naming the folder and the space it frees', async () => {
    renderSnapshots();
    fireEvent.click(within(await rowOf('18.1 MB')).getByRole('button', { name: olderName }));

    const dialog = screen.getByRole('dialog', { name: 'Delete snapshot octo/webforms 0f1e2d3?' });

    expect(dialog.textContent).toContain(`sources/${olderSnapshot.key}`);
    expect(dialog.textContent).toContain('18.1 MB');
    expect(dialog.textContent).toContain('reports and cards');
    expect(dialog.textContent).toContain('This cannot be undone.');
  });

  it('RF-1012 deletes the snapshot after the confirmation and says how much space it freed', async () => {
    const page = renderSnapshots({
      [`DELETE /api/admin/snapshots/${olderKey}`]: json(200, { freedBytes: 18_100_000 }),
    });
    fireEvent.click(within(await rowOf('18.1 MB')).getByRole('button', { name: olderName }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete snapshot' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: olderName })).toBeNull();
    });
    expect(screen.getByRole('status').textContent).toContain('18.1 MB freed');
    expect(page.calls.find((each) => each.method === 'DELETE')).toMatchObject({
      path: `/api/admin/snapshots/${olderKey}`,
      csrf: 'csrf-0',
    });
  });

  it('RF-1012 keeps the snapshot and shows the refusal when a run started to use it', async () => {
    renderSnapshots({ [`DELETE /api/admin/snapshots/${olderKey}`]: failure(409, 'RST-2306') });
    fireEvent.click(within(await rowOf('18.1 MB')).getByRole('button', { name: olderName }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete snapshot' }));

    expect((await screen.findByTestId('error-banner-code')).textContent).toBe('RST-2306');
    expect(screen.getByRole('button', { name: olderName })).not.toBeNull();
  });
});
